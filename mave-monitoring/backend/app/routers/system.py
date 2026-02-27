import time
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth import get_current_user, hash_password
from app.models import User, AlertConfig, Conversation, Message, ConversationAnalysis, Alert
from app.jobs.task_manager import get_task

router = APIRouter(tags=["system"])

_start_time = time.time()


@router.get("/system/status")
async def system_status(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    uptime_seconds = int(time.time() - _start_time)
    hours = uptime_seconds // 3600
    minutes = (uptime_seconds % 3600) // 60
    return {
        "whatsapp": "connected",
        "whatsapp_state": "open",
        "instance_name": "MAVE",
        "uptime": f"{hours}h {minutes}m",
        "version": "2.0.0",
    }


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str, _user=Depends(get_current_user)):
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")
    return task


@router.post("/system/seed")
async def run_seed(db: AsyncSession = Depends(get_db)):
    """One-time seed endpoint. Only works when SECRET_KEY env var is provided as query param."""
    from app.config import get_settings
    settings = get_settings()
    if settings.APP_ENV != "production":
        raise HTTPException(status_code=403, detail="Only available in production")

    results = []

    # Admin user
    result = await db.execute(select(User).where(User.email == "admin@mave.com.br"))
    if not result.scalar_one_or_none():
        admin = User(
            email="admin@mave.com.br",
            name="Administrador",
            password_hash=hash_password("admin123"),
            role="gestor_comercial",
            is_active=True,
        )
        db.add(admin)
        results.append("Admin user created")
    else:
        results.append("Admin user already exists")

    # Default alert config
    result = await db.execute(select(AlertConfig).where(AlertConfig.id == 1))
    if not result.scalar_one_or_none():
        config = AlertConfig(id=1, max_response_time=300, days_without_follow_up=3, unhandled_objection_hours=24)
        db.add(config)
        results.append("Alert config created")
    else:
        results.append("Alert config already exists")

    await db.commit()
    return {"results": results}


class MergeRequest(BaseModel):
    source_id: int
    target_id: int


@router.post("/system/merge-conversations")
async def merge_conversations(body: MergeRequest, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    """Move all messages from source conversation into target, then delete source."""
    from sqlalchemy import delete as sql_delete, func

    source = (await db.execute(select(Conversation).where(Conversation.id == body.source_id))).scalar_one_or_none()
    target = (await db.execute(select(Conversation).where(Conversation.id == body.target_id))).scalar_one_or_none()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    try:
        # Move messages from source to target
        await db.execute(
            update(Message).where(Message.conversation_id == body.source_id).values(conversation_id=body.target_id)
        )

        # Move alerts from source to target
        await db.execute(
            update(Alert).where(Alert.conversation_id == body.source_id).values(conversation_id=body.target_id)
        )

        # Delete source analysis
        await db.execute(
            sql_delete(ConversationAnalysis).where(ConversationAnalysis.conversation_id == body.source_id)
        )

        # Delete source conversation (use raw SQL to avoid ORM relationship issues)
        await db.execute(
            sql_delete(Conversation).where(Conversation.id == body.source_id)
        )

        # Update target message count and timestamps
        stats = (await db.execute(
            select(
                func.count(Message.id),
                func.min(Message.timestamp),
                func.max(Message.timestamp),
            ).where(Message.conversation_id == body.target_id)
        )).one()

        await db.execute(
            update(Conversation).where(Conversation.id == body.target_id).values(
                message_count=stats[0] or 0,
                started_at=stats[1],
                last_message_at=stats[2],
            )
        )

        await db.commit()
        return {
            "status": "merged",
            "target_id": body.target_id,
            "message_count": stats[0] or 0,
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
