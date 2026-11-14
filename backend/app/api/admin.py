import csv
import io
import json
import re
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import (client_ip, get_admin_by_username, hash_password, make_token, rate_limit, require_admin,
                    require_super, verify_password)
from ..db import get_db
from ..models import Admin, AskLog, Document, Faculty, Holiday, Notice, Semester, TsfUpload, Visitor
from ..services import tsf_import
from ..services.notices import ingest_notice
from ..services.realtime import presence
from ..services.store import store
from ..services.timeutil import now_local

router = APIRouter(prefix="/api/admin")


class Login(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: Login, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"login:{client_ip(request)}", 8, 300)
    a = get_admin_by_username(db, body.username)
    if not a or not a.is_active or not verify_password(body.password, a.password_hash):
        raise HTTPException(401, "Wrong username or password")
    return {"token": make_token(a), "admin": {"name": a.name, "username": a.username, "role": a.role}}


@router.get("/me")
def me(a: Admin = Depends(require_admin)):
    return {"name": a.name, "username": a.username, "role": a.role}


# ---------------- TSF ----------------
class TsfIn(BaseModel):
    format: str = Field(pattern="^(json|csv)$")
    content: str = Field(min_length=2, max_length=2_000_000)
    semester: str | None = None
    create_missing: bool = True


@router.post("/tsf/preview")
def tsf_preview(b: TsfIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    return tsf_import.preview(db, b.format, b.content, b.semester)


@router.post("/tsf/confirm")
def tsf_confirm(b: TsfIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    res = tsf_import.apply(db, b.format, b.content, b.semester, a.username, b.create_missing)
    if not res["ok"]:
        raise HTTPException(422, {"message": "Fix the errors and upload again", "report": res})
    store.invalidate()
    return res


@router.get("/tsf/history")
def tsf_history(faculty_id: int | None = None, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(TsfUpload, Faculty.name).join(Faculty, Faculty.id == TsfUpload.faculty_id).order_by(TsfUpload.id.desc()).limit(60)
    if faculty_id:
        stmt = stmt.where(TsfUpload.faculty_id == faculty_id)
    return [{"id": u.id, "faculty_id": u.faculty_id, "faculty": n, "semester": u.semester, "by": u.uploaded_by,
             "at": u.uploaded_at.isoformat(), "slots": len(u.payload)} for u, n in db.execute(stmt)]


@router.get("/faculty/missing-tsf")
def missing_tsf(a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    snap = store.get(db)
    return {"total": len(snap.faculty),
            "items": [{"id": f.id, "name": f.name, "faculty_code": f.faculty_code, "department": f.department,
                       "email": f.email} for f in sorted(snap.faculty.values(), key=lambda f: f.name) if not f.has_tsf]}


# ---------------- faculty directory ----------------
class FacultyIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: str | None = None
    faculty_code: str | None = None
    department: str | None = None
    designation: str | None = None
    room: str | None = None
    building: str | None = None
    photo_url: str | None = None
    profile_url: str | None = None
    aliases: list[str] = []


@router.post("/faculty")
def create_faculty(b: FacultyIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    data = {k: (v.strip() or None) if isinstance(v, str) else v for k, v in b.model_dump().items()}
    if data["email"]:
        data["email"] = data["email"].lower()
        if db.scalar(select(Faculty).where(Faculty.email == data["email"])):
            raise HTTPException(409, "A teacher with this email already exists")
    f = Faculty(**data, name_norm=tsf_import.norm_name(b.name))
    db.add(f)
    db.commit()
    store.invalidate()
    return {"id": f.id}


@router.put("/faculty/{fid}")
def update_faculty(fid: int, b: FacultyIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    f = db.get(Faculty, fid)
    if not f:
        raise HTTPException(404, "Faculty not found")
    for k, v in b.model_dump().items():
        setattr(f, k, (v.strip() or None) if isinstance(v, str) else v)
    f.email = f.email.lower() if f.email else None
    f.name_norm = tsf_import.norm_name(f.name)
    db.commit()
    store.invalidate()
    return {"ok": True}


@router.delete("/faculty/{fid}")
def delete_faculty(fid: int, a: Admin = Depends(require_super), db: Session = Depends(get_db)):
    f = db.get(Faculty, fid)
    if not f:
        raise HTTPException(404, "Faculty not found")
    db.delete(f)
    db.commit()
    store.invalidate()
    return {"ok": True}


class ImportIn(BaseModel):
    format: str = Field(pattern="^(json|csv)$")
    content: str = Field(max_length=2_000_000)


_KEEP_UPPER = {"PHD", "PHD.,", "SFHEA", "IQAC", "OSA", "CS", "EEE", "CSE", "II", "III", "IV", "MBA", "BBA", "CoE", "COE"}


def _tidy(text: str | None) -> str | None:
    """AIUB lists many names in ALL CAPS; show them as 'Dr. Md. Anwarul Kabir'. Mixed-case text is left alone."""
    if not text or text != text.upper():
        return text or None

    def word(w: str) -> str:
        if w.strip(",.[]()") in _KEEP_UPPER or re.fullmatch(r"(?:[A-Z]\.)+[A-Z]?\.?", w):
            return w
        return "-".join(p.capitalize() for p in w.split("-"))
    return " ".join(word(w) for w in text.split())


def _tidy_designation(text: str | None) -> str | None:
    parts = [p.strip() for p in (text or "").split(",") if p.strip() and p.strip().lower() != "faculty"]
    return ", ".join(_tidy(p) or p for p in parts) or None


@router.post("/faculty/import")
def import_faculty(b: ImportIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    """Bulk add/update the directory (CSV columns: name,email,faculty_code,department,designation,room,building,photo_url,profile_url).
    Teachers are matched by email. A row without a known email only matches a teacher who has no email yet, by name,
    so two different people called 'Mehedi Hasan' stay two people."""
    try:
        rows = list(csv.DictReader(io.StringIO(b.content.lstrip("\ufeff")))) if b.format == "csv" else json.loads(b.content)
    except Exception as e:
        raise HTTPException(400, f"Could not read the file: {e}")
    created = updated = 0
    errors = []
    for i, r in enumerate(rows, 1):
        r = {(k or "").strip().lower(): (v.strip() if isinstance(v, str) else v) for k, v in r.items()}
        name = r.get("name")
        if not name:
            errors.append(f"row {i}: name is missing")
            continue
        email = (r.get("email") or "").lower() or None
        f = db.scalar(select(Faculty).where(Faculty.email == email)) if email else None
        if not f:
            same_name = db.scalars(select(Faculty).where(Faculty.name_norm == tsf_import.norm_name(name))).all()
            f = next((x for x in same_name if not x.email), None) or (same_name[0] if same_name and not email else None)
        fields = {k: r.get(k) or None for k in ("faculty_code", "department", "designation", "room", "building", "photo_url", "profile_url")}
        fields["designation"] = _tidy_designation(fields["designation"])
        if f:
            for k, v in fields.items():
                if v:
                    setattr(f, k, v)
            if email and not f.email:
                f.email = email
            updated += 1
        else:
            db.add(Faculty(name=_tidy(name), name_norm=tsf_import.norm_name(name), email=email, aliases=[], **fields))
            created += 1
    db.commit()
    store.invalidate()
    return {"created": created, "updated": updated, "errors": errors}


# ---------------- calendar ----------------
class HolidayIn(BaseModel):
    date: date
    name: str = Field(min_length=2, max_length=200)


@router.get("/holidays")
def holidays(a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    return [{"id": h.id, "date": h.date.isoformat(), "name": h.name} for h in db.scalars(select(Holiday).order_by(Holiday.date))]


@router.post("/holidays")
def add_holiday(b: HolidayIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    h = db.scalar(select(Holiday).where(Holiday.date == b.date))
    if h:
        h.name = b.name
    else:
        db.add(Holiday(date=b.date, name=b.name))
    db.commit()
    store.invalidate()
    return {"ok": True}


@router.delete("/holidays/{hid}")
def del_holiday(hid: int, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    h = db.get(Holiday, hid)
    if h:
        db.delete(h)
        db.commit()
        store.invalidate()
    return {"ok": True}


class SemesterIn(BaseModel):
    name: str
    start_date: date
    end_date: date


@router.put("/semester")
def set_semester(b: SemesterIn, a: Admin = Depends(require_super), db: Session = Depends(get_db)):
    if b.end_date <= b.start_date:
        raise HTTPException(422, "End date must be after start date")
    for s in db.scalars(select(Semester)):
        s.is_active = False
    s = db.scalar(select(Semester).where(Semester.name == b.name))
    if s:
        s.start_date, s.end_date, s.is_active = b.start_date, b.end_date, True
    else:
        db.add(Semester(name=b.name, start_date=b.start_date, end_date=b.end_date, is_active=True))
    db.commit()
    store.invalidate()
    return {"ok": True}


# ---------------- notices + knowledge base ----------------
class NoticeIn(BaseModel):
    title: str = Field(min_length=3, max_length=500)
    url: str = Field(min_length=8, max_length=600)
    published_date: date | None = None
    body: str | None = None
    tags: list[str] | None = None


@router.post("/notices")
def add_notice(b: NoticeIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    n, created = ingest_notice(db, b.title, b.url, b.published_date, b.body, b.tags, source="admin")
    return {"id": n.id, "created": created}


class DocIn(BaseModel):
    url: str = Field(min_length=8, max_length=600)
    title: str = Field(min_length=2, max_length=300)
    text: str = Field(min_length=20, max_length=200_000)


@router.post("/documents")
def add_document(b: DocIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    d = db.scalar(select(Document).where(Document.url == b.url))
    if d:
        d.title, d.text = b.title, b.text
    else:
        db.add(Document(url=b.url, title=b.title, text=b.text))
    db.commit()
    store.invalidate()
    return {"ok": True}


# ---------------- admins + analytics ----------------
class AdminIn(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-z0-9._-]+$")
    name: str
    password: str = Field(min_length=10, max_length=100)
    role: str = Field(default="editor", pattern="^(editor|super_admin)$")


@router.post("/admins")
def create_admin(b: AdminIn, a: Admin = Depends(require_super), db: Session = Depends(get_db)):
    if get_admin_by_username(db, b.username):
        raise HTTPException(409, "Username already taken")
    db.add(Admin(username=b.username, name=b.name, password_hash=hash_password(b.password), role=b.role))
    db.commit()
    return {"ok": True}


@router.get("/analytics")
def analytics(a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    today = now_local().date()

    def uniq(days):
        return db.scalar(select(func.count(func.distinct(Visitor.vid))).where(Visitor.day > today - timedelta(days=days))) or 0
    since = datetime.now(timezone.utc) - timedelta(days=7)
    unanswered = db.scalars(select(AskLog).where(AskLog.answered.is_(False)).order_by(AskLog.id.desc()).limit(15)).all()
    snap = store.get(db)
    return {"online_now": presence.count(), "peak_since_restart": presence.peak[0],
            "unique_today": uniq(1), "unique_7d": uniq(7), "unique_30d": uniq(30),
            "asks_7d": db.scalar(select(func.count(AskLog.id)).where(AskLog.created_at >= since)) or 0,
            "unanswered": [{"q": u.question, "at": u.created_at.isoformat()} for u in unanswered],
            "faculty_total": len(snap.faculty), "faculty_without_tsf": len(snap.faculty) - len(snap.schedules),
            "notices_total": db.scalar(select(func.count(Notice.id))) or 0}
