import io
import csv
from datetime import date as date_type, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Seller, Conversation, Message, ConversationAnalysis, ManagerNote, User, ExcludedNumber
from app.services.query_filters import apply_conversation_exclusions
from app.auth import get_current_user
from app.jobs.task_manager import create_task, run_background
from app.jobs.sync_conversations import sync_seller_conversations
from app.jobs.analyze_conversations import analyze_seller_conversations, analyze_single_conversation

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _conv_to_dict(conv, seller=None, analysis=None, messages=None):
    analysis_dict = None
    if analysis:
        analysis_dict = {
            "sentiment_label": analysis.sentiment_label,
            "sentiment_score": analysis.sentiment_score,
            "quality_score": analysis.quality_score,
            "quality_breakdown": analysis.quality_breakdown,
            "stage": analysis.stage,
            "tone": analysis.tone,
            "summary": analysis.summary,
            "keywords": analysis.keywords,
            "objections": analysis.objections,
            "objections_handled": analysis.objections_handled,
            "analyzed_at": analysis.analyzed_at.isoformat() if analysis.analyzed_at else None,
        }

    result = {
        "id": conv.id,
        "seller_id": conv.seller_id,
        "customer_name": conv.customer_name,
        "customer_phone": conv.customer_phone,
        "message_count": conv.message_count,
        "started_at": conv.started_at.isoformat() if conv.started_at else None,
        "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
        "status": conv.status,
        "is_group": conv.is_group,
        "seller": {"id": seller.id, "name": seller.name} if seller else None,
        "analysis": analysis_dict,
    }

    if messages is not None:
        result["messages"] = [
            {
                "id": m.id,
                "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                "sender_type": m.sender_type,
                "sender_name": m.sender_name,
                "content": m.content,
                "message_type": m.message_type,
                "from_me": m.from_me,
            }
            for m in messages
        ]

    return result


@router.get("")
async def list_conversations(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = None,
    seller_id: int | None = None,
    team: str | None = None,
    sentiment: str | None = None,
    stage: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = select(Conversation, Seller).join(Seller).order_by(Conversation.last_message_at.desc().nulls_last())
    count_q = select(func.count(Conversation.id)).join(Seller)

    # Exclude blocked + invalid phones
    q = apply_conversation_exclusions(q)
    count_q = apply_conversation_exclusions(count_q)

    if search:
        pattern = f"%{search}%"
        filter_ = Conversation.customer_name.ilike(pattern) | Conversation.customer_phone.ilike(pattern)
        q = q.where(filter_)
        count_q = count_q.where(filter_)
    if seller_id:
        q = q.where(Conversation.seller_id == seller_id)
        count_q = count_q.where(Conversation.seller_id == seller_id)
    if team:
        q = q.where(Seller.team == team)
        count_q = count_q.where(Seller.team == team)
    if status:
        q = q.where(Conversation.status == status)
        count_q = count_q.where(Conversation.status == status)
    if date_from:
        q = q.where(Conversation.started_at >= date_from)
        count_q = count_q.where(Conversation.started_at >= date_from)
    if date_to:
        # Make date_to inclusive of the entire day (date string "2026-02-27" → include up to 23:59:59)
        date_to_next = str(date_type.fromisoformat(date_to) + timedelta(days=1))
        q = q.where(Conversation.started_at < date_to_next)
        count_q = count_q.where(Conversation.started_at < date_to_next)

    # Sentiment/stage filters require join with analysis
    if sentiment or stage:
        q = q.outerjoin(ConversationAnalysis)
        count_q = count_q.outerjoin(ConversationAnalysis)
        if sentiment:
            q = q.where(ConversationAnalysis.sentiment_label == sentiment)
            count_q = count_q.where(ConversationAnalysis.sentiment_label == sentiment)
        if stage:
            q = q.where(ConversationAnalysis.stage == stage)
            count_q = count_q.where(ConversationAnalysis.stage == stage)

    total = (await db.execute(count_q)).scalar() or 0
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    rows = result.all()

    items = []
    for c, seller in rows:
        items.append(_conv_to_dict(c, seller=seller, analysis=c.analysis))

    return {"conversations": items, "items": items, "total": total}


@router.get("/export")
async def export_conversations(
    seller_id: int | None = None,
    team: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = (
        select(Conversation, Seller.name.label("seller_name"), Seller.team.label("seller_team"))
        .join(Seller)
        .order_by(Conversation.last_message_at.desc().nulls_last())
    )

    # Exclude blocked + invalid phones
    q = apply_conversation_exclusions(q)

    if seller_id:
        q = q.where(Conversation.seller_id == seller_id)
    if team:
        q = q.where(Seller.team == team)
    if date_from:
        q = q.where(Conversation.started_at >= date_from)
    if date_to:
        date_to_next = str(date_type.fromisoformat(date_to) + timedelta(days=1))
        q = q.where(Conversation.started_at < date_to_next)

    result = await db.execute(q)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "vendedor", "equipe", "cliente", "telefone_cliente",
        "mensagens", "inicio", "ultima_mensagem", "status",
        "sentimento", "qualidade", "estagio",
    ])
    for conv, seller_name, seller_team in rows:
        analysis = conv.analysis
        writer.writerow([
            conv.id,
            seller_name,
            seller_team,
            conv.customer_name or "",
            conv.customer_phone,
            conv.message_count,
            conv.started_at.isoformat() if conv.started_at else "",
            conv.last_message_at.isoformat() if conv.last_message_at else "",
            conv.status,
            analysis.sentiment_label if analysis else "",
            analysis.quality_score if analysis else "",
            analysis.stage if analysis else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=conversations.csv"},
    )


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    seller_result = await db.execute(select(Seller).where(Seller.id == conv.seller_id))
    seller = seller_result.scalar_one_or_none()

    msg_result = await db.execute(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.timestamp)
    )
    messages = msg_result.scalars().all()

    return _conv_to_dict(conv, seller=seller, analysis=conv.analysis, messages=messages)


@router.get("/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    msg_result = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.timestamp)
    )
    messages = msg_result.scalars().all()
    return [
        {
            "id": m.id,
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "sender_type": m.sender_type,
            "sender_name": m.sender_name,
            "content": m.content,
            "message_type": m.message_type,
            "from_me": m.from_me,
        }
        for m in messages
    ]


@router.post("/{conversation_id}/analyze")
async def analyze_conversation_endpoint(conversation_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    analysis = await analyze_single_conversation(conversation_id)
    if not analysis:
        raise HTTPException(status_code=400, detail="Não foi possível analisar a conversa")
    return analysis


class ConversationPatch(BaseModel):
    customer_name: Optional[str] = None
    status: Optional[str] = None


@router.patch("/{conversation_id}")
async def update_conversation(conversation_id: int, body: ConversationPatch, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(conv, key, value)
    await db.commit()
    return {"status": "updated", "id": conversation_id}


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    # Delete related records first
    from sqlalchemy import delete
    await db.execute(delete(ManagerNote).where(ManagerNote.conversation_id == conv.id))
    await db.execute(delete(ConversationAnalysis).where(ConversationAnalysis.conversation_id == conv.id))
    await db.execute(delete(Message).where(Message.conversation_id == conv.id))
    await db.delete(conv)
    await db.commit()
    return {"status": "deleted", "id": conversation_id}


@router.post("/sync/{seller_id}")
async def sync_conversations(seller_id: int, days: int = Query(7), db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")

    task_id = create_task()
    run_background(sync_seller_conversations(seller_id, task_id, days))
    return {"task_id": task_id, "total": 0}


@router.post("/{conversation_id}/pull-messages")
async def pull_messages_from_zapi(conversation_id: int, amount: int = Query(50, ge=1, le=200), db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    """Pull messages from Z-API for a specific conversation (backfill missing messages)."""
    from datetime import datetime, timezone
    from app.services.zapi_client import ZAPIClient
    from app.services.phone_normalizer import normalize_phone

    result = await db.execute(
        select(Conversation, Seller)
        .join(Seller)
        .where(Conversation.id == conversation_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    conv, seller = row[0], row[1]

    if not seller.zapi_instance_id or not seller.zapi_instance_token:
        raise HTTPException(status_code=400, detail="Vendedor sem credenciais Z-API")

    phone = conv.customer_phone
    if not phone or not phone.startswith("55"):
        raise HTTPException(status_code=400, detail="Conversa sem telefone válido para buscar mensagens")

    client = ZAPIClient(seller.zapi_instance_id, seller.zapi_instance_token)
    raw_msgs = await client.get_chat_messages(phone, amount=amount)

    if not raw_msgs:
        return {"pulled": 0, "skipped": 0, "total_from_zapi": 0}

    # Get existing message IDs to avoid duplicates
    existing_ids_result = await db.execute(
        select(Message.zapi_message_id).where(Message.conversation_id == conv.id)
    )
    existing_ids = {r[0] for r in existing_ids_result.all() if r[0]}

    pulled = 0
    skipped = 0
    seller_norm = normalize_phone(seller.phone or "")

    for raw in raw_msgs:
        msg_id = raw.get("messageId") or raw.get("id")
        if msg_id and msg_id in existing_ids:
            skipped += 1
            continue

        from_me = raw.get("fromMe", False)

        # Parse content
        content = ""
        text_data = raw.get("text")
        if isinstance(text_data, dict):
            content = text_data.get("message", "")
        elif isinstance(text_data, str):
            content = text_data
        else:
            content = raw.get("body", "")

        raw_type = (raw.get("type") or "").lower()
        if not content:
            if raw_type in ("audio", "ptt"):
                content = "[Áudio]"
            elif raw_type == "image":
                content = "[Imagem]"
            elif raw_type == "document":
                content = "[Documento]"
            elif raw_type == "video":
                content = "[Vídeo]"
            elif raw_type == "sticker":
                content = "[Figurinha]"

        if not content and not raw_type:
            skipped += 1
            continue

        # Parse timestamp
        moment = raw.get("moment") or raw.get("timestamp")
        if isinstance(moment, (int, float)):
            if moment > 1e12:
                moment = moment / 1000
            ts = datetime.fromtimestamp(moment, tz=timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        msg = Message(
            conversation_id=conv.id,
            zapi_message_id=msg_id,
            sender_type="seller" if from_me else "customer",
            sender_name=seller.name if from_me else conv.customer_name,
            content=content,
            message_type=raw.get("type", "text") or "text",
            timestamp=ts,
            from_me=from_me,
        )
        db.add(msg)
        pulled += 1
        if msg_id:
            existing_ids.add(msg_id)

    if pulled:
        # Update conversation metadata
        conv.message_count = (conv.message_count or 0) + pulled
        await db.commit()

    return {"pulled": pulled, "skipped": skipped, "total_from_zapi": len(raw_msgs)}


@router.post("/bulk-pull-messages/{seller_id}")
async def bulk_pull_messages(seller_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    """Pull messages from Z-API for all conversations that have zero seller messages."""
    import asyncio
    from datetime import datetime, timezone
    from app.services.zapi_client import ZAPIClient
    from app.services.phone_normalizer import normalize_phone

    result = await db.execute(select(Seller).where(Seller.id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller or not seller.zapi_instance_id or not seller.zapi_instance_token:
        raise HTTPException(status_code=404, detail="Vendedor sem credenciais Z-API")

    # Find conversations with 0 seller messages
    seller_msg_count = (
        select(Message.conversation_id, func.count(Message.id).label("cnt"))
        .where(Message.from_me == True)
        .group_by(Message.conversation_id)
        .subquery()
    )
    q = (
        select(Conversation)
        .outerjoin(seller_msg_count, Conversation.id == seller_msg_count.c.conversation_id)
        .where(Conversation.seller_id == seller_id)
        .where(Conversation.customer_phone.like("55%"))
        .where(func.length(Conversation.customer_phone) <= 13)
        .where((seller_msg_count.c.cnt == None) | (seller_msg_count.c.cnt == 0))
    )
    convs = (await db.execute(q)).scalars().all()

    if not convs:
        return {"message": "No conversations missing seller messages", "total": 0}

    client = ZAPIClient(seller.zapi_instance_id, seller.zapi_instance_token)
    seller_norm = normalize_phone(seller.phone or "")
    total_pulled = 0
    total_skipped = 0
    convs_updated = 0

    for conv in convs:
        try:
            raw_msgs = await client.get_chat_messages(conv.customer_phone, amount=50)
            if not raw_msgs:
                continue

            # Get existing message IDs
            existing_ids_result = await db.execute(
                select(Message.zapi_message_id).where(Message.conversation_id == conv.id)
            )
            existing_ids = {r[0] for r in existing_ids_result.all() if r[0]}

            pulled = 0
            for raw in raw_msgs:
                msg_id = raw.get("messageId") or raw.get("id")
                if msg_id and msg_id in existing_ids:
                    total_skipped += 1
                    continue

                from_me = raw.get("fromMe", False)
                content = ""
                text_data = raw.get("text")
                if isinstance(text_data, dict):
                    content = text_data.get("message", "")
                elif isinstance(text_data, str):
                    content = text_data
                else:
                    content = raw.get("body", "")

                raw_type = (raw.get("type") or "").lower()
                if not content:
                    if raw_type in ("audio", "ptt"):
                        content = "[Áudio]"
                    elif raw_type == "image":
                        content = "[Imagem]"
                    elif raw_type == "document":
                        content = "[Documento]"
                    elif raw_type == "video":
                        content = "[Vídeo]"
                    elif raw_type == "sticker":
                        content = "[Figurinha]"

                if not content and not raw_type:
                    total_skipped += 1
                    continue

                moment = raw.get("moment") or raw.get("timestamp")
                if isinstance(moment, (int, float)):
                    if moment > 1e12:
                        moment = moment / 1000
                    ts = datetime.fromtimestamp(moment, tz=timezone.utc)
                else:
                    ts = datetime.now(timezone.utc)

                msg = Message(
                    conversation_id=conv.id,
                    zapi_message_id=msg_id,
                    sender_type="seller" if from_me else "customer",
                    sender_name=seller.name if from_me else conv.customer_name,
                    content=content,
                    message_type=raw.get("type", "text") or "text",
                    timestamp=ts,
                    from_me=from_me,
                )
                db.add(msg)
                pulled += 1
                if msg_id:
                    existing_ids.add(msg_id)

            if pulled:
                conv.message_count = (conv.message_count or 0) + pulled
                total_pulled += pulled
                convs_updated += 1

            # Rate limit: small delay between API calls
            await asyncio.sleep(0.5)

        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error pulling messages for conv {conv.id}: {e}")
            continue

    if total_pulled:
        await db.commit()

    return {
        "conversations_checked": len(convs),
        "conversations_updated": convs_updated,
        "messages_pulled": total_pulled,
        "messages_skipped": total_skipped,
    }


# ---------------------------------------------------------------------------
# Manager Notes
# ---------------------------------------------------------------------------

class NoteCreate(BaseModel):
    text: str


@router.get("/{conversation_id}/notes")
async def list_notes(conversation_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    q = (
        select(ManagerNote, User.name)
        .join(User, ManagerNote.user_id == User.id)
        .where(ManagerNote.conversation_id == conversation_id)
        .order_by(ManagerNote.created_at.desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": note.id,
            "text": note.text,
            "user_id": note.user_id,
            "user_name": user_name,
            "created_at": note.created_at.isoformat() if note.created_at else None,
        }
        for note, user_name in rows
    ]


@router.post("/{conversation_id}/notes")
async def create_note(conversation_id: int, body: NoteCreate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    note = ManagerNote(
        conversation_id=conversation_id,
        user_id=user.id,
        text=body.text.strip(),
    )
    db.add(note)
    await db.flush()

    return {
        "id": note.id,
        "text": note.text,
        "user_id": note.user_id,
        "user_name": user.name,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.delete("/{conversation_id}/notes/{note_id}")
async def delete_note(conversation_id: int, note_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(
        select(ManagerNote).where(ManagerNote.id == note_id, ManagerNote.conversation_id == conversation_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    await db.delete(note)
    return {"status": "deleted", "id": note_id}


# ---------------------------------------------------------------------------
# Merge duplicate conversations (@lid cleanup)
# ---------------------------------------------------------------------------

@router.post("/merge-duplicates")
async def merge_lid_duplicates(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    """Merge @lid conversations into real phone conversations.

    Uses name matching + time overlap. Also populates lid_id on merged conversations.
    """
    from sqlalchemy import delete as sa_delete, update as sa_update
    from sqlalchemy.orm import noload
    from app.services.phone_normalizer import is_valid_br_phone
    from collections import defaultdict

    # Only load @lid conversations (not starting with "55" or longer than 13 chars)
    result = await db.execute(
        select(Conversation).options(noload("*"))
        .where(~Conversation.customer_phone.like("55%"))
    )
    lid_convs = list(result.scalars().all())

    if not lid_convs:
        return {"merged": 0, "deleted_empty": 0, "lid_total": 0}

    # Get affected seller IDs
    seller_ids = {c.seller_id for c in lid_convs}

    # Load real-phone conversations only for those sellers
    result = await db.execute(
        select(Conversation).options(noload("*"))
        .where(Conversation.seller_id.in_(seller_ids))
        .where(Conversation.customer_phone.like("55%"))
        .where(func.length(Conversation.customer_phone) <= 13)
    )
    real_convs = list(result.scalars().all())
    by_seller_real = defaultdict(list)
    for c in real_convs:
        by_seller_real[c.seller_id].append(c)

    # Get message stats only for @lid conversations and their candidate real convs
    lid_ids = [c.id for c in lid_convs]
    real_ids = [c.id for c in real_convs]
    all_ids = lid_ids + real_ids

    conv_stats = {}
    if all_ids:
        # Batch in chunks of 500 to avoid huge IN clause
        for i in range(0, len(all_ids), 500):
            chunk = all_ids[i:i+500]
            stats_q = await db.execute(
                select(
                    Message.conversation_id,
                    func.min(Message.timestamp),
                    func.max(Message.timestamp),
                    func.count(Message.id).filter(Message.from_me == True),
                    func.count(Message.id).filter(Message.from_me == False),
                )
                .where(Message.conversation_id.in_(chunk))
                .group_by(Message.conversation_id)
            )
            for row in stats_q.all():
                conv_stats[row[0]] = {
                    "min_ts": row[1], "max_ts": row[2],
                    "seller_msgs": row[3], "customer_msgs": row[4],
                }

    merged = 0
    deleted_empty = 0

    for lid_conv in lid_convs:
        lid_stat = conv_stats.get(lid_conv.id)

        if not lid_stat or (lid_stat["seller_msgs"] == 0 and lid_stat["customer_msgs"] == 0):
            await db.execute(sa_delete(ConversationAnalysis).where(ConversationAnalysis.conversation_id == lid_conv.id))
            await db.execute(sa_delete(ManagerNote).where(ManagerNote.conversation_id == lid_conv.id))
            await db.delete(lid_conv)
            deleted_empty += 1
            continue

        real_match = None
        lid_name = (lid_conv.customer_name or "").strip().lower()
        candidates = by_seller_real.get(lid_conv.seller_id, [])

        # Strategy 1: name match (case-insensitive)
        for real_conv in candidates:
            real_name = (real_conv.customer_name or "").strip().lower()
            if lid_name and real_name and lid_name == real_name:
                real_match = real_conv
                break

        # Strategy 2: time overlap
        if not real_match and lid_stat and lid_stat["seller_msgs"] > 0:
            best_score = -1
            for real_conv in candidates:
                real_stat = conv_stats.get(real_conv.id)
                if not real_stat or real_stat["customer_msgs"] == 0:
                    continue
                if lid_stat["min_ts"] and real_stat["min_ts"] and lid_stat["max_ts"] and real_stat["max_ts"]:
                    overlap_start = max(lid_stat["min_ts"], real_stat["min_ts"])
                    overlap_end = min(lid_stat["max_ts"], real_stat["max_ts"])
                    if overlap_start <= overlap_end:
                        overlap_seconds = (overlap_end - overlap_start).total_seconds()
                        score = overlap_seconds + real_stat["customer_msgs"] * 100
                        if score > best_score:
                            best_score = score
                            real_match = real_conv

        if real_match:
            await db.execute(
                sa_update(Message).where(Message.conversation_id == lid_conv.id)
                .values(conversation_id=real_match.id)
            )
            await db.execute(
                sa_update(ManagerNote).where(ManagerNote.conversation_id == lid_conv.id)
                .values(conversation_id=real_match.id)
            )
            await db.execute(
                sa_delete(ConversationAnalysis).where(ConversationAnalysis.conversation_id == lid_conv.id)
            )
            msg_count = (await db.execute(
                select(func.count(Message.id)).where(Message.conversation_id == real_match.id)
            )).scalar() or 0
            real_match.message_count = msg_count
            ts = (await db.execute(
                select(func.max(Message.timestamp)).where(Message.conversation_id == real_match.id)
            )).scalar()
            if ts:
                real_match.last_message_at = ts
            # Store lid_id for future @lid matching
            lid_phone = lid_conv.customer_phone or ""
            if not lid_phone.startswith("55") and lid_phone:
                real_match.lid_id = lid_phone
            if lid_name and (not real_match.customer_name or real_match.customer_name == real_match.customer_phone):
                real_match.customer_name = lid_conv.customer_name
            await db.delete(lid_conv)
            merged += 1

    await db.commit()
    return {"merged": merged, "deleted_empty": deleted_empty, "lid_total": len(lid_convs)}


@router.post("/redistribute-seller-messages")
async def redistribute_seller_messages(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    """Redistribute misplaced seller messages to the correct conversations.

    For each seller message (from_me=True), find the conversation that had
    the most recent customer message (from_me=False) BEFORE that seller message.
    If the seller message is in a different conversation, move it.

    This fixes messages that were incorrectly merged by the time-overlap algorithm.
    """
    from sqlalchemy.orm import noload

    # Get all sellers
    sellers_result = await db.execute(select(Seller).where(Seller.is_active == True))
    sellers = sellers_result.scalars().all()

    total_moved = 0
    total_checked = 0

    for seller in sellers:
        # Get ALL messages for this seller's conversations, sorted by timestamp
        msgs_result = await db.execute(
            select(Message.id, Message.conversation_id, Message.from_me, Message.timestamp)
            .join(Conversation)
            .where(Conversation.seller_id == seller.id)
            .order_by(Message.timestamp)
        )
        all_msgs = msgs_result.all()

        if not all_msgs:
            continue

        # Build a timeline: for each seller message, find which conversation
        # had the most recent customer message before it
        last_customer_msg_conv = None  # conv_id of most recent customer message

        moves = []  # (message_id, current_conv_id, correct_conv_id)

        for msg_id, conv_id, from_me, ts in all_msgs:
            total_checked += 1
            if not from_me:
                # Customer message — update the "most recent customer conv"
                last_customer_msg_conv = conv_id
            else:
                # Seller message — should be in the same conversation as the
                # most recent customer message
                if last_customer_msg_conv and conv_id != last_customer_msg_conv:
                    moves.append((msg_id, conv_id, last_customer_msg_conv))

        # Execute the moves
        affected_convs = set()
        for msg_id, old_conv_id, new_conv_id in moves:
            await db.execute(
                select(Message).where(Message.id == msg_id)  # ensure exists
            )
            from sqlalchemy import update as sa_update
            await db.execute(
                sa_update(Message)
                .where(Message.id == msg_id)
                .values(conversation_id=new_conv_id)
            )
            affected_convs.add(old_conv_id)
            affected_convs.add(new_conv_id)
            total_moved += 1

        # Recalculate message_count and last_message_at for affected conversations
        for conv_id in affected_convs:
            msg_count = (await db.execute(
                select(func.count(Message.id)).where(Message.conversation_id == conv_id)
            )).scalar() or 0
            last_ts = (await db.execute(
                select(func.max(Message.timestamp)).where(Message.conversation_id == conv_id)
            )).scalar()
            await db.execute(
                select(Conversation).where(Conversation.id == conv_id)
            )
            conv = (await db.execute(
                select(Conversation).where(Conversation.id == conv_id)
            )).scalar_one_or_none()
            if conv:
                conv.message_count = msg_count
                if last_ts:
                    conv.last_message_at = last_ts

    await db.commit()
    return {
        "messages_moved": total_moved,
        "messages_checked": total_checked,
    }
