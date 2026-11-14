"""Web Push (VAPID). Anonymous browser subscriptions; no Firebase account needed."""
from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..models import Notice, NotificationLog, PushSubscription

log = logging.getLogger("push")
MAX_FAILURES = 5


def enabled() -> bool:
    return bool(config.VAPID_PUBLIC_KEY and config.VAPID_PRIVATE_KEY)


class Gone(Exception):
    """The browser says this subscription no longer exists (HTTP 404/410)."""


def _send(sub: dict, payload: dict) -> None:
    """Send one push. Replaced by a fake in tests so nothing touches the network."""
    from pywebpush import WebPushException, webpush
    try:
        webpush(subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=json.dumps(payload), vapid_private_key=config.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": config.VAPID_SUBJECT}, ttl=60 * 60 * 12, timeout=10)
    except WebPushException as e:
        code = getattr(e.response, "status_code", None)
        if code in (404, 410):
            raise Gone() from e
        raise


def notice_payload(n: Notice) -> dict:
    return {"title": "New AIUB notice", "body": n.title, "url": f"{config.SITE_URL}/notices#n{n.id}", "tag": f"notice-{n.id}"}


def _matches(sub: PushSubscription, n: Notice) -> bool:
    return not sub.tags or bool(set(sub.tags) & set(n.tags or []))


def notify_new(db: Session, notices: list[Notice]) -> list[dict]:
    """Push each notice once. NotificationLog's unique notice_id is the guard against duplicates."""
    results = []
    for n in notices:
        if db.scalar(select(NotificationLog.id).where(NotificationLog.notice_id == n.id)):
            continue
        if not enabled():
            db.add(NotificationLog(notice_id=n.id, note="Web Push is not configured (no VAPID keys)"))
            db.commit()
            results.append({"notice_id": n.id, "recipients": 0, "delivered": 0, "failed": 0, "removed": 0})
            continue
        subs = [s for s in db.scalars(select(PushSubscription).where(PushSubscription.active.is_(True))).all() if _matches(s, n)]
        payload = notice_payload(n)

        def one(s: PushSubscription):
            try:
                _send({"endpoint": s.endpoint, "p256dh": s.p256dh, "auth": s.auth}, payload)
                return s.id, "ok"
            except Gone:
                return s.id, "gone"
            except Exception as e:  # network trouble, push service down...
                log.warning("push failed for sub %s: %s", s.id, e.__class__.__name__)
                return s.id, "fail"

        with ThreadPoolExecutor(max_workers=8) as pool:
            outcome = dict(pool.map(one, subs))
        by_id = {s.id: s for s in subs}
        delivered = failed = removed = 0
        now = datetime.now(timezone.utc)
        for sid, st in outcome.items():
            s = by_id[sid]
            if st == "ok":
                delivered += 1
                s.last_success_at, s.failures = now, 0
            elif st == "gone":
                removed += 1
                s.active = False
            else:
                failed += 1
                s.failures += 1
                if s.failures >= MAX_FAILURES:
                    s.active = False
        db.add(NotificationLog(notice_id=n.id, recipients=len(subs), delivered=delivered, failed=failed, removed=removed))
        db.commit()
        results.append({"notice_id": n.id, "recipients": len(subs), "delivered": delivered, "failed": failed, "removed": removed})
    return results


def send_test(endpoint: str, db: Session) -> str:
    """Admin check: push a test message to one browser only (the admin's own)."""
    if not enabled():
        return "Web Push is not configured (VAPID keys missing)."
    s = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if not s:
        return "This browser is not subscribed yet."
    try:
        _send({"endpoint": s.endpoint, "p256dh": s.p256dh, "auth": s.auth},
              {"title": "Test notification", "body": "Push is working on this device.", "url": config.SITE_URL, "tag": "test"})
        return "ok"
    except Gone:
        s.active = False
        db.commit()
        return "The browser has dropped this subscription. Turn notifications off and on again."
    except Exception as e:
        return f"Push service error: {e.__class__.__name__}"
