import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth import get_current_user
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
