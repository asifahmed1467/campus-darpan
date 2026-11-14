"""Shared polite HTTP access for feed-style sources."""
from __future__ import annotations

from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from .base import SourceError

USER_AGENT = "CampusDarpan/1.0 (student project; notice feed reader)"
MAX_BYTES = 2_000_000


def robots_allows(url: str) -> bool:
    p = urlparse(url)
    rp = RobotFileParser()
    try:
        r = httpx.get(f"{p.scheme}://{p.netloc}/robots.txt", headers={"User-Agent": USER_AGENT}, timeout=10, follow_redirects=True)
    except Exception:
        return False  # cannot confirm permission -> do not fetch
    if r.status_code in (404, 410):
        return True  # no robots file: nothing is restricted
    if r.status_code != 200:
        return False
    rp.parse(r.text.splitlines())
    return rp.can_fetch(USER_AGENT, url)


def polite_get(url: str, *, respect_robots: bool, headers: dict | None = None, timeout: float = 15) -> httpx.Response:
    if not url.lower().startswith("https://"):
        raise SourceError("Source URL must use https://")
    if respect_robots and not robots_allows(url):
        raise SourceError("robots.txt does not allow this URL (or could not be checked). Get written permission, then set 'authorized_by'.")
    try:
        r = httpx.get(url, headers={"User-Agent": USER_AGENT, **(headers or {})}, timeout=timeout, follow_redirects=True)
    except httpx.HTTPError as e:
        raise SourceError(f"Network error: {e.__class__.__name__}") from e
    if r.status_code != 200:
        raise SourceError(f"Source answered HTTP {r.status_code}")
    if len(r.content) > MAX_BYTES:
        raise SourceError("Source response is too large")
    return r
