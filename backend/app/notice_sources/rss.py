"""Official RSS 2.0 / Atom feed. Use only a feed AIUB publishes or has authorised you to read."""
from __future__ import annotations

from datetime import date, datetime
from email.utils import parsedate_to_datetime

from defusedxml import ElementTree as ET

from .base import NoticeSource, RawNotice, SourceError
from .http import polite_get


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _text(el, *names: str) -> str | None:
    for child in el:
        if _local(child.tag) in names and (child.text or "").strip():
            return child.text.strip()
    return None


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return parsedate_to_datetime(s).date()
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_feed(xml_text: str) -> list[RawNotice]:
    try:
        root = ET.fromstring(xml_text.encode("utf-8") if isinstance(xml_text, str) else xml_text)
    except Exception as e:  # defusedxml raises its own errors for entity bombs too
        raise SourceError(f"Feed is not valid XML: {e.__class__.__name__}") from e
    out: list[RawNotice] = []
    for el in root.iter():
        kind = _local(el.tag)
        if kind not in ("item", "entry"):
            continue
        title = _text(el, "title")
        link = _text(el, "link") if kind == "item" else None
        attachment = None
        for child in el:
            if _local(child.tag) == "link" and kind == "entry":
                href = child.get("href")
                if href and child.get("rel", "alternate") == "alternate":
                    link = href
                elif href and child.get("rel") == "enclosure":
                    attachment = href
            if _local(child.tag) == "enclosure" and child.get("url"):
                attachment = child.get("url")
        if not title or not link:
            continue
        out.append(RawNotice(
            title=title, url=link.strip(),
            published=_parse_date(_text(el, "pubDate", "published", "updated", "date")),
            summary=_text(el, "description", "summary"), category=_text(el, "category"),
            attachment_url=attachment))
    return out


class RssSource(NoticeSource):
    kind = "rss"

    def __init__(self, name: str, url: str, authorized_by: str | None = None):
        self.name, self.url, self.authorized_by = name, url, authorized_by

    def fetch(self) -> list[RawNotice]:
        r = polite_get(self.url, respect_robots=not self.authorized_by)
        return parse_feed(r.text)

    def describe(self) -> dict:
        return {**super().describe(), "url": self.url, "robots_check": not self.authorized_by,
                "authorized_by": self.authorized_by}
