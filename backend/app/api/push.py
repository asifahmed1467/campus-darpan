from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import PushSubscription
from ..services import push
from ..services.notices import _TAGS

router = APIRouter(prefix="/api/push")


class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class SubIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=800)
    keys: Keys
    tags: list[str] = Field(default_factory=list, max_length=12)


class EndpointIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=800)


@router.get("/key")
def public_key():
    return {"enabled": push.enabled(), "key": config.VAPID_PUBLIC_KEY or None, "topics": list(_TAGS) + ["General"]}


@router.post("/subscribe")
def subscribe(b: SubIn, db: Session = Depends(get_db)):
    if not push.enabled():
        raise HTTPException(503, "Notifications are not switched on for this site yet")
    if not b.endpoint.startswith("https://"):
        raise HTTPException(422, "Invalid subscription")
    tags = [t for t in b.tags if t in _TAGS or t == "General"]
    s = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == b.endpoint))
    if s:
        s.p256dh, s.auth, s.tags, s.active, s.failures = b.keys.p256dh, b.keys.auth, tags, True, 0
    else:
        db.add(PushSubscription(endpoint=b.endpoint, p256dh=b.keys.p256dh, auth=b.keys.auth, tags=tags))
    db.commit()
    return {"ok": True, "tags": tags}


@router.post("/status")
def status(b: EndpointIn, db: Session = Depends(get_db)):
    s = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == b.endpoint))
    return {"subscribed": bool(s and s.active), "tags": s.tags if s else []}


@router.post("/unsubscribe")
def unsubscribe(b: EndpointIn, db: Session = Depends(get_db)):
    s = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == b.endpoint))
    if s:
        db.delete(s)
        db.commit()
    return {"ok": True}
