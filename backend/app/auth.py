import hashlib
import hmac
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import SECRET, TOKEN_HOURS, TRUST_PROXY_HEADERS
from .db import get_db
from .models import Admin

_ITER = 200_000
bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, _ITER)
    return f"pbkdf2${_ITER}${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, it, salt, dk = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(calc.hex(), dk)
    except Exception:
        return False


def make_token(admin: Admin) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode({"sub": str(admin.id), "u": admin.username, "role": admin.role, "exp": exp}, SECRET, "HS256")


def require_admin(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> Admin:
    if not cred:
        raise HTTPException(401, "Login required")
    try:
        data = jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired, please log in again")
    admin = db.get(Admin, int(data["sub"]))
    if not admin or not admin.is_active:
        raise HTTPException(401, "Account disabled")
    return admin


def require_super(admin: Admin = Depends(require_admin)) -> Admin:
    if admin.role != "super_admin":
        raise HTTPException(403, "Only a super admin can do this")
    return admin


def get_admin_by_username(db: Session, username: str) -> Admin | None:
    return db.scalar(select(Admin).where(Admin.username == username.strip().lower()))


# ---- tiny in-process sliding-window rate limiter (swap for Redis when running >1 server) ----
_hits: dict[str, deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    if TRUST_PROXY_HEADERS:
        fwd = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "")
        if fwd.strip():
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def rate_limit(key: str, limit: int, per_seconds: int):
    now, q = time.time(), _hits[key]
    while q and q[0] < now - per_seconds:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many requests, please wait a moment", headers={"Retry-After": str(per_seconds)})
    q.append(now)
