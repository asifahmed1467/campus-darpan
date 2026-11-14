"""Turn a forwarded notice email into a notice candidate. Pure functions; no mailbox is ever accessed."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from email.utils import parseaddr, parsedate_to_datetime
from html import unescape

from .. import config
from .dedupe import canonical_url, link_allowed

_PREFIX = re.compile(r"^\s*((re|fwd?|fw)\s*:\s*|\[[^\]]{1,30}\]\s*)+", re.I)
_URL = re.compile(r"https?://[^\s<>\"')\]]+", re.I)
_TAGS = re.compile(r"<[^>]+>")
MAX_BODY = 200_000


@dataclass
class Parsed:
    status: str                    # accepted / quarantined
    reason: str | None
    sender: str
    subject: str
    title: str | None = None
    url: str | None = None
    attachment_url: str | None = None
    published: date | None = None
    excerpt: str | None = None


def sender_allowed(address: str) -> bool:
    a = address.lower()
    host = a.rsplit("@", 1)[-1]
    for rule in config.INBOUND_SENDER_ALLOWLIST:
        if "@" in rule and a == rule:
            return True
        if "@" not in rule and (host == rule or host.endswith("." + rule)):
            return True
    return False


def _plain(payload: dict) -> str:
    body = payload.get("text") or ""
    if not body and payload.get("html"):
        body = unescape(_TAGS.sub(" ", re.sub(r"(?is)<(script|style).*?</\1>", " ", payload["html"])))
    return body[:MAX_BODY]


def clean_subject(subject: str) -> str:
    s = subject
    while True:
        t = _PREFIX.sub("", s)
        if t == s:
            break
        s = t
    return re.sub(r"\s+", " ", s).strip()


def parse_email(payload: dict, auto_publish: bool | None = None) -> Parsed:
    """payload keys: from, subject, text and/or html, date (optional), links (optional list of hrefs from the HTML)."""
    sender = parseaddr(payload.get("from") or "")[1].lower()
    subject = clean_subject(payload.get("subject") or "")
    body = _plain(payload)
    out = Parsed("quarantined", None, sender or "(unknown)", (payload.get("subject") or "")[:500], title=subject or None,
                 excerpt=re.sub(r"\s+", " ", body)[:600])
    if len(subject) < 3:
        out.reason = "No usable subject"
        return out
    candidates = _URL.findall(body) + [h for h in (payload.get("links") or []) if isinstance(h, str)]
    official = [u.rstrip(".,;") for u in candidates if link_allowed(u.rstrip(".,;"))]
    pdfs = [u for u in official if u.lower().split("?")[0].endswith(".pdf")]
    pages = [u for u in official if u not in pdfs]
    if pages:
        out.url = canonical_url(pages[0])
    out.attachment_url = pdfs[0] if pdfs else None
    out.published = _date(payload.get("date"))
    publish = config.INBOUND_AUTO_PUBLISH if auto_publish is None else auto_publish
    if not sender or not sender_allowed(sender):
        out.reason = "Sender is not on the allowlist"
    elif not out.url:
        out.reason = f"No link to an official page ({', '.join(config.NOTICE_LINK_DOMAINS)}) found in the email"
    elif not publish:
        out.reason = "Waiting for admin approval (auto-publish is off)"
    else:
        out.status = "accepted"
    return out


def _date(v) -> date | None:
    if not v:
        return None
    try:
        return parsedate_to_datetime(str(v)).date()
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).date()
    except ValueError:
        return None
