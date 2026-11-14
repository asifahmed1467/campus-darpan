"""Pure "is this teacher free?" logic. No DB, no web: easy to test.

Rules
- If a teacher's TSF has CONSULTATION blocks, "available" = inside a consultation block.
- If it has none, "available" = a gap (>= MIN_GAP) between classes inside 8:00-17:00, on a day
  the teacher has at least one block (basis = "gap", a weaker claim; the UI says "No class now").
- Holidays, weekends and days with no blocks are closed.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from ..config import MIN_GAP_MIN, WEEKEND_DAYS, WORK_END_MIN, WORK_START_MIN
from .timeutil import DAY_NAMES, day_index, fmt_duration, fmt_min


@dataclass(frozen=True)
class Slot:
    day: int
    start: int
    end: int
    type: str  # CLASS / CONSULTATION / ADMIN
    course: str | None = None
    section: str | None = None
    room: str | None = None
    label: str | None = None


def _merge(intervals):
    out: list[list[int]] = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [(a, b) for a, b in out]


class Schedule:
    def __init__(self, slots: list[Slot], default_room: str | None = None):
        self.slots = list(slots)
        self.default_room = default_room
        self.by_day: dict[int, list[Slot]] = {d: [] for d in range(7)}
        for s in self.slots:
            self.by_day[s.day].append(s)
        for d in self.by_day:
            self.by_day[d].sort(key=lambda s: s.start)
        self.has_consultation = any(s.type == "CONSULTATION" for s in self.slots)

    def active(self, day: int) -> bool:
        return bool(self.by_day[day])

    def busy(self, day: int):
        return _merge([(s.start, s.end) for s in self.by_day[day] if s.type in ("CLASS", "ADMIN")])

    def available(self, day: int) -> list[tuple[int, int, str | None]]:
        """Intervals (start, end, room) when students can expect to find the teacher."""
        if not self.active(day):
            return []
        if self.has_consultation:
            cons = [s for s in self.by_day[day] if s.type == "CONSULTATION"]
            merged = _merge([(s.start, s.end) for s in cons])
            out = []
            for a, b in merged:
                room = next((s.room for s in cons if s.room and s.start >= a and s.end <= b), None)
                out.append((a, b, room or self.default_room))
            return out
        out, cursor = [], WORK_START_MIN
        for a, b in self.busy(day) + [(WORK_END_MIN, WORK_END_MIN)]:
            a = min(max(a, WORK_START_MIN), WORK_END_MIN)
            if a - cursor >= MIN_GAP_MIN:
                out.append((cursor, a, self.default_room))
            cursor = max(cursor, min(b, WORK_END_MIN))
        return out


def _closed_reason(sched: Schedule, d: date, holidays: dict[date, str]) -> str | None:
    if d in holidays:
        return holidays[d]
    dow = day_index(d)
    if not sched.active(dow):
        return "Weekend" if dow in WEEKEND_DAYS else f"No schedule on {DAY_NAMES[dow]}"
    return None


def _next_available(sched, now: datetime, holidays, sem_end: date | None):
    m_now = now.hour * 60 + now.minute
    for off in range(0, 15):
        d = now.date() + timedelta(days=off)
        if sem_end and d > sem_end:
            return None
        if _closed_reason(sched, d, holidays):
            continue
        for a, b, room in sched.available(day_index(d)):
            if off == 0 and a <= m_now:
                continue
            minutes_until = off * 1440 + a - m_now
            if off == 0:
                when = f"today at {fmt_min(a)}"
            elif off == 1:
                when = f"tomorrow at {fmt_min(a)}"
            else:
                when = f"on {DAY_NAMES[day_index(d)]} at {fmt_min(a)}"
            return {
                "date": d.isoformat(), "day": DAY_NAMES[day_index(d)],
                "start": a, "end": b, "start_label": fmt_min(a), "end_label": fmt_min(b),
                "minutes_until": minutes_until, "when": when, "room": room,
            }
    return None


def compute_status(sched: Schedule | None, now: datetime, holidays: dict[date, str] | None = None,
                   sem_start: date | None = None, sem_end: date | None = None) -> dict:
    """status: available | in_class | admin | unavailable | off | no_schedule"""
    holidays = holidays or {}
    base = {"now": now.isoformat(), "basis": None, "until": None, "minutes_left": None,
            "current": None, "next": None, "reason": None, "room": None}
    if sched is None or not sched.slots:
        return {**base, "status": "no_schedule", "reason": "Schedule not available yet"}
    today = now.date()
    if (sem_start and today < sem_start) or (sem_end and today > sem_end):
        return {**base, "status": "no_schedule", "reason": "Outside the current semester's dates"}

    basis = "consultation" if sched.has_consultation else "gap"
    base["basis"] = basis
    reason = _closed_reason(sched, today, holidays)
    if reason:
        return {**base, "status": "off", "reason": reason,
                "next": _next_available(sched, now, holidays, sem_end)}

    dow, m = day_index(today), now.hour * 60 + now.minute
    cur = next((s for s in sched.by_day[dow] if s.start <= m < s.end and s.type != "CONSULTATION"), None)
    if cur:
        busy_end = next((b for a, b in sched.busy(dow) if a <= m < b), cur.end)
        return {**base, "status": "in_class" if cur.type == "CLASS" else "admin",
                "until": fmt_min(busy_end), "minutes_left": busy_end - m,
                "current": {"type": cur.type, "course": cur.course, "section": cur.section,
                            "room": cur.room, "label": cur.label},
                "next": _next_available(sched, now, holidays, sem_end)}

    for a, b, room in sched.available(dow):
        if a <= m < b:
            return {**base, "status": "available", "until": fmt_min(b), "minutes_left": b - m,
                    "room": room, "next": _next_available(sched, now, holidays, sem_end)}

    return {**base, "status": "unavailable",
            "reason": "Outside class and consultation hours" if basis == "consultation" else "Outside campus hours",
            "next": _next_available(sched, now, holidays, sem_end)}


def describe(name: str, st: dict, default_room: str | None = None) -> str:
    """Plain sentence (no emoji) for chat + text-to-speech."""
    nxt, status = st.get("next"), st["status"]
    nxt_txt = f" Next available {nxt['when']}" + (f" (room {nxt['room']})" if nxt.get("room") else "") + "." if nxt else ""
    room = st.get("room") or default_room
    room_txt = f" Room {room}." if room else ""
    if status == "no_schedule":
        return f"{name}'s schedule is not available yet." if st.get("reason", "").startswith("Schedule") \
            else f"{name}: {st['reason']}."
    if status == "available":
        if st["basis"] == "consultation":
            return f"{name} is in consultation hours now, until {st['until']} ({fmt_duration(st['minutes_left'])} left).{room_txt}"
        return f"{name} has no class right now, free until {st['until']} ({fmt_duration(st['minutes_left'])}). No consultation hours are listed.{room_txt}"
    if status == "in_class":
        c = st["current"]
        what = f" ({c['course']}{' ' + c['section'] if c.get('section') else ''})" if c.get("course") else ""
        return f"{name} is in class{what} until {st['until']}.{nxt_txt}"
    if status == "admin":
        return f"{name} is on administrative duty until {st['until']}.{nxt_txt}"
    if status == "off":
        return f"{name} is not scheduled today ({st['reason']}).{nxt_txt}"
    return f"{name} is not in class or consultation right now.{nxt_txt}"
