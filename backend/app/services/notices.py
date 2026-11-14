import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Notice
from .realtime import broadcaster

_TAGS = {
    "Exam": r"\bexam|midterm|mid-term|final term|routine|schedule of|invigilat",
    "Registration": r"registration|add(ing)?[ -]?/?\s?drop|enrol|advising|validation",
    "Holiday": r"holiday|vacation|closed|no classes|puja|eid|victory day|christmas",
    "Scholarship": r"scholarship|waiver|stipend|financial aid|tuition fee",
    "Convocation": r"convocation|graduation|certificate",
    "Admission": r"admission|admit|freshm[ae]n|applicant|viva",
    "Probation": r"probation",
    "Result": r"\bresult|grade sheet|transcript|gpa|cgpa",
    "Event": r"seminar|workshop|competition|contest|fair|summit|lecture|orientation|webinar|hackathon",
}


def auto_tags(title: str, body: str | None = None) -> list[str]:
    text = f"{title} {(body or '')[:400]}".lower()
    return [t for t, rx in _TAGS.items() if re.search(rx, text)] or ["General"]


def notice_dict(n: Notice) -> dict:
    return {"id": n.id, "title": n.title, "url": n.url,
            "date": n.published_date.isoformat() if n.published_date else None,
            "summary": n.summary, "tags": n.tags or [], "source": n.source,
            "first_seen_at": n.first_seen_at.isoformat()}


def ingest_notice(db: Session, title: str, url: str, published: date | None = None, body: str | None = None,
                  tags: list[str] | None = None, source: str = "scraper") -> tuple[Notice, bool]:
    """Insert a notice if its URL is new. Returns (notice, created). Pushes a live event to open browsers."""
    existing = db.scalar(select(Notice).where(Notice.url == url))
    if existing:
        return existing, False
    n = Notice(title=title.strip(), url=url, published_date=published, body=body,
               tags=tags or auto_tags(title, body), source=source)
    db.add(n)
    db.commit()
    from ..api.public import clear_notice_cache
    clear_notice_cache()
    broadcaster.publish({"type": "notice", "notice": notice_dict(n)})
    return n, True
