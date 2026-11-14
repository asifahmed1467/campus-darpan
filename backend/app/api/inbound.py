"""Webhook for forwarded notice emails. Used by an email-to-webhook service or a mail rule set up by AIUB IT."""
import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import InboundEmail
from ..services import push
from ..services.emailparse import parse_email
from ..services.notices import ingest_notice

router = APIRouter(prefix="/api/inbound")
log = logging.getLogger("inbound")
MAX_BYTES = 400_000


def publish_inbound(db: Session, row: InboundEmail) -> int | None:
    """Create the notice for an accepted email and push it. Returns the notice id."""
    n, created = ingest_notice(db, row.title, row.url, row.published_date, None, None, "email", row.attachment_url)
    row.notice_id, row.status = n.id, "published"
    db.commit()
    if created:
        try:
            push.notify_new(db, [n])
        except Exception:
            log.exception("push step failed for notice %s (notice is saved)", n.id)
    return n.id


@router.post("/email")
async def receive_email(request: Request, x_inbound_secret: str = Header(default=""), db: Session = Depends(get_db)):
    if not config.INBOUND_EMAIL_SECRET or not hmac.compare_digest(x_inbound_secret, config.INBOUND_EMAIL_SECRET):
        raise HTTPException(401, "Bad or missing secret")
    raw = await request.body()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Email is too large")
    try:
        payload = await request.json()
        assert isinstance(payload, dict)
    except Exception:
        raise HTTPException(422, "Send a JSON object with from, subject and text or html")
    mid = (payload.get("message_id") or "")[:300] or None
    if mid and db.scalar(select(InboundEmail.id).where(InboundEmail.message_id == mid)):
        return {"status": "duplicate"}
    p = parse_email(payload)
    row = InboundEmail(message_id=mid, sender=p.sender[:300], subject=p.subject, status=p.status, reason=p.reason,
                       title=p.title, url=p.url, attachment_url=p.attachment_url, published_date=p.published,
                       excerpt=p.excerpt)
    db.add(row)
    db.commit()
    if p.status == "accepted":
        publish_inbound(db, row)
    log.info("inbound email %s from=%s status=%s", row.id, row.sender, row.status)
    return {"status": row.status, "reason": row.reason, "notice_id": row.notice_id}
