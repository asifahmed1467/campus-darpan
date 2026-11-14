"""Parse + validate TSF uploads (JSON or CSV), then apply them to the database.

Accepted JSON shapes
  1) {"semester": "...", "faculty": [ {name|email, slots:[...]}, ... ]}
  2) {"semester": "...", "faculty_email": "...", "slots": [...]}        (single teacher)
  3) [ {name|email, slots:[...]}, ... ]
Slot: {"day":"SUN","start":"08:00","end":"09:30","type":"CLASS|CONSULTATION|ADMIN",
       "course":..,"section":..,"room":..,"label":..}
CSV columns: faculty_name,faculty_email,day,start,end,type,course,section,room,label
"""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Faculty, TsfSlot, TsfUpload
from .timeutil import DAYS, fmt_hhmm, parse_hhmm

TYPES = {"CLASS", "CONSULTATION", "ADMIN", "FREE"}
_TITLES = re.compile(r"\b(dr|prof|professor|mr|mrs|ms|md|engr)\b\.?", re.I)


def norm_name(s: str) -> str:
    s = _TITLES.sub(" ", s or "")
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", s.casefold()).split())


@dataclass
class ParsedTeacher:
    name: str | None
    email: str | None
    meta: dict
    slots: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _clean(v):
    if v is None:
        return None
    v = str(v).strip()
    return v or None


def _norm_slot(raw: dict, i: int, errors: list[str], warnings: list[str]):
    where = f"slot {i + 1}"
    day = str(raw.get("day", "")).strip().upper()[:3]
    if day not in DAYS:
        errors.append(f"{where}: day must be one of {', '.join(DAYS)} (got '{raw.get('day')}')")
        return None
    a, b = parse_hhmm(raw.get("start", "")), parse_hhmm(raw.get("end", ""))
    if a is None or b is None:
        errors.append(f"{where} ({day}): start/end must look like 08:00 (got '{raw.get('start')}' / '{raw.get('end')}')")
        return None
    if a >= b:
        errors.append(f"{where} ({day}): start {fmt_hhmm(a)} must be before end {fmt_hhmm(b)}")
        return None
    typ = str(raw.get("type", "CLASS")).strip().upper()
    if typ not in TYPES:
        errors.append(f"{where} ({day}): type must be CLASS, CONSULTATION or ADMIN (got '{raw.get('type')}')")
        return None
    if typ == "FREE":  # FREE is derived by the site, not stored
        warnings.append(f"{where} ({day} {fmt_hhmm(a)}): FREE is ignored; free time is worked out automatically")
        return None
    if typ == "CLASS" and not _clean(raw.get("course")):
        warnings.append(f"{where} ({day} {fmt_hhmm(a)}): class has no course name")
    return {"day": DAYS.index(day), "start": a, "end": b, "type": typ,
            "course": _clean(raw.get("course")), "section": _clean(raw.get("section")),
            "room": _clean(raw.get("room")), "label": _clean(raw.get("label"))}


def _check_overlaps(slots: list[dict], errors: list[str]):
    for d in range(7):
        day = sorted((s for s in slots if s["day"] == d), key=lambda s: s["start"])
        for x, y in zip(day, day[1:]):
            if y["start"] < x["end"]:
                errors.append(f"{DAYS[d]}: {fmt_hhmm(x['start'])}-{fmt_hhmm(x['end'])} {x['type']} overlaps "
                              f"{fmt_hhmm(y['start'])}-{fmt_hhmm(y['end'])} {y['type']}")


def _teacher(entry: dict) -> ParsedTeacher:
    t = ParsedTeacher(
        name=_clean(entry.get("name") or entry.get("faculty_name")),
        email=(_clean(entry.get("email") or entry.get("faculty_email")) or "").lower() or None,
        meta={k: _clean(entry.get(k)) for k in ("faculty_code", "department", "designation", "room", "building")},
    )
    if not t.name and not t.email:
        t.errors.append("Teacher needs a name or an email")
    raw_slots = entry.get("slots")
    if not isinstance(raw_slots, list) or not raw_slots:
        t.errors.append("No slots found")
        return t
    for i, raw in enumerate(raw_slots):
        s = _norm_slot(raw, i, t.errors, t.warnings) if isinstance(raw, dict) else None
        if s:
            t.slots.append(s)
        elif not isinstance(raw, dict):
            t.errors.append(f"slot {i + 1}: must be an object")
    _check_overlaps(t.slots, t.errors)
    return t


def parse(fmt: str, content: str) -> tuple[str | None, list[ParsedTeacher], list[str]]:
    """-> (semester, teachers, global_errors)"""
    fmt = fmt.lower()
    if fmt == "json":
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            return None, [], [f"Not valid JSON: {e.msg} (line {e.lineno}, column {e.colno})"]
        semester = data.get("semester") if isinstance(data, dict) else None
        if isinstance(data, list):
            entries = data
        elif isinstance(data, dict) and isinstance(data.get("faculty"), list):
            entries = data["faculty"]
        elif isinstance(data, dict) and "slots" in data:
            entries = [data]
        else:
            return semester, [], ["JSON must contain a 'faculty' list, or 'slots' for one teacher"]
        return semester, [_teacher(e) for e in entries if isinstance(e, dict)], []
    if fmt == "csv":
        try:
            rows = list(csv.DictReader(io.StringIO(content.lstrip("﻿"))))
        except csv.Error as e:
            return None, [], [f"Not valid CSV: {e}"]
        if not rows:
            return None, [], ["CSV has no rows"]
        needed = {"day", "start", "end"}
        if not needed <= {(h or "").strip().lower() for h in rows[0].keys()}:
            return None, [], [f"CSV needs columns: faculty_name or faculty_email, day, start, end, type (found: {', '.join(rows[0].keys())})"]
        groups: dict[str, dict] = {}
        for r in rows:
            r = {(k or "").strip().lower(): v for k, v in r.items()}
            key = (r.get("faculty_email") or r.get("faculty_name") or "").strip().lower()
            g = groups.setdefault(key, {"name": r.get("faculty_name"), "email": r.get("faculty_email"), "slots": []})
            g["slots"].append(r)
        return None, [_teacher(g) for g in groups.values()], []
    return None, [], [f"Unknown format '{fmt}' (use json or csv)"]


def find_faculty(db: Session, t: ParsedTeacher) -> Faculty | None:
    if t.email:
        f = db.scalar(select(Faculty).where(Faculty.email == t.email))
        if f:
            return f
    if t.name:
        matches = db.scalars(select(Faculty).where(Faculty.name_norm == norm_name(t.name))).all()
        if len(matches) == 1:
            return matches[0]
    return None


def summarize(slots: list[dict]) -> dict:
    out = {"CLASS": 0, "CONSULTATION": 0, "ADMIN": 0}
    for s in slots:
        out[s["type"]] += s["end"] - s["start"]
    return {k: round(v / 60, 2) for k, v in out.items()}


def preview(db: Session, fmt: str, content: str, semester: str | None) -> dict:
    sem, teachers, gerr = parse(fmt, content)
    sem = semester or sem
    report = []
    for t in teachers:
        f = find_faculty(db, t)
        report.append({
            "name": t.name or (f.name if f else t.email), "email": t.email,
            "match": {"id": f.id, "name": f.name} if f else None,
            "will_create": f is None, "slot_count": len(t.slots), "hours": summarize(t.slots),
            "errors": t.errors, "warnings": t.warnings, "slots": t.slots,
        })
    if not sem:
        gerr.append("Semester is missing (add \"semester\": \"Fall 2026-27\" to the file or pick it in the form)")
    return {"semester": sem, "teachers": report, "errors": gerr,
            "ok": not gerr and bool(report) and all(not r["errors"] for r in report)}


def apply(db: Session, fmt: str, content: str, semester: str | None, by: str, create_missing: bool = True) -> dict:
    rep = preview(db, fmt, content, semester)
    if not rep["ok"]:
        return {**rep, "applied": []}
    applied = []
    sem = rep["semester"]
    for t in parse(fmt, content)[1]:
        f = find_faculty(db, t)
        if f is None:
            if not create_missing:
                continue
            name = t.name or t.email.split("@")[0].replace(".", " ").title()
            f = Faculty(name=name, name_norm=norm_name(name), email=t.email, aliases=[],
                        **{k: v for k, v in t.meta.items() if v})
            db.add(f)
            db.flush()
        else:  # fill blanks only; never overwrite curated data with a TSF's partial info
            if t.email and not f.email:
                f.email = t.email
            for k, v in t.meta.items():
                if v and not getattr(f, k):
                    setattr(f, k, v)
        if not f.room:  # office room: the room the teacher holds consultation hours in
            rooms = [s["room"] for s in t.slots if s["type"] == "CONSULTATION" and s["room"]]
            if rooms:
                f.room = max(set(rooms), key=rooms.count)
        db.query(TsfSlot).filter(TsfSlot.faculty_id == f.id, TsfSlot.semester == sem).delete()
        for s in t.slots:
            db.add(TsfSlot(faculty_id=f.id, semester=sem, day=s["day"], start_min=s["start"], end_min=s["end"],
                           type=s["type"], course=s["course"], section=s["section"], room=s["room"], label=s["label"]))
        db.add(TsfUpload(faculty_id=f.id, semester=sem, payload=t.slots, uploaded_by=by))
        applied.append({"id": f.id, "name": f.name, "slots": len(t.slots)})
    db.commit()
    return {**rep, "applied": applied}
