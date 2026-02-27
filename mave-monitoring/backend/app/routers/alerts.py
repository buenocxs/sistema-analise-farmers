from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Alert
from app.auth import get_current_user

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    resolved: bool | None = None,
    limit: int = Query(50, ge=1, le=200),
    seller_id: int | None = None,
    conversation_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = select(Alert).order_by(Alert.created_at.desc())
    if resolved is not None:
        q = q.where(Alert.resolved == resolved)
    if seller_id:
        q = q.where(Alert.seller_id == seller_id)
    if conversation_id:
        q = q.where(Alert.conversation_id == conversation_id)
    q = q.limit(limit)

    result = await db.execute(q)
    alerts = result.scalars().all()
    return {
        "alerts": [
            {
                "id": a.id,
                "message": a.message,
                "alert_type": a.alert_type,
                "severity": a.severity,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "seller_id": a.seller_id,
                "conversation_id": a.conversation_id,
                "resolved": a.resolved,
                "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
            }
            for a in alerts
        ]
    }


@router.put("/{alert_id}/resolve")
async def resolve_alert(alert_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    alert.resolved = True
    alert.resolved_at = datetime.now(timezone.utc)
    return {"ok": True}
