import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
            "attachment_url": n.attachment_url,
            "first_seen_at": n.first_seen_at.isoformat()}


def ingest_notice(db: Session, title: str, url: str, published: date | None = None, body: str | None = None,
                  tags: list[str] | None = None, source: str = "feed", attachment_url: str | None = None,
                  summary: str | None = None) -> tuple[Notice, bool]:
    """Insert a notice unless it is already known. Returns (notice, created).

    Duplicate rules: same canonical link, or same title+date (the content hash). Two workers racing on the same
    link are safe: the unique index decides and the loser simply gets the existing row."""
    from .dedupe import canonical_url, content_hash, url_variants
    url = canonical_url(url)
    h = content_hash(title, published)
    existing = db.scalar(select(Notice).where(Notice.url.in_(url_variants(url))))
    if existing is None and published is not None:
        existing = db.scalar(select(Notice).where(Notice.content_hash == h))
    if existing:
        return existing, False
    n = Notice(title=title.strip()[:500], url=url, published_date=published, body=body, summary=summary,
               tags=tags or auto_tags(title, body or summary), source=source, content_hash=h,
               attachment_url=attachment_url)
    db.add(n)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.scalar(select(Notice).where(Notice.url == url)), False
    from ..api.public import clear_notice_cache
    clear_notice_cache()
    broadcaster.publish({"type": "notice", "notice": notice_dict(n)})
    return n, True
