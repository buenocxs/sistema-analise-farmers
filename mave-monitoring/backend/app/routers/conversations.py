import io
import csv
from datetime import date as date_type, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Seller, Conversation, Message, ConversationAnalysis, ManagerNote, User
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
    """Find conversations with @lid phone IDs and merge them into the real phone conversation.

    For each seller, find conversations where customer_phone is not a valid
    BR phone (12-13 digits starting with 55). If another conversation exists
    for the same seller with a real phone and the same customer_name, merge
    messages into that one and delete the @lid conversation.
    """
    from sqlalchemy import delete as sa_delete, update as sa_update
    from app.services.phone_normalizer import is_valid_br_phone

    # Get all conversations
    result = await db.execute(
        select(Conversation).order_by(Conversation.seller_id, Conversation.customer_phone)
    )
    all_convs = list(result.scalars().all())

    # Separate into real-phone and lid conversations per seller
    from collections import defaultdict
    by_seller_real = defaultdict(list)   # seller_id -> [conv with real phone]
    lid_convs = []                        # conversations with @lid phone

    for conv in all_convs:
        if is_valid_br_phone(conv.customer_phone or ""):
            by_seller_real[conv.seller_id].append(conv)
        else:
            lid_convs.append(conv)

    merged = 0
    deleted_orphans = 0

    for lid_conv in lid_convs:
        # Try to find a matching real-phone conversation for the same seller
        real_match = None
        lid_name = (lid_conv.customer_name or "").strip().lower()

        for real_conv in by_seller_real.get(lid_conv.seller_id, []):
            real_name = (real_conv.customer_name or "").strip().lower()
            # Match by name (skip if name is just a phone or @lid)
            if lid_name and real_name and lid_name == real_name and "@lid" not in lid_name:
                real_match = real_conv
                break

        if real_match:
            # Merge: move all messages from lid_conv to real_match
            await db.execute(
                sa_update(Message)
                .where(Message.conversation_id == lid_conv.id)
                .values(conversation_id=real_match.id)
            )
            # Move notes
            await db.execute(
                sa_update(ManagerNote)
                .where(ManagerNote.conversation_id == lid_conv.id)
                .values(conversation_id=real_match.id)
            )
            # Delete lid_conv analysis
            await db.execute(
                sa_delete(ConversationAnalysis).where(ConversationAnalysis.conversation_id == lid_conv.id)
            )
            # Update message_count on real_match
            msg_count = await db.execute(
                select(func.count(Message.id)).where(Message.conversation_id == real_match.id)
            )
            real_match.message_count = msg_count.scalar() or 0
            # Update last_message_at
            last_msg = await db.execute(
                select(func.max(Message.timestamp)).where(Message.conversation_id == real_match.id)
            )
            ts = last_msg.scalar()
            if ts:
                real_match.last_message_at = ts
            # Delete the lid conversation
            await db.delete(lid_conv)
            merged += 1
        else:
            # No matching real conversation — check if lid_conv has 0 messages
            msg_count = await db.execute(
                select(func.count(Message.id)).where(Message.conversation_id == lid_conv.id)
            )
            if (msg_count.scalar() or 0) == 0:
                # Delete empty @lid conversation
                await db.execute(sa_delete(ConversationAnalysis).where(ConversationAnalysis.conversation_id == lid_conv.id))
                await db.execute(sa_delete(ManagerNote).where(ManagerNote.conversation_id == lid_conv.id))
                await db.delete(lid_conv)
                deleted_orphans += 1

    await db.commit()
    return {
        "merged": merged,
        "deleted_empty": deleted_orphans,
        "lid_total": len(lid_convs),
        "real_total": sum(len(v) for v in by_seller_real.values()),
    }
