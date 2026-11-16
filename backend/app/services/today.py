"""AIUB Today: a short daily briefing built only from things the site already has or may freely use.

- exam days and dated notices: read from notice TITLES (the notice list page is allowed; notice pages are not read)
- holidays and the semester week: the academic calendar in the database
- rain and heat: Open-Meteo's free forecast for Kuratoli (no key)
- drive times to AIUB from Uttara, Mirpur, Banani and Badda: Google Maps Routes API, only when GOOGLE_MAPS_KEY is set
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

# Common trips to AIUB (Kuratoli). Live drive times come from Google Maps (Routes API) when GOOGLE_MAPS_KEY is set.
ROUTES = [
    ("Uttara", 23.8740, 90.4005),
    ("Mirpur 10", 23.8069, 90.3687),
    ("Banani", 23.7937, 90.4007),
    ("Badda", 23.7805, 90.4267),
]
TRAFFIC_HOURS = (7, 21)        # only check between 7 AM and 9 PM Dhaka time
TRAFFIC_TTL = 1800             # every 30 minutes: 4 trips x 28 checks = 112 a day, about 3,400 a month

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
    if hit and time.time() - hit[0] < (ttl if hit[1] is not None else 60):   # a failed fetch is retried after a minute
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


def traffic_level(now_s: float, usual_s: float) -> str:
    ratio = now_s / usual_s if usual_s else 1
    return "smooth" if ratio <= 1.2 else "slow" if ratio <= 1.6 else "heavy"


traffic_state = {"status": "not_configured"}   # not_configured | ok | rejected | unavailable | resting (never holds the key)


def _mapbox_trip(token: str, trip) -> dict:
    """Live drive time from Mapbox's traffic-aware profile. The usual time is Mapbox's typical-traffic figure,
    or the no-traffic drive time when that is missing."""
    name, lat, lon = trip
    coords = f"{lon},{lat};{AIUB_LON},{AIUB_LAT}"
    r = httpx.get(f"https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{coords}", timeout=8,
                  params={"access_token": token, "overview": "false", "alternatives": "false"})
    if r.status_code in (401, 403):
        traffic_state["status"] = "rejected"
    r.raise_for_status()
    route = r.json()["routes"][0]
    now_s = float(route["duration"])
    usual_s = route.get("duration_typical")
    if not usual_s:
        r2 = httpx.get(f"https://api.mapbox.com/directions/v5/mapbox/driving/{coords}", timeout=8,
                       params={"access_token": token, "overview": "false"})
        r2.raise_for_status()
        usual_s = r2.json()["routes"][0]["duration"]
    usual_s = float(usual_s)
    return {"road": f"{name} to AIUB", "level": traffic_level(now_s, usual_s), "minutes": round(now_s / 60),
            "usual_min": round(usual_s / 60), "delay_min": max(0, round((now_s - usual_s) / 60)),
            "km": round(route.get("distance", 0) / 1000, 1)}


def traffic_source() -> str | None:
    if os.getenv("MAPBOX_TOKEN", "").strip():
        return "Mapbox"
    if os.getenv("GOOGLE_MAPS_KEY", "").strip():
        return "Google Maps"
    return None


def get_traffic(now: datetime | None = None) -> list[dict] | None:
    token = os.getenv("MAPBOX_TOKEN", "").strip()
    key = os.getenv("GOOGLE_MAPS_KEY", "").strip()
    if not token and not key:
        traffic_state["status"] = "not_configured"
        return None
    if now is not None and not (TRAFFIC_HOURS[0] <= now.hour < TRAFFIC_HOURS[1]):
        traffic_state["status"] = "resting"          # outside 7 AM to 9 PM: no calls, show nothing
        return None

    def one(trip):
        name, lat, lon = trip
        r = httpx.post("https://routes.googleapis.com/directions/v2:computeRoutes", timeout=8,
                       headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters"},
                       json={"origin": {"location": {"latLng": {"latitude": lat, "longitude": lon}}},
                             "destination": {"location": {"latLng": {"latitude": AIUB_LAT, "longitude": AIUB_LON}}},
                             "travelMode": "DRIVE", "routingPreference": "TRAFFIC_AWARE"})
        if r.status_code in (401, 403):
            traffic_state["status"] = "rejected"
        r.raise_for_status()
        route = r.json()["routes"][0]
        now_s, usual_s = float(route["duration"].rstrip("s")), float(route.get("staticDuration", route["duration"]).rstrip("s"))
        return {"road": f"{name} to AIUB", "level": traffic_level(now_s, usual_s), "minutes": round(now_s / 60),
                "usual_min": round(usual_s / 60), "delay_min": max(0, round((now_s - usual_s) / 60)),
                "km": round(route.get("distanceMeters", 0) / 1000, 1)}

    def fetch():
        worker = (lambda t: _mapbox_trip(token, t)) if token else one
        with ThreadPoolExecutor(len(ROUTES)) as ex:
            rows = [x for x in ex.map(lambda t: _safe(worker, t), ROUTES) if x]
        if not rows:
            if traffic_state["status"] != "rejected":
                traffic_state["status"] = "unavailable"
            raise RuntimeError("no traffic data")
        traffic_state["status"] = "ok"
        return rows
    return _cached("traffic", TRAFFIC_TTL if traffic_state["status"] == "ok" else 300, fetch)


def _safe(fn, arg):
    try:
        return fn(arg)
    except Exception:
        return None
