import asyncio
import json
import re
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import client_ip, rate_limit
from ..config import ALLOW_TIME_TRAVEL
from ..db import get_db
from ..models import AskLog, Notice
from ..services.campus import BUILDINGS, building_dict, parse_room
from ..services.free_time import compute_status, describe
from ..services.notices import notice_dict
from ..services.realtime import broadcaster, presence
from ..services.store import FacultyView, Snapshot, find_faculty_in_text, search, search_chunks, store
from ..services.timeutil import DAYS, day_index, fmt_hhmm, fmt_min, now_local, to_local

router = APIRouter(prefix="/api")


def _now(at: str | None) -> datetime:
    if at and ALLOW_TIME_TRAVEL:
        try:
            return to_local(datetime.fromisoformat(at))
        except ValueError:
            raise HTTPException(400, "at must look like 2026-11-15T10:30")
    return now_local()


def _status(snap: Snapshot, f: FacultyView, now: datetime) -> dict:
    return compute_status(snap.schedules.get(f.id), now, snap.holidays, snap.sem_start, snap.sem_end)


def _card(snap: Snapshot, f: FacultyView, now: datetime) -> dict:
    st = _status(snap, f, now)
    sched = snap.schedules.get(f.id)
    dow = day_index(now.date())
    today = [] if (not sched or now.date() in snap.holidays) else [
        {"start": s.start, "end": s.end, "type": s.type} for s in sched.by_day[dow]]
    return {"id": f.id, "name": f.name, "email": f.email, "faculty_code": f.faculty_code, "today": today,
            "department": f.department, "designation": f.designation, "room": f.room, "building": f.building,
            "photo_url": f.photo_url, "profile_url": f.profile_url, "has_tsf": f.has_tsf, "room_info": parse_room(f.room),
            "status": st, "message": describe(f.name, st, f.room)}


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/meta")
def meta(at: str | None = None, db: Session = Depends(get_db)):
    snap, now = store.get(db), _now(at)
    upcoming = sorted((d, n) for d, n in snap.holidays.items() if d >= now.date())[:5]
    codes: dict[str, int] = {}
    for f in snap.faculty.values():
        codes[f.faculty_code or "Other"] = codes.get(f.faculty_code or "Other", 0) + 1
    return {"now": now.isoformat(), "semester": snap.sem_name,
            "semester_start": snap.sem_start.isoformat() if snap.sem_start else None,
            "semester_end": snap.sem_end.isoformat() if snap.sem_end else None,
            "upcoming_holidays": [{"date": d.isoformat(), "name": n} for d, n in upcoming],
            "faculty_total": len(snap.faculty), "with_tsf": len(snap.schedules), "by_faculty": codes}


# ---------------- faculty ----------------
@router.get("/faculty")
def list_faculty(q: str | None = None, faculty: str | None = None, status: str | None = None,
                 limit: int = Query(24, ge=1, le=100), offset: int = Query(0, ge=0), at: str | None = None,
                 db: Session = Depends(get_db)):
    snap, now = store.get(db), _now(at)
    if q:
        rows = [f for _, f in search(snap, q, limit=500, faculty_code=faculty)]
    else:
        rows = sorted((f for f in snap.faculty.values()
                       if not faculty or (f.faculty_code or "").upper() == faculty.upper()), key=lambda f: f.name)
    cards = [_card(snap, f, now) for f in rows]
    if status:
        cards = [c for c in cards if c["status"]["status"] == status]
    return {"total": len(cards), "items": cards[offset:offset + limit], "now": now.isoformat()}


def _get(snap: Snapshot, fid: int) -> FacultyView:
    f = snap.faculty.get(fid)
    if not f:
        raise HTTPException(404, "Faculty not found")
    return f


@router.get("/faculty/{fid}")
def faculty_profile(fid: int, at: str | None = None, db: Session = Depends(get_db)):
    snap, now = store.get(db), _now(at)
    f = _get(snap, fid)
    sched = snap.schedules.get(fid)
    week = []
    for d in range(7):
        week.append({"day": DAYS[d], "slots": [
            {"start": fmt_hhmm(s.start), "end": fmt_hhmm(s.end), "start_label": fmt_min(s.start),
             "end_label": fmt_min(s.end), "type": s.type, "course": s.course, "section": s.section,
             "room": s.room, "label": s.label} for s in (sched.by_day[d] if sched else [])]})
    return {**_card(snap, f, now), "semester": snap.sem_name, "week": week}


@router.get("/faculty/{fid}/next-free")
def next_free(fid: int, at: str | None = None, db: Session = Depends(get_db)):
    snap, now = store.get(db), _now(at)
    f = _get(snap, fid)
    st = _status(snap, f, now)
    return {"id": f.id, "name": f.name, "status": st, "message": describe(f.name, st, f.room)}


@router.get("/search/suggest")
def suggest(q: str = Query("", max_length=80), at: str | None = None, db: Session = Depends(get_db)):
    snap, now = store.get(db), _now(at)
    out = []
    for _, f in search(snap, q, limit=8):
        st = _status(snap, f, now)
        out.append({"id": f.id, "name": f.name, "department": f.department, "faculty_code": f.faculty_code,
                    "room": f.room, "status": st["status"], "basis": st["basis"], "until": st["until"],
                    "next_when": st["next"]["when"] if st["next"] else None})
    return {"q": q, "items": out}


# ---------------- notices ----------------
_notice_cache: dict[tuple, tuple[float, dict]] = {}


def clear_notice_cache():
    _notice_cache.clear()


@router.get("/notices")
def list_notices(tag: str | None = None, q: str | None = None, limit: int = Query(20, ge=1, le=100),
                 before_id: int | None = None, db: Session = Depends(get_db)):
    key = (tag, q, limit, before_id)
    hit = _notice_cache.get(key)
    if hit and time.time() - hit[0] < 5:  # 5 s: thousands of students share one DB query
        return hit[1]
    stmt = select(Notice).order_by(Notice.published_date.desc().nullslast(), Notice.id.desc())
    if before_id:
        stmt = stmt.where(Notice.id < before_id)
    if q:
        stmt = stmt.where(Notice.title.ilike(f"%{q[:80]}%"))
    rows = db.scalars(stmt.limit(500 if tag else limit)).all()
    if tag:
        rows = [n for n in rows if tag in (n.tags or [])][:limit]
    out = {"items": [notice_dict(n) for n in rows], "latest_id": db.scalar(select(func.max(Notice.id))) or 0}
    if len(_notice_cache) > 200:
        _notice_cache.clear()
    _notice_cache[key] = (time.time(), out)
    return out


@router.get("/notices/stream")
async def notice_stream(request: Request):
    q = broadcaster.subscribe()

    async def gen():
        try:
            yield "retry: 5000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"event: {ev['type']}\ndata: {json.dumps(ev, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            broadcaster.unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------- presence ----------------
class Beat(BaseModel):
    vid: str = Field(min_length=8, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")


@router.post("/presence/heartbeat")
def heartbeat(b: Beat, request: Request):
    # Limit per device (many students share campus Wi-Fi IPs); the per-IP ceiling only stops floods.
    rate_limit(f"hb:{b.vid}", 20, 60)
    rate_limit(f"hbip:{client_ip(request)}", 6000, 60)
    presence.beat(b.vid, now_local().date())
    return {"online": presence.count()}


@router.get("/presence/count")
def presence_count():
    return {"online": presence.count()}


# ---------------- Ask AIUB ----------------
class Ask(BaseModel):
    question: str = Field(min_length=2, max_length=300)
    at: str | None = None


@router.post("/ask")
def ask(body: Ask, request: Request, db: Session = Depends(get_db)):
    vid = request.headers.get("x-visitor", "")[:40]
    if vid:
        rate_limit(f"ask:{vid}", 10, 60)
    rate_limit(f"askip:{client_ip(request)}", 300, 60)  # shared campus IPs: generous, flood backstop only
    snap, now, question = store.get(db), _now(body.at), body.question.strip()
    mode, answered = "none", True
    result: dict

    f = find_faculty_in_text(snap, question)
    if f:
        st = _status(snap, f, now)
        msg = describe(f.name, st, f.room)
        if re.search(r"\broom|where|office|located", question, re.I) and f.room:
            msg = f"{f.name}'s room is {f.room}" + (f" ({f.building})" if f.building else "") + ". " + msg
        mode = "faculty"
        result = {"answer": msg, "faculty": _card(snap, f, now),
                  "sources": [{"title": f"{f.name}: faculty schedule on this site", "url": f"/faculty/{f.id}"}]}
    elif re.search(r"\b(notice|circular|announcement|latest news)\b", question, re.I):
        rows = db.scalars(select(Notice).order_by(Notice.id.desc()).limit(3)).all()
        mode = "notices"
        answered = bool(rows)
        result = {"answer": "Here are the latest notices:" if rows else "No notices have been loaded yet.",
                  "sources": [{"title": n.title, "url": n.url} for n in rows]}
    else:
        hits = search_chunks(snap, question)
        if hits:
            mode = "docs"
            result = {"answer": "From the AIUB website: " + hits[0]["text"][:600],
                      "sources": [{"title": h["title"], "url": h["url"]} for h in hits]}
        else:
            answered = False
            result = {"answer": "I couldn't find this in the AIUB pages I have so far. You can ask about a teacher "
                                "(for example \"When is Nyme Ahmed free?\"), or check aiub.edu directly.",
                      "sources": [{"title": "AIUB website", "url": "https://www.aiub.edu/"}]}
    try:
        db.add(AskLog(question=question[:500], mode=mode, answered=answered))
        db.commit()
    except Exception:
        db.rollback()
    return {"mode": mode, "answered": answered, **result}


# ---------------- campus map and room codes ----------------
@router.get("/campus")
def campus(response: Response):
    response.headers["Cache-Control"] = "public, max-age=300"
    return {"buildings": [building_dict(b) for b in BUILDINGS],
            "rule": "Annex rooms: first digit is the Annex, then the floor, then two digits for the room. 9204 = Annex 9, 2nd floor, room 04."}


@router.get("/rooms")
def rooms(q: str | None = None):
    r = parse_room(q)
    if r is None:
        return {"q": q, "result": None, "message": "Type a room number, for example 9204."}
    return {"q": q, "result": r, "message": r["message"]}
