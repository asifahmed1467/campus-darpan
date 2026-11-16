"""AIUB Today: a short daily briefing built only from things the site already has or may freely use.

- exam days and dated notices: read from notice TITLES (the notice list page is allowed; notice pages are not read)
- holidays and the semester week: the academic calendar in the database
- rain and heat: Open-Meteo's free forecast for Kuratoli (no key)
- road traffic near campus: TomTom's free traffic API, only when TOMTOM_KEY is set (the owner adds the key)
Every outside call is cached and fails quietly: the briefing simply leaves that part out.
"""
import math
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

import httpx

AIUB_LAT, AIUB_LON = 23.8222, 90.4273

# Main roads students use to reach AIUB (Kuratoli). Points are approximate; TomTom snaps each to the nearest road.
ROADS = [
    ("Kuril Flyover", 23.8197, 90.4213),
    ("Airport Road, Khilkhet", 23.8296, 90.4196),
    ("Airport Road, Banani", 23.7945, 90.4045),
    ("Pragati Sarani, Jamuna Future Park", 23.8135, 90.4242),
    ("Pragati Sarani, Notun Bazar", 23.7977, 90.4234),
    ("Airport Road, Uttara", 23.8510, 90.4086),
]

_MON = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_MON_RE = r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DATE_A = re.compile(_MON_RE + r"\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", re.I)     # Nov 16, 2026
_DATE_B = re.compile(r"(\d{1,2})(?:st|nd|rd|th)?\s+" + _MON_RE + r",?\s+(\d{4})", re.I)  # 16 Nov 2026
_DAYN = re.compile(r"\bday\s*(\d{1,2})\b", re.I)


def title_dates(title: str) -> list[date]:
    out = []
    for m in _DATE_A.finditer(title):
        try:
            out.append(date(int(m.group(3)), _MON[m.group(1)[:3].lower()], int(m.group(2))))
        except ValueError:
            pass
    for m in _DATE_B.finditer(title):
        try:
            out.append(date(int(m.group(3)), _MON[m.group(2)[:3].lower()], int(m.group(1))))
        except ValueError:
            pass
    return out


def _short(title: str) -> str:
    t = re.sub(r"\s+", " ", title).strip(" ,:-")
    return t if len(t) <= 110 else t[:107].rsplit(" ", 1)[0] + "…"


def describe_notice(title: str, when: date, today: date) -> str:
    """Turn a dated notice title into one plain line, e.g. 'Mid-term exams, day 7 (except LLB and B Pharm)'."""
    t = title.lower()
    rel = "today" if when == today else "tomorrow"
    day = _DAYN.search(title)
    if "seat plan" in t or "exam" in t:
        term = "Final-term" if "final" in t else "Mid-term" if "mid" in t else ""
        who = " (LLB and B Pharm only)" if "only for llb" in t else " (all except LLB and B Pharm)" if "except llb" in t else ""
        base = f"{term} exams{', day ' + day.group(1) if day else ''} {rel}{who}".strip()
        return base[0].upper() + base[1:]
    if "holiday" in t:
        return f"Holiday {rel}: {_short(re.sub(r'(?i)holiday notice:?', '', title))}"
    return f"{rel.capitalize()}: {_short(title)}"


def notice_lines(notices: list[dict], today: date) -> tuple[list[dict], list[dict]]:
    """(dated items for today or tomorrow, other new notices since yesterday). Each notice: {title, url, date}."""
    dated, fresh, seen = [], [], set()
    for n in notices:
        ds = [d for d in title_dates(n["title"]) if d in (today, today + timedelta(days=1))]
        if ds:
            line = describe_notice(n["title"], ds[0], today)
            if line not in seen:
                seen.add(line)
                dated.append({"text": line, "url": n["url"], "when": "today" if ds[0] == today else "tomorrow"})
        elif n.get("date") and n["date"] >= today - timedelta(days=1):
            fresh.append({"text": _short(n["title"]), "url": n["url"]})
    dated.sort(key=lambda x: x["when"] != "today")
    return dated[:4], fresh[:3]


def semester_week(start: date | None, end: date | None, today: date) -> dict | None:
    if not start or not end or not (start <= today <= end):
        return None
    return {"week": (today - start).days // 7 + 1, "of": math.ceil(((end - start).days + 1) / 7)}


# ---------------- outside data, cached ----------------
_cache: dict[str, tuple[float, object]] = {}


def _cached(key: str, ttl: float, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        val = fn()
    except Exception:
        val = hit[1] if hit else None      # keep the last good answer if the service is down
    _cache[key] = (time.time(), val)
    return val


def _hour_label(h: int) -> str:
    return f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}"


def weather_summary(hourly: dict, now: datetime) -> dict | None:
    """From Open-Meteo hourly data: the first rainy hour left today (8 AM to 8 PM) and the day's top temperature."""
    times, rain, temp = hourly.get("time", []), hourly.get("precipitation_probability", []), hourly.get("temperature_2m", [])
    today = now.date().isoformat()
    rows = [(int(t[11:13]), r, c) for t, r, c in zip(times, rain, temp) if t.startswith(today)]
    if not rows:
        return None
    later = [(h, r) for h, r, _ in rows if max(now.hour, 8) <= h <= 20 and r is not None]
    top = max((c for _, _, c in rows if c is not None), default=None)
    out: dict = {"max_temp": round(top) if top is not None else None, "now_temp": None, "rain": None, "text": None}
    cur = [c for h, _, c in rows if h == now.hour]
    if cur and cur[0] is not None:
        out["now_temp"] = round(cur[0])
    heavy = next(((h, r) for h, r in later if r >= 60), None)
    some = max(later, key=lambda x: x[1], default=None)
    if heavy:
        out["rain"] = heavy[1]
        out["text"] = f"Rain likely from {_hour_label(heavy[0])} near campus. Carry an umbrella and expect slower roads."
    elif some and some[1] >= 35:
        out["rain"] = some[1]
        out["text"] = f"Some chance of rain around {_hour_label(some[0])} ({some[1]}%)."
    elif top is not None and top >= 35:
        out["text"] = f"Hot day, up to {round(top)}°C. Carry water."
    else:
        out["text"] = f"No rain expected{f', up to {round(top)}°C' if top is not None else ''}."
    return out


def get_weather(now: datetime) -> dict | None:
    def fetch():
        r = httpx.get("https://api.open-meteo.com/v1/forecast", timeout=6, params={
            "latitude": AIUB_LAT, "longitude": AIUB_LON, "hourly": "precipitation_probability,temperature_2m",
            "timezone": "Asia/Dhaka", "forecast_days": 2})
        r.raise_for_status()
        return r.json().get("hourly", {})
    hourly = _cached("weather", 1800, fetch)
    return weather_summary(hourly, now) if hourly else None


def traffic_level(cur: float, free: float, closed: bool) -> str:
    if closed:
        return "closed"
    ratio = cur / free if free else 1
    return "smooth" if ratio >= 0.75 else "slow" if ratio >= 0.5 else "heavy"


traffic_state = {"status": "not_configured"}   # not_configured | ok | rejected | unavailable (never holds the key)


def get_traffic() -> list[dict] | None:
    key = os.getenv("TOMTOM_KEY", "").strip()
    if not key:
        traffic_state["status"] = "not_configured"
        return None

    def one(road):
        name, lat, lon = road
        r = httpx.get("https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json", timeout=5,
                      params={"point": f"{lat},{lon}", "unit": "KMPH", "key": key})
        if r.status_code in (401, 403):
            traffic_state["status"] = "rejected"
        r.raise_for_status()
        d = r.json()["flowSegmentData"]
        cur, free = d.get("currentSpeed", 0), d.get("freeFlowSpeed", 0)
        delay = max(0, round((d.get("currentTravelTime", 0) - d.get("freeFlowTravelTime", 0)) / 60))
        return {"road": name, "level": traffic_level(cur, free, bool(d.get("roadClosure"))), "speed": cur, "delay_min": delay}

    def fetch():
        with ThreadPoolExecutor(len(ROADS)) as ex:
            rows = [x for x in ex.map(lambda rd: _safe(one, rd), ROADS) if x]
        if not rows:
            if traffic_state["status"] != "rejected":
                traffic_state["status"] = "unavailable"
            raise RuntimeError("no traffic data")
        traffic_state["status"] = "ok"
        order = {"closed": 0, "heavy": 1, "slow": 2, "smooth": 3}
        return sorted(rows, key=lambda x: order[x["level"]])
    rows = _cached("traffic", 600 if traffic_state["status"] == "ok" else 90, fetch)
    return rows


def _safe(fn, arg):
    try:
        return fn(arg)
    except Exception:
        return None
