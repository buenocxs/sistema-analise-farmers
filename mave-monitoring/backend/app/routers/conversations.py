from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Seller, Conversation, Message, ConversationAnalysis
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
    q = select(Conversation).join(Seller).order_by(Conversation.last_message_at.desc().nulls_last())
    count_q = select(func.count(Conversation.id)).join(Seller)

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
        q = q.where(Conversation.started_at <= date_to)
        count_q = count_q.where(Conversation.started_at <= date_to)

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
    conversations = result.scalars().all()

    items = []
    for c in conversations:
        seller_result = await db.execute(select(Seller).where(Seller.id == c.seller_id))
        seller = seller_result.scalar_one_or_none()
        items.append(_conv_to_dict(c, seller=seller, analysis=c.analysis))

    return {"conversations": items, "items": items, "total": total}


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


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    # Delete related records first
    await db.execute(select(Message).where(Message.conversation_id == conv.id))
    from sqlalchemy import delete
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
