"""Duplicate detection helpers. Two layers: the canonical link, and a hash of title + date as the fallback."""
from __future__ import annotations

import hashlib
import re
from datetime import date
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from .. import config

_TRACKING = re.compile(r"^(utm_|fbclid|gclid|mc_|ref$)", re.I)


def canonical_url(url: str) -> str:
    """The link we store and show: lowercase host (www kept as given), https, no fragment, no tracking, no trailing slash."""
    u = urlparse(url.strip())
    host = (u.hostname or "").lower()
    query = urlencode([(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if not _TRACKING.match(k)])
    path = u.path.rstrip("/") or "/"
    return urlunparse(("https", host, path, "", query, ""))


def url_variants(url: str) -> list[str]:
    """The stored form plus its with/without-www twin, so 'aiub.edu/x' and 'www.aiub.edu/x' count as one page."""
    c = canonical_url(url)
    u = urlparse(c)
    host = u.netloc
    twin = host[4:] if host.startswith("www.") else "www." + host
    return [c, urlunparse(u._replace(netloc=twin))]


def content_hash(title: str, published: date | None) -> str:
    norm = re.sub(r"[^a-z0-9ঀ-৿]+", " ", title.lower()).strip()
    return hashlib.sha256(f"{norm}|{published.isoformat() if published else ''}".encode()).hexdigest()


def link_allowed(url: str) -> bool:
    """Only official links are accepted (NOTICE_LINK_DOMAINS, default aiub.edu and its subdomains)."""
    u = urlparse(url)
    host = (u.hostname or "").lower()
    if u.scheme not in ("http", "https") or not host:
        return False
    return any(host == d or host.endswith("." + d) for d in config.NOTICE_LINK_DOMAINS)
