"""In-memory snapshot of faculty + schedules + holidays, reloaded every STORE_TTL_SEC or on admin writes.

Read endpoints (search, status, profiles) never hit the database per request, which is what lets
one small server handle thousands of students. Multiple workers each keep their own snapshot and
refresh within STORE_TTL_SEC of any change.
"""
from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import STORE_TTL_SEC
from ..models import Document, Faculty, Holiday, Semester, TsfSlot
from .free_time import Schedule, Slot
from .tsf_import import norm_name


@dataclass
class FacultyView:
    id: int
    name: str
    email: str | None
    faculty_code: str | None
    department: str | None
    designation: str | None
    room: str | None
    building: str | None
    photo_url: str | None
    profile_url: str | None
    aliases: list
    name_tokens: list
    other_tokens: list
    has_tsf: bool


class Snapshot:
    def __init__(self):
        self.faculty: dict[int, FacultyView] = {}
        self.schedules: dict[int, Schedule] = {}
        self.holidays: dict[date, str] = {}
        self.sem_name: str | None = None
        self.sem_start: date | None = None
        self.sem_end: date | None = None
        self.chunks: list[dict] = []  # knowledge-base paragraphs for Ask AIUB
        self.search_cache: dict = {}  # (query, faculty, limit) -> results; dropped whenever the snapshot reloads


def _tokens(s: str | None) -> list[str]:
    return [t for t in re.sub(r"[^a-z0-9]+", " ", (s or "").casefold()).split() if t]


def _chunk(text: str, size: int = 700) -> list[str]:
    out, cur = [], ""
    for para in re.split(r"\n\s*\n|\r\n\s*\r\n", text):
        para = " ".join(para.split())
        if not para:
            continue
        if cur and len(cur) + len(para) > size:
            out.append(cur)
            cur = para
        else:
            cur = f"{cur} {para}".strip()
    if cur:
        out.append(cur)
    return out


class Store:
    def __init__(self):
        self._lock = threading.Lock()
        self._snap = Snapshot()
        self._loaded = 0.0

    def invalidate(self):
        self._loaded = 0.0

    def get(self, db: Session) -> Snapshot:
        if time.time() - self._loaded > STORE_TTL_SEC:
            with self._lock:
                if time.time() - self._loaded > STORE_TTL_SEC:
                    self._snap = self._load(db)
                    self._loaded = time.time()
        return self._snap

    @staticmethod
    def _load(db: Session) -> Snapshot:
        snap = Snapshot()
        sem = db.scalar(select(Semester).where(Semester.is_active.is_(True)))
        if sem:
            snap.sem_name, snap.sem_start, snap.sem_end = sem.name, sem.start_date, sem.end_date
        snap.holidays = {h.date: h.name for h in db.scalars(select(Holiday))}

        by_fac: dict[int, list[Slot]] = {}
        courses: dict[int, set[str]] = {}
        q = select(TsfSlot)
        if snap.sem_name:
            q = q.where(TsfSlot.semester == snap.sem_name)
        for s in db.scalars(q):
            by_fac.setdefault(s.faculty_id, []).append(
                Slot(s.day, s.start_min, s.end_min, s.type, s.course, s.section, s.room, s.label))
            if s.course:
                courses.setdefault(s.faculty_id, set()).add(s.course)

        for f in db.scalars(select(Faculty)):
            other = _tokens(f.department) + _tokens((f.email or "").split("@")[0]) + _tokens(f.room) \
                + _tokens(f.faculty_code) + [t for a in (f.aliases or []) for t in _tokens(a)] \
                + [t for c in courses.get(f.id, ()) for t in _tokens(c)]
            snap.faculty[f.id] = FacultyView(
                f.id, f.name, f.email, f.faculty_code, f.department, f.designation, f.room, f.building,
                f.photo_url, f.profile_url, f.aliases or [], _tokens(norm_name(f.name)), other, f.id in by_fac)
            if f.id in by_fac:
                snap.schedules[f.id] = Schedule(by_fac[f.id], default_room=f.room)

        for d in db.scalars(select(Document)):
            for i, c in enumerate(_chunk(d.text)):
                snap.chunks.append({"url": d.url, "title": d.title, "text": c, "tokens": set(_tokens(c)), "n": i})
        return snap


store = Store()


# ---------------- search (prefix + typo tolerant) ----------------
def _lev_le(a: str, b: str, k: int) -> int:
    """Edit distance, or k+1 as soon as it is certain to exceed k."""
    if abs(len(a) - len(b)) > k:
        return k + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > k:
            return k + 1
        prev = cur
    return prev[-1]


def _tok_score(q: str, tokens: list[str], fuzzy: bool) -> float:
    best = 0.0
    allowed = (2 if len(q) >= 7 else 1 if len(q) >= 4 else 0) if fuzzy else 0
    for t in tokens:
        if t.startswith(q):
            sc = 100 - min(len(t) - len(q), 20)
        elif len(q) >= 3 and q in t:
            sc = 55
        elif allowed and len(t) >= len(q) - allowed:
            d = min(_lev_le(q, t, allowed), _lev_le(q, t[: len(q)], allowed - 1) + 1 if allowed > 1 or len(t) >= len(q) else allowed + 1)
            sc = 80 - 15 * d if d <= allowed else 0
        else:
            sc = 0
        if sc > best:
            best = sc
    return best


def _run(snap: Snapshot, qn: str, qts: list[str], faculty_code: str | None, fuzzy: bool):
    scored = []
    for f in snap.faculty.values():
        if faculty_code and (f.faculty_code or "").upper() != faculty_code.upper():
            continue
        total, ok = 0.0, True
        for qt in qts:
            s = max(_tok_score(qt, f.name_tokens, fuzzy), _tok_score(qt, f.other_tokens, fuzzy) * 0.6)
            if s <= 0:
                ok = False
                break
            total += s
        if ok:
            if " ".join(f.name_tokens).startswith(qn):
                total += 30
            scored.append((total, f))
    scored.sort(key=lambda x: (-x[0], x[1].name))
    return scored


def search(snap: Snapshot, query: str, limit: int = 8, faculty_code: str | None = None) -> list[tuple[float, FacultyView]]:
    qn = norm_name(query)
    qts = qn.split()
    if not qts:
        return []
    key = (qn, faculty_code, limit)
    hit = snap.search_cache.get(key)
    if hit is not None:
        return hit
    scored = _run(snap, qn, qts, faculty_code, fuzzy=False)   # fast pass: exact / prefix / substring
    if not scored:
        scored = _run(snap, qn, qts, faculty_code, fuzzy=True)  # typo pass, only when nothing matched
    out = scored[:limit]
    if len(snap.search_cache) > 4000:
        snap.search_cache.clear()
    snap.search_cache[key] = out
    return out


_STOP = set("""when is are was will the a an of in on at to for sir madam maam mam miss mr mrs ms dr prof professor
free available availability consultation consulting office hour hours time where room located find can i you me my
please tell what who how next now today tomorrow does do he she his her their teacher faculty lecturer""".split())


def find_faculty_in_text(snap: Snapshot, text: str):
    words = [w for w in _tokens(text) if w not in _STOP]
    if not words:
        return None
    res = search(snap, " ".join(words), limit=1)
    if not res and len(words) > 1:  # try each word on its own, longest first
        for w in sorted(words, key=len, reverse=True):
            res = search(snap, w, limit=1)
            if res and res[0][0] >= 90:
                break
            res = []
    return res[0][1] if res and res[0][0] >= 90 else None


def search_chunks(snap: Snapshot, question: str, k: int = 3):
    qt = {w for w in _tokens(question) if w not in _STOP and len(w) > 2}
    if not qt:
        return []
    hits = []
    for c in snap.chunks:
        overlap = len(qt & c["tokens"])
        if overlap:
            hits.append((overlap / (len(qt) ** 0.5), c))
    hits.sort(key=lambda x: -x[0])
    return [c for s, c in hits[:k] if s >= 1.0]
