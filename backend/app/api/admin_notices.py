"""Admin tools for the notice pipeline: test a source, see runs, review forwarded emails, history, subscriptions."""
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config
from ..auth import require_admin
from ..db import get_db
from ..models import Admin, IngestRun, InboundEmail, Notice, NotificationLog, PushSubscription
from ..notice_sources.base import SourceError
from ..notice_sources.registry import load_sources
from ..services import push
from ..services.emailparse import parse_email
from ..services.ingest import dry_run, run_cycle, run_dict
from .inbound import publish_inbound

router = APIRouter(prefix="/api/admin")
public = APIRouter(prefix="/api/internal")


def _email_dict(r: InboundEmail) -> dict:
    return {"id": r.id, "received_at": r.received_at.isoformat(), "sender": r.sender, "subject": r.subject,
            "status": r.status, "reason": r.reason, "title": r.title, "url": r.url, "attachment_url": r.attachment_url,
            "date": r.published_date.isoformat() if r.published_date else None, "excerpt": r.excerpt, "notice_id": r.notice_id}


@router.get("/pipeline")
def pipeline(a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    """One screen of facts: what is configured and whether it is working."""
    last = db.scalars(select(IngestRun).order_by(IngestRun.id.desc()).limit(1)).first()
    return {
        "sources": [s.describe() for s in load_sources()],
        "link_domains": config.NOTICE_LINK_DOMAINS,
        "scheduler_in_api": config.ENABLE_SCHEDULER, "interval_sec": config.SCHEDULER_INTERVAL_SEC,
        "cron_endpoint_enabled": bool(config.CRON_SECRET),
        "push_enabled": push.enabled(),
        "email": {"webhook_enabled": bool(config.INBOUND_EMAIL_SECRET), "auto_publish": config.INBOUND_AUTO_PUBLISH,
                  "allowlist": config.INBOUND_SENDER_ALLOWLIST},
        "subscribers": db.scalar(select(func.count()).select_from(PushSubscription).where(PushSubscription.active.is_(True))) or 0,
        "last_run": run_dict(last) if last else None,
    }


@router.post("/sources/{name}/test")
def test_source(name: str, a: Admin = Depends(require_admin)):
    """Read one source and show what would be saved. Saves nothing and notifies nobody."""
    src = next((s for s in load_sources() if s.name == name), None)
    if not src:
        raise HTTPException(404, "No such source")
    try:
        return {"ok": True, **dry_run(src)}
    except SourceError as e:
        return {"ok": False, "error": str(e)}


@router.post("/run-now")
def run_now(a: Admin = Depends(require_admin)):
    return run_cycle()


@router.get("/runs")
def runs(limit: int = 50, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(IngestRun).order_by(IngestRun.id.desc()).limit(min(limit, 200))).all()
    return {"items": [run_dict(r) for r in rows]}


class PreviewIn(BaseModel):
    sender: str = Field(alias="from", max_length=300)
    subject: str = Field(max_length=500)
    text: str = Field(default="", max_length=200_000)
    date: str | None = None

    model_config = {"populate_by_name": True}


@router.post("/inbound/preview")
def preview_email(b: PreviewIn, a: Admin = Depends(require_admin)):
    """Paste a sample email and see how it would be handled. Nothing is saved."""
    p = parse_email({"from": b.sender, "subject": b.subject, "text": b.text, "date": b.date})
    return {"status": p.status, "reason": p.reason, "title": p.title, "url": p.url, "attachment_url": p.attachment_url,
            "date": p.published.isoformat() if p.published else None}


@router.get("/inbox")
def inbox(status: str | None = None, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    q = select(InboundEmail).order_by(InboundEmail.id.desc()).limit(100)
    if status:
        q = q.where(InboundEmail.status == status)
    return {"items": [_email_dict(r) for r in db.scalars(q).all()]}


@router.post("/inbox/{eid}/approve")
def approve(eid: int, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    """Verify a quarantined email. It must still carry an official link; the admin cannot type a notice in."""
    r = db.get(InboundEmail, eid)
    if not r:
        raise HTTPException(404, "No such email")
    if r.status == "published":
        return {"ok": True, "notice_id": r.notice_id}
    if not r.url or not r.title:
        raise HTTPException(422, "This email has no official link, so it cannot be published")
    return {"ok": True, "notice_id": publish_inbound(db, r)}


@router.post("/inbox/{eid}/reject")
def reject(eid: int, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.get(InboundEmail, eid)
    if not r:
        raise HTTPException(404, "No such email")
    if r.status != "published":
        r.status, r.reason = "rejected", "Rejected by an admin"
        db.commit()
    return {"ok": True}


@router.get("/notifications")
def notification_history(a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(select(NotificationLog, Notice.title).join(Notice, Notice.id == NotificationLog.notice_id)
                      .order_by(NotificationLog.id.desc()).limit(100)).all()
    return {"items": [{"notice_id": n.notice_id, "title": t, "sent_at": n.sent_at.isoformat(), "recipients": n.recipients,
                       "delivered": n.delivered, "failed": n.failed, "removed": n.removed, "note": n.note} for n, t in rows]}


@router.get("/subscriptions")
def subscription_stats(a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    total = db.scalar(select(func.count()).select_from(PushSubscription)) or 0
    active = db.scalar(select(func.count()).select_from(PushSubscription).where(PushSubscription.active.is_(True))) or 0
    topics: dict[str, int] = {}
    everything = 0
    for tags in db.scalars(select(PushSubscription.tags).where(PushSubscription.active.is_(True))).all():
        if not tags:
            everything += 1
        for t in tags or []:
            topics[t] = topics.get(t, 0) + 1
    return {"total": total, "active": active, "all_notices": everything, "by_topic": topics}


class EndpointIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=800)


@router.post("/push/test")
def push_test(b: EndpointIn, a: Admin = Depends(require_admin), db: Session = Depends(get_db)):
    """Send a test push to the admin's own browser only."""
    msg = push.send_test(b.endpoint, db)
    return {"ok": msg == "ok", "message": "Sent. Check this device." if msg == "ok" else msg}


@public.post("/run-cycle")
def cron_trigger(x_cron_secret: str = Header(default="")):
    """For a free pinger (cron-job.org, GitHub Actions) to call every 5 minutes."""
    import hmac
    if not config.CRON_SECRET or not hmac.compare_digest(x_cron_secret, config.CRON_SECRET):
        raise HTTPException(401, "Bad or missing secret")
    return run_cycle()
