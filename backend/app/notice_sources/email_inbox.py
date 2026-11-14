"""Notices that arrived as forwarded emails (see services/emailparse.py and api/inbound.py).

The source reads the app's own InboundEmail table, so it can re-offer an accepted email whose notice was not saved
(for example the database hiccuped mid-way). It never connects to any mailbox."""
from __future__ import annotations

from ..db import SessionLocal
from ..models import InboundEmail
from .base import NoticeSource, RawNotice


class EmailInboxSource(NoticeSource):
    kind = "email"

    def __init__(self, name: str = "email-inbox"):
        self.name = name

    def fetch(self) -> list[RawNotice]:
        db = SessionLocal()
        try:
            rows = db.query(InboundEmail).filter(InboundEmail.status == "accepted", InboundEmail.notice_id.is_(None)).limit(100).all()
            return [RawNotice(title=r.title, url=r.url, published=r.published_date, attachment_url=r.attachment_url)
                    for r in rows if r.title and r.url]
        finally:
            db.close()
