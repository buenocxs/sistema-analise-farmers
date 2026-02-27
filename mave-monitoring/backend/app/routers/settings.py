from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import AlertConfig
from app.schemas import AlertConfigOut, AlertConfigUpdate
from app.auth import get_current_user
from app.services.alerts_service import get_alert_config

router = APIRouter(tags=["settings"])


@router.get("/alert-config")
async def get_config(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    config = await get_alert_config(db)
    return {
        "maxResponseTime": config.max_response_time,
        "daysWithoutFollowUp": config.days_without_follow_up,
        "unhandledObjectionHours": config.unhandled_objection_hours,
    }


@router.put("/alert-config")
async def update_config(body: AlertConfigUpdate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    config = await get_alert_config(db)
    if body.maxResponseTime is not None:
        config.max_response_time = body.maxResponseTime
    if body.daysWithoutFollowUp is not None:
        config.days_without_follow_up = body.daysWithoutFollowUp
    if body.unhandledObjectionHours is not None:
        config.unhandled_objection_hours = body.unhandledObjectionHours
    await db.flush()
    return {
        "maxResponseTime": config.max_response_time,
        "daysWithoutFollowUp": config.days_without_follow_up,
        "unhandledObjectionHours": config.unhandled_objection_hours,
    }
