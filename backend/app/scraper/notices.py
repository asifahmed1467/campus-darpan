"""AIUB notice scraper.

STATUS: written but NOT verified against the real page. When this was built, aiub.edu's robots rules refused
automated access to /category/notices, so no real HTML sample could be fetched. Before turning it on:
  1) get permission from AIUB IT (or an official feed), 2) test it on a saved copy of the page:
       python -m app.scraper.notices --html saved_notices_page.html
  3) adjust SELECTORS below until the printed titles/dates/links look right.
It refuses to fetch any URL that robots.txt disallows.
"""
import argparse
import re
import time
from datetime import date, datetime
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

NOTICES_URL = "https://www.aiub.edu/category/notices"
USER_AGENT = "CampusDarpan/0.1 (student project; contact: admin)"
MIN_SECONDS_BETWEEN_REQUESTS = 1.0

# Adjust after looking at the real page. Each entry is a CSS selector for one notice block.
SELECTORS = {"item": "article, .notice-item, .post, li", "link": "a[href]", "date": "time, .date, .notice-date"}
_DATE_RX = [(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", "%d %B %Y"), (r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", "%B %d %Y")]


def allowed_by_robots(url: str) -> bool:
    p = urlparse(url)
    rp = RobotFileParser()
    rp.set_url(f"{p.scheme}://{p.netloc}/robots.txt")
    try:
        rp.read()
    except Exception:
        return False  # can't confirm permission -> don't fetch
    return rp.can_fetch(USER_AGENT, url)


def parse_date(text: str) -> date | None:
    for rx, fmt in _DATE_RX:
        m = re.search(rx, text)
        if m:
            raw = " ".join(m.groups())
            for f in (fmt, fmt.replace("%B", "%b")):
                try:
                    return datetime.strptime(raw, f).date()
                except ValueError:
                    pass
    return None


def parse_list(html: str, base: str = NOTICES_URL) -> list[dict]:
    soup, out, seen = BeautifulSoup(html, "html.parser"), [], set()
    for block in soup.select(SELECTORS["item"]):
        a = block.select_one(SELECTORS["link"])
        if not a or not a.get_text(strip=True):
            continue
        url = urljoin(base, a["href"])
        title = " ".join(a.get_text(" ", strip=True).split())
        if url in seen or len(title) < 8 or urlparse(url).netloc.split(":")[0] not in ("www.aiub.edu", "aiub.edu"):
            continue
        d = block.select_one(SELECTORS["date"])
        out.append({"title": title, "url": url, "date": parse_date(d.get_text(" ", strip=True) if d else block.get_text(" ", strip=True))})
        seen.add(url)
    return out


def fetch_html(url: str = NOTICES_URL) -> str | None:
    if not allowed_by_robots(url):
        print(f"[scraper] robots.txt does not allow (or could not confirm) {url}; skipping.")
        return None
    time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
    r = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=20, follow_redirects=True)
    r.raise_for_status()
    return r.text


def run_once(html: str | None = None) -> int:
    """Fetch (or use given HTML), insert unseen notices, return how many were new."""
    from ..db import SessionLocal, init_db
    from ..services.notices import ingest_notice
    init_db()
    html = html or fetch_html()
    if not html:
        return 0
    db, new = SessionLocal(), 0
    for n in reversed(parse_list(html)):  # oldest first so ids follow publish order
        _, created = ingest_notice(db, n["title"], n["url"], n["date"])
        new += created
    db.close()
    return new


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", help="parse a saved copy of the notices page instead of fetching")
    ap.add_argument("--dry", action="store_true", help="only print what was parsed")
    ap.add_argument("--loop", type=int, metavar="MINUTES", help="repeat forever every N minutes")
    a = ap.parse_args()
    while True:
        html = open(a.html, encoding="utf-8").read() if a.html else None
        if a.dry:
            for n in parse_list(html or fetch_html() or ""):
                print(n)
        else:
            print(f"[scraper] {run_once(html)} new notice(s)")
        if not a.loop:
            break
        time.sleep(a.loop * 60)
