from datetime import datetime, timezone, timedelta

BRT = timezone(timedelta(hours=-3))


def now_brt() -> datetime:
    return datetime.now(BRT)


def to_brt(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(BRT)


def today_brt():
    return now_brt().date()
