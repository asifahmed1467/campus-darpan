"""python -m app.seed [--demo]

Loads the Fall 2026-27 semester dates, official holidays, the first 5 real TSFs, and creates the first admin.
--demo also adds a few clearly-labelled demo notices so the Notices page isn't empty before the scraper is live.
"""
import os
import secrets
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

from .auth import hash_password
from .db import SessionLocal, init_db
from .models import Admin, Holiday, Notice, Semester
from .services import tsf_import

SEMESTER = ("Fall 2026-27", date(2026, 9, 27), date(2027, 1, 3))
# From https://www.aiub.edu/academic-calendar (Fall 2026-27). AIUB may change it: admins can edit.
HOLIDAYS = [
    (date(2026, 10, 20), "Durga Puja"), (date(2026, 10, 21), "Durga Puja"),
    (date(2026, 12, 6), "No classes (academic calendar)"),
    (date(2026, 12, 16), "Victory Day"), (date(2026, 12, 25), "Christmas Day"),
]
DEMO_NOTICES = [
    ("[DEMO] Final term exam schedule, Fall 2026-27", "https://example.invalid/demo-1", date(2026, 11, 12)),
    ("[DEMO] Scholarship and waiver application open", "https://example.invalid/demo-2", date(2026, 11, 10)),
    ("[DEMO] 25th Convocation: payment reminder", "https://example.invalid/demo-3", date(2026, 11, 9)),
]


def main(demo: bool | None = None):
    demo = ("--demo" in sys.argv) if demo is None else demo
    init_db()
    db = SessionLocal()
    if not db.scalar(select(Semester)):
        db.add(Semester(name=SEMESTER[0], start_date=SEMESTER[1], end_date=SEMESTER[2], is_active=True))
    for d, n in HOLIDAYS:
        if not db.scalar(select(Holiday).where(Holiday.date == d)):
            db.add(Holiday(date=d, name=n))
    db.commit()

    path = Path(__file__).resolve().parents[1] / "seed_tsf_batch_01.json"
    if path.exists():
        res = tsf_import.apply(db, "json", path.read_text(), None, "seed")
        print("TSF:", [f"{a['name']} ({a['slots']} slots)" for a in res.get("applied", [])] or res.get("errors"))

    if demo:
        from .services.notices import ingest_notice
        for t, u, d in DEMO_NOTICES:
            ingest_notice(db, t, u, d, source="demo")

    if not db.scalar(select(Admin)):
        pw = os.getenv("ADMIN_INITIAL_PASSWORD") or secrets.token_urlsafe(12)
        db.add(Admin(username="asif", name="Asif Ahmed", password_hash=hash_password(pw), role="super_admin"))
        db.commit()
        print(f"\nFirst admin created: username=asif  password={pw}\n(Shown once. Change it, and set ADMIN_INITIAL_PASSWORD next time.)")
    db.close()


if __name__ == "__main__":
    main()
