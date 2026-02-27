import io
import csv
from datetime import date
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth import get_current_user
from app.services.metrics import (
    get_dashboard_stats,
    get_team_comparison,
    get_sentiment_distribution,
    get_response_time_distribution,
    get_heatmap,
    get_ranking,
    get_trends,
    get_metrics_timeseries,
)

router = APIRouter(tags=["analytics"])


@router.get("/dashboard/stats")
async def dashboard_stats(
    date_from: str | None = None,
    date_to: str | None = None,
    team: str | None = None,
    group_by: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    return await get_dashboard_stats(db, date_from=df, date_to=dt, team=team)


@router.get("/metrics")
async def metrics(
    days: int = Query(30),
    date_from: str | None = None,
    date_to: str | None = None,
    group_by: str = "day",
    team: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    items = await get_metrics_timeseries(db, days=days, date_from=df, date_to=dt, group_by=group_by, team=team)
    return {"items": items}


@router.get("/team-comparison")
async def team_comparison(
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    teams = await get_team_comparison(db, date_from=df, date_to=dt)
    return {"teams": teams}


@router.get("/sentiment-distribution")
async def sentiment_distribution(
    date_from: str | None = None,
    date_to: str | None = None,
    team: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    return await get_sentiment_distribution(db, date_from=df, date_to=dt, team=team)


@router.get("/response-time-distribution")
async def response_time_dist(
    date_from: str | None = None,
    date_to: str | None = None,
    team: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    return await get_response_time_distribution(db, date_from=df, date_to=dt, team=team)


@router.get("/heatmap")
async def heatmap(
    date_from: str | None = None,
    date_to: str | None = None,
    team: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    return await get_heatmap(db, date_from=df, date_to=dt, team=team)


@router.get("/trends")
async def trends(
    weeks: int = Query(4),
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    data = await get_trends(db, weeks=weeks, date_from=df, date_to=dt)
    return {"weeks": data}


@router.get("/ranking")
async def ranking(
    metric: str = Query("score"),
    limit: int = Query(10),
    team: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    data = await get_ranking(db, metric=metric, limit=limit, team=team, date_from=df, date_to=dt)
    return {"rankings": data}


@router.get("/metrics/export")
async def export_metrics(
    days: int = Query(30),
    date_from: str | None = None,
    date_to: str | None = None,
    group_by: str = "day",
    team: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    df = date.fromisoformat(date_from) if date_from else None
    dt = date.fromisoformat(date_to) if date_to else None
    items = await get_metrics_timeseries(db, days=days, date_from=df, date_to=dt, group_by=group_by, team=team)

    output = io.StringIO()
    if items:
        writer = csv.DictWriter(output, fieldnames=items[0].keys())
        writer.writeheader()
        writer.writerows(items)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=metrics.csv"},
    )
