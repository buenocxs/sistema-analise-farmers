import io
import csv
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import ExcludedNumber
from app.schemas import ExclusionAddRequest, ExclusionBulkDeleteRequest, ExclusionClearRequest
from app.auth import get_current_user
from app.services.phone_normalizer import normalize_phone, is_valid_phone
from app.services.timezone import today_brt

router = APIRouter(prefix="/exclusion-list", tags=["exclusion"])


@router.get("")
async def list_excluded(
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = select(ExcludedNumber).where(ExcludedNumber.active == True).order_by(ExcludedNumber.added_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    items = result.scalars().all()
    return {
        "items": [
            {
                "id": n.id,
                "phone_normalized": n.phone_normalized,
                "original_format": n.original_format,
                "reason": n.reason,
                "added_at": n.added_at.isoformat() if n.added_at else None,
            }
            for n in items
        ]
    }


@router.post("/add")
async def add_excluded(body: ExclusionAddRequest, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    lines = [l.strip() for l in body.numbers_text.strip().split("\n") if l.strip()]
    added = 0
    skipped = 0
    duplicates = 0
    invalid = 0
    errors = []

    for line in lines:
        if not is_valid_phone(line):
            invalid += 1
            errors.append(f"Número inválido: {line}")
            continue

        normalized = normalize_phone(line)
        existing = await db.execute(
            select(ExcludedNumber).where(ExcludedNumber.phone_normalized == normalized)
        )
        if existing.scalar_one_or_none():
            duplicates += 1
            skipped += 1
            continue

        number = ExcludedNumber(
            phone_normalized=normalized,
            original_format=line,
            reason=body.reason,
        )
        db.add(number)
        added += 1

    await db.flush()
    return {"added": added, "skipped": skipped, "duplicates": duplicates, "invalid": invalid, "errors": errors}


@router.delete("/{number_id}")
async def remove_excluded(number_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(ExcludedNumber).where(ExcludedNumber.id == number_id))
    number = result.scalar_one_or_none()
    if not number:
        raise HTTPException(status_code=404, detail="Número não encontrado")
    await db.delete(number)
    return {"ok": True}


@router.post("/bulk-delete")
async def bulk_delete(body: ExclusionBulkDeleteRequest, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    if not body.ids:
        return {"deleted": 0}
    from sqlalchemy import delete
    result = await db.execute(
        delete(ExcludedNumber).where(ExcludedNumber.id.in_(body.ids))
    )
    return {"deleted": result.rowcount}


@router.post("/clear")
async def clear_exclusion_list(body: ExclusionClearRequest, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    if body.token != "CONFIRMAR":
        raise HTTPException(status_code=400, detail="Token de confirmação inválido")
    from sqlalchemy import delete
    result = await db.execute(delete(ExcludedNumber))
    return {"ok": True, "deleted": result.rowcount}


@router.get("/stats")
async def exclusion_stats(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    total = (await db.execute(select(func.count(ExcludedNumber.id)).where(ExcludedNumber.active == True))).scalar() or 0

    today = today_brt()
    added_today = (await db.execute(
        select(func.count(ExcludedNumber.id)).where(func.date(ExcludedNumber.added_at) == today)
    )).scalar() or 0

    reasons_q = (
        select(ExcludedNumber.reason, func.count(ExcludedNumber.id))
        .where(ExcludedNumber.active == True)
        .group_by(ExcludedNumber.reason)
    )
    reasons_result = (await db.execute(reasons_q)).all()
    by_reason = {r[0] or "Sem motivo": r[1] for r in reasons_result}

    return {"total": total, "added_today": added_today, "by_reason": by_reason}


@router.get("/export")
async def export_exclusion_list(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(ExcludedNumber).where(ExcludedNumber.active == True))
    items = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["phone_normalized", "original_format", "reason", "added_at"])
    for n in items:
        writer.writerow([n.phone_normalized, n.original_format, n.reason, n.added_at])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=exclusion_list.csv"},
    )
