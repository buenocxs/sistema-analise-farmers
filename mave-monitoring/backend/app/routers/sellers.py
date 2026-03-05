from datetime import date as date_type, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Seller, Conversation, ConversationAnalysis, DailyMetric, Message
from app.services.query_filters import apply_conversation_exclusions
from app.schemas import SellerCreate, SellerUpdate
from app.auth import get_current_user
from app.services.phone_normalizer import normalize_phone
from app.jobs.task_manager import create_task, run_background
from app.jobs.sync_conversations import sync_seller_conversations
from app.jobs.analyze_conversations import analyze_seller_conversations

router = APIRouter(prefix="/sellers", tags=["sellers"])


def _seller_base_dict(seller: Seller) -> dict:
    """Convert seller to dict (base fields only)."""
    return {
        "id": seller.id,
        "name": seller.name,
        "phone": seller.phone,
        "team": seller.team,
        "instance_name": seller.instance_name,
        "zapi_instance_id": seller.zapi_instance_id,
        "zapi_instance_token": seller.zapi_instance_token,
        "is_active": seller.is_active,
        "active": seller.is_active,
        "created_at": seller.created_at.isoformat() if seller.created_at else None,
        "updated_at": seller.updated_at.isoformat() if seller.updated_at else None,
    }


async def _seller_to_dict(db: AsyncSession, seller: Seller) -> dict:
    """Convert seller to dict with computed fields (single seller detail)."""
    q_count = select(func.count(Conversation.id)).where(Conversation.seller_id == seller.id)
    q_count = apply_conversation_exclusions(q_count)
    total_convs = (await db.execute(q_count)).scalar() or 0

    q_score = (
        select(func.avg(ConversationAnalysis.quality_score))
        .join(Conversation)
        .where(Conversation.seller_id == seller.id)
    )
    q_score = apply_conversation_exclusions(q_score)
    avg_score = (await db.execute(q_score)).scalar()

    avg_rt = (await db.execute(
        select(func.avg(DailyMetric.avg_response_time_seconds))
        .where(DailyMetric.seller_id == seller.id)
    )).scalar()

    metrics_result = await db.execute(
        select(DailyMetric)
        .where(DailyMetric.seller_id == seller.id)
        .order_by(DailyMetric.date.desc())
        .limit(30)
    )
    recent_metrics = [
        {
            "date": str(m.date),
            "conversations_started": m.conversations_started,
            "messages_sent": m.messages_sent,
            "quality_avg": m.quality_avg,
            "response_under_5min": m.response_under_5min,
            "response_5_30min": m.response_5_30min,
            "response_30_60min": m.response_30_60min,
            "response_over_60min": m.response_over_60min,
        }
        for m in metrics_result.scalars().all()
    ]

    d = _seller_base_dict(seller)
    d.update({
        "total_conversations": total_convs,
        "avg_score": round(avg_score, 1) if avg_score else None,
        "avg_response_time_seconds": round(avg_rt, 0) if avg_rt else None,
        "recent_metrics": recent_metrics,
    })
    return d


async def _batch_seller_stats(db: AsyncSession, seller_ids: list[int]) -> dict:
    """Fetch aggregated stats for multiple sellers in batch (3 queries instead of N*4)."""
    if not seller_ids:
        return {}

    # 1) Total conversations per seller
    q_conv = (
        select(Conversation.seller_id, func.count(Conversation.id))
        .where(Conversation.seller_id.in_(seller_ids))
        .group_by(Conversation.seller_id)
    )
    q_conv = apply_conversation_exclusions(q_conv)
    conv_counts = dict((await db.execute(q_conv)).all())

    # 2) Avg quality score per seller
    q_scores = (
        select(Conversation.seller_id, func.avg(ConversationAnalysis.quality_score))
        .join(Conversation)
        .where(Conversation.seller_id.in_(seller_ids))
        .group_by(Conversation.seller_id)
    )
    q_scores = apply_conversation_exclusions(q_scores)
    avg_scores = dict((await db.execute(q_scores)).all())

    # 3) Avg response time per seller
    avg_rts = dict((await db.execute(
        select(DailyMetric.seller_id, func.avg(DailyMetric.avg_response_time_seconds))
        .where(DailyMetric.seller_id.in_(seller_ids))
        .group_by(DailyMetric.seller_id)
    )).all())

    stats = {}
    for sid in seller_ids:
        total = conv_counts.get(sid, 0)
        score = avg_scores.get(sid)
        rt = avg_rts.get(sid)
        stats[sid] = {
            "total_conversations": total,
            "avg_score": round(score, 1) if score else None,
            "avg_response_time_seconds": round(rt, 0) if rt else None,
            "recent_metrics": [],  # populated below only if needed
        }
    return stats


@router.get("")
async def list_sellers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    team: str | None = None,
    active: bool | None = None,
    limit: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = select(Seller).order_by(Seller.name)
    count_q = select(func.count(Seller.id))

    if search:
        pattern = f"%{search}%"
        filter_ = Seller.name.ilike(pattern) | Seller.phone.ilike(pattern) | Seller.team.ilike(pattern)
        q = q.where(filter_)
        count_q = count_q.where(filter_)
    if team:
        q = q.where(Seller.team == team)
        count_q = count_q.where(Seller.team == team)
    if active is not None:
        q = q.where(Seller.is_active == active)
        count_q = count_q.where(Seller.is_active == active)

    total = (await db.execute(count_q)).scalar() or 0

    effective_limit = limit or page_size
    offset = (page - 1) * effective_limit
    q = q.offset(offset).limit(effective_limit)

    result = await db.execute(q)
    sellers = result.scalars().all()

    # Batch fetch stats for all sellers on this page (3 queries instead of N*4)
    seller_ids = [s.id for s in sellers]
    stats = await _batch_seller_stats(db, seller_ids)

    items = []
    for s in sellers:
        d = _seller_base_dict(s)
        d.update(stats.get(s.id, {"total_conversations": 0, "avg_score": None, "avg_response_time_seconds": None, "recent_metrics": []}))
        items.append(d)

    total_pages = max(1, (total + effective_limit - 1) // effective_limit)
    return {"items": items, "sellers": items, "total": total, "total_pages": total_pages, "page": page}


@router.get("/{seller_id}")
async def get_seller(seller_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")
    return await _seller_to_dict(db, seller)


@router.post("")
async def create_seller(body: SellerCreate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    normalized = normalize_phone(body.phone)
    existing = await db.execute(select(Seller).where(Seller.phone == normalized))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Telefone já cadastrado")

    is_active = body.active if body.active is not None else body.is_active
    seller = Seller(
        name=body.name,
        phone=normalized,
        team=body.team,
        instance_name=body.instance_name,
        zapi_instance_id=body.zapi_instance_id,
        zapi_instance_token=body.zapi_instance_token,
        is_active=is_active,
    )
    db.add(seller)
    await db.flush()
    return await _seller_to_dict(db, seller)


@router.put("/{seller_id}")
async def update_seller(seller_id: int, body: SellerUpdate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")

    update_data = body.model_dump(exclude_unset=True)
    # Normalize active → is_active
    if "active" in update_data:
        update_data["is_active"] = update_data.pop("active")
    if "phone" in update_data:
        update_data["phone"] = normalize_phone(update_data["phone"])
    for key, value in update_data.items():
        setattr(seller, key, value)

    await db.flush()
    return await _seller_to_dict(db, seller)


@router.delete("/{seller_id}")
async def delete_seller(seller_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    from sqlalchemy import delete as sql_delete
    from app.models import Alert, ConversationAnalysis, Message

    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")

    # Get conversation IDs for this seller
    conv_ids_result = await db.execute(
        select(Conversation.id).where(Conversation.seller_id == seller_id)
    )
    conv_ids = [row[0] for row in conv_ids_result.all()]

    if conv_ids:
        # Bulk delete related records using SQL DELETE (no N+1)
        await db.execute(sql_delete(Alert).where(Alert.conversation_id.in_(conv_ids)))
        await db.execute(sql_delete(ConversationAnalysis).where(ConversationAnalysis.conversation_id.in_(conv_ids)))
        await db.execute(sql_delete(Message).where(Message.conversation_id.in_(conv_ids)))
        await db.execute(sql_delete(Conversation).where(Conversation.seller_id == seller_id))

    # Delete seller-level alerts and daily metrics
    await db.execute(sql_delete(Alert).where(Alert.seller_id == seller_id))
    await db.execute(sql_delete(DailyMetric).where(DailyMetric.seller_id == seller_id))
    await db.delete(seller)
    return {"ok": True}


@router.get("/{seller_id}/conversations")
async def get_seller_conversations(
    seller_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")

    seller_info = {"id": seller.id, "name": seller.name}

    q = select(Conversation).where(Conversation.seller_id == seller_id).order_by(Conversation.last_message_at.desc().nulls_last())
    count_q = select(func.count(Conversation.id)).where(Conversation.seller_id == seller_id)

    # Exclude blocked + invalid phones
    q = apply_conversation_exclusions(q)
    count_q = apply_conversation_exclusions(count_q)

    if date_from:
        q = q.where(Conversation.started_at >= date_from)
        count_q = count_q.where(Conversation.started_at >= date_from)
    if date_to:
        date_to_next = str(date_type.fromisoformat(date_to) + timedelta(days=1))
        q = q.where(Conversation.started_at < date_to_next)
        count_q = count_q.where(Conversation.started_at < date_to_next)

    total = (await db.execute(count_q)).scalar() or 0
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    conversations = result.scalars().all()

    items = []
    for c in conversations:
        analysis_dict = None
        if c.analysis:
            analysis_dict = {
                "sentiment_label": c.analysis.sentiment_label,
                "quality_score": c.analysis.quality_score,
                "stage": c.analysis.stage,
            }
        items.append({
            "id": c.id,
            "seller_id": c.seller_id,
            "customer_name": c.customer_name,
            "customer_phone": c.customer_phone,
            "message_count": c.message_count,
            "started_at": c.started_at.isoformat() if c.started_at else None,
            "last_message_at": c.last_message_at.isoformat() if c.last_message_at else None,
            "status": c.status,
            "is_group": c.is_group,
            "seller": seller_info,
            "analysis": analysis_dict,
        })

    return {"conversations": items, "items": items, "total": total}


@router.post("/{seller_id}/sync-conversations")
async def sync_seller(seller_id: int, days: int = Query(7), db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")
    task_id = create_task()
    run_background(sync_seller_conversations(seller_id, task_id, days))
    return {"task_id": task_id, "total": 0}


@router.post("/{seller_id}/analyze-conversations")
async def analyze_seller(seller_id: int, force: bool = Query(False), db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")
    q_convs = select(func.count(Conversation.id)).where(Conversation.seller_id == seller_id)
    q_convs = apply_conversation_exclusions(q_convs)
    convs = (await db.execute(q_convs)).scalar() or 0
    task_id = create_task(total=convs)
    run_background(analyze_seller_conversations(seller_id, task_id, force))
    return {"task_id": task_id, "total": convs}


@router.post("/{seller_id}/recalculate-metrics")
async def recalculate_metrics(seller_id: int, days: int = Query(30), db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")
    task_id = create_task()
    run_background(_recalculate_metrics(seller_id, task_id, days))
    return {"task_id": task_id}


@router.post("/{seller_id}/setup-webhooks")
async def setup_seller_webhooks(seller_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    """Configure Z-API webhook URLs for a seller (received + sent messages)."""
    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller or not seller.zapi_instance_id or not seller.zapi_instance_token:
        raise HTTPException(status_code=404, detail="Vendedor sem credenciais Z-API")
    from app.services.zapi_client import ZAPIClient
    from app.config import get_settings
    settings = get_settings()
    if settings.APP_ENV == "production":
        base_url = "https://sistema-analise-farmers-production.up.railway.app"
    else:
        base_url = "http://localhost:8002"
    webhook_url = f"{base_url}/api/webhook/zapi/{seller_id}"
    client = ZAPIClient(seller.zapi_instance_id, seller.zapi_instance_token)
    results = await client.setup_all_webhooks(webhook_url)
    return {"seller_id": seller_id, "webhook_url": webhook_url, "results": results}


async def _recalculate_metrics(seller_id: int, task_id: str, days: int):
    """Compute daily_metrics from messages for the given seller."""
    from datetime import date, timedelta
    from app.database import async_session as get_session
    from app.jobs.task_manager import update_task, complete_task, fail_task

    try:
        async with get_session() as db:
            end_date = date.today()
            start_date = end_date - timedelta(days=days)

            # Get all messages for this seller in the date range
            msg_q = (
                select(Message)
                .join(Conversation)
                .where(and_(
                    Conversation.seller_id == seller_id,
                    func.date(Message.timestamp) >= start_date,
                    func.date(Message.timestamp) <= end_date,
                ))
                .order_by(Message.conversation_id, Message.timestamp)
            )
            msg_result = await db.execute(msg_q)
            messages = msg_result.scalars().all()

            # Group messages by date
            from collections import defaultdict
            daily = defaultdict(lambda: {
                "conversations": set(),
                "messages_sent": 0,
                "response_times": [],
            })

            # Group messages by conversation for response time calc
            conv_msgs = defaultdict(list)
            for m in messages:
                conv_msgs[m.conversation_id].append(m)
                day = m.timestamp.date()
                daily[day]["messages_sent"] += 1
                daily[day]["conversations"].add(m.conversation_id)

            # Calculate response times per conversation
            for conv_id, msgs in conv_msgs.items():
                for i in range(1, len(msgs)):
                    prev = msgs[i - 1]
                    curr = msgs[i]
                    # Response time = seller reply after customer message
                    if not prev.from_me and curr.from_me:
                        diff = (curr.timestamp - prev.timestamp).total_seconds()
                        if 0 < diff < 86400:  # ignore > 24h
                            day = curr.timestamp.date()
                            daily[day]["response_times"].append(diff)

            # Get quality scores for conversations
            conv_ids = list(set(m.conversation_id for m in messages))
            quality_map = {}
            if conv_ids:
                from app.models import ConversationAnalysis
                qa_result = await db.execute(
                    select(ConversationAnalysis.conversation_id, ConversationAnalysis.quality_score)
                    .where(ConversationAnalysis.conversation_id.in_(conv_ids))
                )
                for cid, score in qa_result.all():
                    if score is not None:
                        quality_map[cid] = score

            # Upsert daily_metrics
            days_processed = 0
            for day, data in sorted(daily.items()):
                existing = await db.execute(
                    select(DailyMetric).where(and_(
                        DailyMetric.seller_id == seller_id,
                        DailyMetric.date == day,
                    ))
                )
                metric = existing.scalar_one_or_none()
                if not metric:
                    metric = DailyMetric(seller_id=seller_id, date=day)
                    db.add(metric)

                metric.conversations_started = len(data["conversations"])
                metric.messages_sent = data["messages_sent"]

                # Avg quality for conversations active on this day
                scores = [quality_map[cid] for cid in data["conversations"] if cid in quality_map]
                metric.quality_avg = round(sum(scores) / len(scores), 1) if scores else None

                rts = data["response_times"]
                metric.avg_response_time_seconds = round(sum(rts) / len(rts), 1) if rts else None

                metric.response_under_5min = sum(1 for r in rts if r < 300)
                metric.response_5_30min = sum(1 for r in rts if 300 <= r < 1800)
                metric.response_30_60min = sum(1 for r in rts if 1800 <= r < 3600)
                metric.response_over_60min = sum(1 for r in rts if r >= 3600)

                days_processed += 1

            await db.commit()
            complete_task(task_id, {"days_processed": days_processed, "messages_analyzed": len(messages)})
    except Exception as e:
        fail_task(task_id, str(e))
