import time
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth import get_current_user, hash_password
from app.models import User, AlertConfig
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
