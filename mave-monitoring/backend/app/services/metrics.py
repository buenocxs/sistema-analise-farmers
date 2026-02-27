import logging
from datetime import date, timedelta
from sqlalchemy import select, func, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import (
    Seller, Conversation, ConversationAnalysis, Message, DailyMetric, Alert
)

logger = logging.getLogger(__name__)


async def get_dashboard_stats(db: AsyncSession, date_from: date | None = None, date_to: date | None = None, team: str | None = None) -> dict:
    """Compute dashboard statistics."""
    try:
        # Base seller filter
        seller_filter = []
        if team:
            seller_filter.append(Seller.team == team)
        seller_filter.append(Seller.is_active == True)

        # Total conversations
        q = select(func.count(Conversation.id)).join(Seller)
        for f in seller_filter:
            q = q.where(f)
        if date_from:
            q = q.where(Conversation.started_at >= date_from)
        if date_to:
            q = q.where(Conversation.started_at <= date_to)
        total_convs = (await db.execute(q)).scalar() or 0

        # Total messages today
        from app.services.timezone import today_brt
        today = today_brt()
        q_msgs = select(func.count(Message.id)).where(func.date(Message.timestamp) == today)
        total_msgs_today = (await db.execute(q_msgs)).scalar() or 0

        # Avg quality score
        q_quality = select(func.avg(ConversationAnalysis.quality_score)).join(Conversation).join(Seller)
        for f in seller_filter:
            q_quality = q_quality.where(f)
        avg_quality = (await db.execute(q_quality)).scalar()
        avg_quality = round(avg_quality, 1) if avg_quality else 0

        # Avg response time from daily_metrics
        q_rt = select(func.avg(DailyMetric.avg_response_time_seconds)).join(Seller)
        for f in seller_filter:
            q_rt = q_rt.where(f)
        if date_from:
            q_rt = q_rt.where(DailyMetric.date >= date_from)
        avg_response_time = (await db.execute(q_rt)).scalar() or 0

        # Sentiment distribution
        q_sent = (
            select(ConversationAnalysis.sentiment_label, func.count(ConversationAnalysis.id))
            .join(Conversation).join(Seller)
            .group_by(ConversationAnalysis.sentiment_label)
        )
        for f in seller_filter:
            q_sent = q_sent.where(f)
        sent_rows = (await db.execute(q_sent)).all()
        sentiment_dist = {"positivo": 0, "neutro": 0, "negativo": 0, "frustrado": 0}
        for label, count in sent_rows:
            if label in sentiment_dist:
                sentiment_dist[label] = count

        return {
            "total_conversations": total_convs,
            "total_messages_today": total_msgs_today,
            "response_time_avg_seconds": round(avg_response_time, 0),
            "avg_quality": avg_quality,
            "conversations_change": 0,
            "messages_change": 0,
            "response_time_change": 0,
            "quality_change": 0,
            "sentiment_distribution": sentiment_dist,
        }
    except Exception as e:
        logger.error(f"Error computing dashboard stats: {e}")
        return {
            "total_conversations": 0, "total_messages_today": 0,
            "response_time_avg_seconds": 0, "avg_quality": 0,
            "conversations_change": 0, "messages_change": 0,
            "response_time_change": 0, "quality_change": 0,
            "sentiment_distribution": {"positivo": 0, "neutro": 0, "negativo": 0, "frustrado": 0},
        }


async def get_team_comparison(db: AsyncSession, date_from: date | None = None, date_to: date | None = None) -> list:
    """Compare metrics across teams."""
    teams = []
    for team_name in ["closer", "farmer", "pre_sale"]:
        q_sellers = select(func.count(Seller.id)).where(and_(Seller.team == team_name, Seller.is_active == True))
        seller_count = (await db.execute(q_sellers)).scalar() or 0

        q_convs = (
            select(func.count(Conversation.id))
            .join(Seller)
            .where(and_(Seller.team == team_name, Seller.is_active == True))
        )
        if date_from:
            q_convs = q_convs.where(Conversation.started_at >= date_from)
        if date_to:
            q_convs = q_convs.where(Conversation.started_at <= date_to)
        total_convs = (await db.execute(q_convs)).scalar() or 0

        q_msgs = (
            select(func.count(Message.id))
            .join(Conversation).join(Seller)
            .where(and_(Seller.team == team_name, Seller.is_active == True))
        )
        msgs_total = (await db.execute(q_msgs)).scalar() or 0

        q_quality = (
            select(func.avg(ConversationAnalysis.quality_score))
            .join(Conversation).join(Seller)
            .where(and_(Seller.team == team_name, Seller.is_active == True))
        )
        avg_q = (await db.execute(q_quality)).scalar()

        q_rt = (
            select(func.avg(DailyMetric.avg_response_time_seconds))
            .join(Seller)
            .where(and_(Seller.team == team_name, Seller.is_active == True))
        )
        avg_rt = (await db.execute(q_rt)).scalar()

        teams.append({
            "team": team_name,
            "seller_count": seller_count,
            "total_conversations": total_convs,
            "messages_total": msgs_total,
            "avg_quality": round(avg_q, 1) if avg_q else 0,
            "avg_response_time_seconds": round(avg_rt, 0) if avg_rt else 0,
            "avg_score": round(avg_q, 1) if avg_q else 0,
        })
    return teams


async def get_sentiment_distribution(db: AsyncSession, date_from: date | None = None, date_to: date | None = None, team: str | None = None) -> dict:
    q = (
        select(ConversationAnalysis.sentiment_label, func.count(ConversationAnalysis.id))
        .join(Conversation).join(Seller)
        .where(Seller.is_active == True)
        .group_by(ConversationAnalysis.sentiment_label)
    )
    if team:
        q = q.where(Seller.team == team)
    if date_from:
        q = q.where(Conversation.started_at >= date_from)
    if date_to:
        q = q.where(Conversation.started_at <= date_to)
    rows = (await db.execute(q)).all()
    result = {"positivo": 0, "neutro": 0, "negativo": 0, "frustrado": 0}
    for label, count in rows:
        if label in result:
            result[label] = count
    return result


async def get_response_time_distribution(db: AsyncSession, date_from: date | None = None, date_to: date | None = None, team: str | None = None) -> dict:
    q = select(
        func.sum(DailyMetric.response_under_5min),
        func.sum(DailyMetric.response_5_30min),
        func.sum(DailyMetric.response_30_60min),
        func.sum(DailyMetric.response_over_60min),
    ).join(Seller).where(Seller.is_active == True)
    if team:
        q = q.where(Seller.team == team)
    if date_from:
        q = q.where(DailyMetric.date >= date_from)
    if date_to:
        q = q.where(DailyMetric.date <= date_to)
    row = (await db.execute(q)).one_or_none()
    if row:
        return {
            "< 5 min": row[0] or 0,
            "5-30 min": row[1] or 0,
            "30-60 min": row[2] or 0,
            "> 60 min": row[3] or 0,
        }
    return {"< 5 min": 0, "5-30 min": 0, "30-60 min": 0, "> 60 min": 0}


async def get_heatmap(db: AsyncSession, date_from: date | None = None, date_to: date | None = None, team: str | None = None) -> list:
    q = (
        select(
            extract("dow", Message.timestamp).label("day_of_week"),
            extract("hour", Message.timestamp).label("hour"),
            func.count(Message.id).label("count"),
        )
        .join(Conversation).join(Seller)
        .where(Seller.is_active == True)
        .group_by("day_of_week", "hour")
    )
    if team:
        q = q.where(Seller.team == team)
    if date_from:
        q = q.where(Message.timestamp >= date_from)
    if date_to:
        q = q.where(Message.timestamp <= date_to)
    rows = (await db.execute(q)).all()
    return [{"day_of_week": int(r[0]), "hour": int(r[1]), "count": r[2]} for r in rows]


async def get_ranking(db: AsyncSession, metric: str = "score", limit: int = 10, team: str | None = None, date_from: date | None = None, date_to: date | None = None) -> list:
    if metric == "score":
        q = (
            select(
                Seller.id, Seller.name,
                func.avg(ConversationAnalysis.quality_score).label("value"),
                func.count(Conversation.id).label("conversations"),
            )
            .join(Conversation, Conversation.seller_id == Seller.id)
            .outerjoin(ConversationAnalysis, ConversationAnalysis.conversation_id == Conversation.id)
            .where(Seller.is_active == True)
            .group_by(Seller.id, Seller.name)
            .order_by(func.avg(ConversationAnalysis.quality_score).desc().nulls_last())
            .limit(limit)
        )
    elif metric == "conversations":
        q = (
            select(
                Seller.id, Seller.name,
                func.count(Conversation.id).label("value"),
                func.count(Conversation.id).label("conversations"),
            )
            .join(Conversation, Conversation.seller_id == Seller.id)
            .where(Seller.is_active == True)
            .group_by(Seller.id, Seller.name)
            .order_by(func.count(Conversation.id).desc())
            .limit(limit)
        )
    elif metric == "response_time":
        q = (
            select(
                Seller.id, Seller.name,
                func.avg(DailyMetric.avg_response_time_seconds).label("value"),
                func.count(DailyMetric.id).label("conversations"),
            )
            .join(DailyMetric, DailyMetric.seller_id == Seller.id)
            .where(Seller.is_active == True)
            .group_by(Seller.id, Seller.name)
            .order_by(func.avg(DailyMetric.avg_response_time_seconds).asc().nulls_last())
            .limit(limit)
        )
    else:  # messages
        q = (
            select(
                Seller.id, Seller.name,
                func.sum(DailyMetric.messages_sent).label("value"),
                func.count(DailyMetric.id).label("conversations"),
            )
            .join(DailyMetric, DailyMetric.seller_id == Seller.id)
            .where(Seller.is_active == True)
            .group_by(Seller.id, Seller.name)
            .order_by(func.sum(DailyMetric.messages_sent).desc().nulls_last())
            .limit(limit)
        )

    if team:
        q = q.where(Seller.team == team)
    rows = (await db.execute(q)).all()
    return [
        {
            "seller_id": r[0],
            "name": r[1],
            "score": round(float(r[2]), 1) if r[2] else 0,
            "value": round(float(r[2]), 1) if r[2] else 0,
            "conversations": r[3] or 0,
        }
        for r in rows
    ]


async def get_trends(db: AsyncSession, weeks: int = 4, date_from: date | None = None, date_to: date | None = None) -> list:
    """Get weekly trends."""
    from app.services.timezone import today_brt
    end = date_to or today_brt()
    start = date_from or (end - timedelta(weeks=weeks))

    q = (
        select(
            DailyMetric.date,
            func.sum(DailyMetric.conversations_started),
            func.sum(DailyMetric.messages_sent),
            func.avg(DailyMetric.quality_avg),
            func.avg(DailyMetric.avg_response_time_seconds),
        )
        .where(and_(DailyMetric.date >= start, DailyMetric.date <= end))
        .group_by(DailyMetric.date)
        .order_by(DailyMetric.date)
    )
    rows = (await db.execute(q)).all()

    # Group by week
    weekly = {}
    for r in rows:
        d = r[0]
        week_start = d - timedelta(days=d.weekday())
        key = str(week_start)
        if key not in weekly:
            weekly[key] = {"conversations": 0, "messages": 0, "scores": [], "rts": []}
        weekly[key]["conversations"] += r[1] or 0
        weekly[key]["messages"] += r[2] or 0
        if r[3]:
            weekly[key]["scores"].append(float(r[3]))
        if r[4]:
            weekly[key]["rts"].append(float(r[4]))

    result = []
    for ws, data in sorted(weekly.items()):
        result.append({
            "week_start": ws,
            "conversations": data["conversations"],
            "messages": data["messages"],
            "avg_score": round(sum(data["scores"]) / len(data["scores"]), 1) if data["scores"] else 0,
            "avg_response_time_seconds": round(sum(data["rts"]) / len(data["rts"]), 0) if data["rts"] else 0,
        })
    return result


async def get_metrics_timeseries(db: AsyncSession, days: int = 30, date_from: date | None = None, date_to: date | None = None, group_by: str = "day", team: str | None = None) -> list:
    from app.services.timezone import today_brt
    end = date_to or today_brt()
    start = date_from or (end - timedelta(days=days))

    q = (
        select(
            DailyMetric.date,
            func.sum(DailyMetric.conversations_started),
            func.sum(DailyMetric.messages_sent),
            func.avg(DailyMetric.quality_avg),
        )
        .join(Seller)
        .where(and_(DailyMetric.date >= start, DailyMetric.date <= end, Seller.is_active == True))
        .group_by(DailyMetric.date)
        .order_by(DailyMetric.date)
    )
    if team:
        q = q.where(Seller.team == team)
    rows = (await db.execute(q)).all()

    return [
        {
            "date": str(r[0]),
            "period": str(r[0]),
            "conversations": r[1] or 0,
            "messages": r[2] or 0,
            "avg_quality": round(float(r[3]), 1) if r[3] else 0,
            "avg_score": round(float(r[3]), 1) if r[3] else 0,
        }
        for r in rows
    ]
