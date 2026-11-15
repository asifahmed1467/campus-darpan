"""Notice list read from an ordinary HTML page (adapted from the user's own web_scraper project).

Reads ONE listing page per cycle (default: the first page of https://www.aiub.edu/category/notices).
robots.txt is always checked and cannot be switched off here: if it forbids the page, or cannot be read, nothing is fetched.
Each row looks like "09 Nov 2026 <title>" and links to the notice. Long titles are shortened with "..." on the list,
so the full title is read once from the notice's own page (cached, so each notice costs one extra request, ever)."""
from __future__ import annotations

import re
from datetime import date, datetime
from urllib.parse import urldefrag, urljoin, urlparse

from bs4 import BeautifulSoup

from .base import NoticeSource, RawNotice, SourceError
from .http import polite_get

ROW = re.compile(r"^\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+(.+)$", re.S)
_title_cache: dict[str, str] = {}
MAX_DETAIL_FETCHES = 10  # per cycle, so the first run after a long gap never floods the site


def _clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _date(s: str) -> date | None:
    for fmt in ("%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(_clean(s), fmt).date()
        except ValueError:
            pass
    return None


def parse_list(html: str, base_url: str, same_host_only: bool = True) -> list[RawNotice]:
    soup = BeautifulSoup(html, "lxml") if _has_lxml() else BeautifulSoup(html, "html.parser")
    host = urlparse(base_url).netloc
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        m = ROW.match(_clean(a.get_text(" ")))
        if not m:
            continue
        url = urldefrag(urljoin(base_url, a["href"].strip()))[0]
        if url in seen or (same_host_only and urlparse(url).netloc != host) or "pageNo=" in url:
            continue
        seen.add(url)
        title = _clean(a.get("title")) or _clean(m.group(2))
        out.append(RawNotice(title=title, url=url, published=_date(m.group(1))))
    return out


def _has_lxml() -> bool:
    try:
        import lxml  # noqa: F401
        return True
    except ImportError:
        return False


def _full_title(url: str) -> str | None:
    if url in _title_cache:
        return _title_cache[url]
    try:
        soup = BeautifulSoup(polite_get(url, respect_robots=True).text, "html.parser")
    except SourceError:
        return None
    og = soup.find("meta", attrs={"property": "og:title"})
    t = _clean(og.get("content")) if og and og.get("content") else _clean(soup.h1.get_text() if soup.h1 else "")
    t = re.sub(r"\s*\|\s*AIUB\s*$", "", t)
    if t:
        _title_cache[url] = t
    return t or None


class HtmlListSource(NoticeSource):
    kind = "html_list"

    def __init__(self, name: str, url: str):
        self.name, self.url = name, url

    def fetch(self) -> list[RawNotice]:
        items = parse_list(polite_get(self.url, respect_robots=True).text, self.url)
        if not items:
            raise SourceError("No notices found on the page; its layout may have changed")
        out, fetched = [], 0
        for it in items:
            title = it.title
            if "..." in title or "…" in title:
                if it.url not in _title_cache and fetched >= MAX_DETAIL_FETCHES:
                    pass  # keep the shortened title this cycle; it is completed on a later one
                else:
                    fetched += it.url not in _title_cache
                    title = _full_title(it.url) or title
            out.append(RawNotice(title=title, url=it.url, published=it.published))
        return out

    def describe(self) -> dict:
        return {**super().describe(), "url": self.url, "robots_check": True}
