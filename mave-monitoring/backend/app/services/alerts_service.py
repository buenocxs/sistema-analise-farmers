import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Alert, AlertConfig

logger = logging.getLogger(__name__)


async def create_alert(db: AsyncSession, seller_id: int | None, conversation_id: int | None, alert_type: str, severity: str, message: str):
    alert = Alert(
        seller_id=seller_id,
        conversation_id=conversation_id,
        alert_type=alert_type,
        severity=severity,
        message=message,
    )
    db.add(alert)
    await db.flush()
    return alert


async def get_alert_config(db: AsyncSession) -> AlertConfig:
    result = await db.execute(select(AlertConfig).where(AlertConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        config = AlertConfig(id=1)
        db.add(config)
        await db.flush()
    return config
