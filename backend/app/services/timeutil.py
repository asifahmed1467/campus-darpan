import re
from datetime import datetime
from zoneinfo import ZoneInfo

from ..config import TIMEZONE

DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
TZ = ZoneInfo(TIMEZONE)
_HHMM = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def now_local() -> datetime:
    return datetime.now(TZ)


def to_local(dt: datetime) -> datetime:
    return dt.replace(tzinfo=TZ) if dt.tzinfo is None else dt.astimezone(TZ)


def parse_hhmm(s: str) -> int | None:
    m = _HHMM.match(str(s).strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def fmt_min(m: int) -> str:
    h, mi = divmod(m, 60)
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{mi:02d} {suffix}"


def fmt_hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def day_index(d) -> int:
    """python date -> SUN=0..SAT=6"""
    return (d.weekday() + 1) % 7


def fmt_duration(mins: int) -> str:
    if mins < 60:
        return f"{mins} min"
    h, m = divmod(mins, 60)
    return f"{h} h {m} min" if m else f"{h} h"
