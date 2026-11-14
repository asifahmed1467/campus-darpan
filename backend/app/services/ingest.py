"""One monitoring cycle: fetch -> check links -> dedupe -> save -> log -> notify (only after the save succeeded)."""
from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import config
from ..db import SessionLocal, engine
from ..models import IngestRun, Notice
from ..notice_sources.base import NoticeSource, RawNotice, SourceError
from ..notice_sources.registry import load_sources
from . import push
from .dedupe import link_allowed
from .notices import ingest_notice

log = logging.getLogger("ingest")
LOCK_KEY = 727_001
_local_lock = threading.Lock()


@contextmanager
def cycle_lock():
    """Only one cycle at a time across all processes. PostgreSQL advisory lock; a thread lock on SQLite (dev)."""
    if engine.dialect.name == "postgresql":
        conn = engine.connect()
        try:
            got = bool(conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK_KEY}).scalar())
            yield got
        finally:
            if got:
                conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_KEY})
            conn.close()
    else:
        got = _local_lock.acquire(blocking=False)
        try:
            yield got
        finally:
            if got:
                _local_lock.release()


def save_items(db: Session, source_name: str, items: list[RawNotice]) -> tuple[list[Notice], int]:
    """Save the new ones. Returns (new notices, number skipped for an unofficial link)."""
    new, skipped = [], 0
    for it in items:
        if not it.title.strip() or not link_allowed(it.url):
            skipped += 1
            continue
        n, created = ingest_notice(db, it.title, it.url, it.published, it.body, None, source_name,
                                   it.attachment_url if it.attachment_url and link_allowed(it.attachment_url) else None,
                                   it.summary)
        if created:
            new.append(n)
    return new, skipped


def run_source(db: Session, src: NoticeSource, notify: bool = True) -> dict:
    run = IngestRun(source=src.name)
    db.add(run)
    db.commit()
    try:
        items = src.fetch()
        new, skipped = save_items(db, src.name, items)
        run.found, run.new, run.status = len(items), len(new), "ok"
        if skipped:
            run.error = f"{skipped} item(s) skipped: missing title or link outside {', '.join(config.NOTICE_LINK_DOMAINS)}"
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        if new and notify:
            try:
                push.notify_new(db, new)
            except Exception:
                log.exception("push step failed for source %s (notices are saved)", src.name)
        log.info("source=%s found=%d new=%d skipped=%d", src.name, len(items), len(new), skipped)
    except SourceError as e:
        db.rollback()
        run.status, run.error, run.finished_at = "error", str(e)[:500], datetime.now(timezone.utc)
        db.add(run)
        db.commit()
        log.warning("source=%s failed: %s", src.name, e)
    except Exception as e:  # a bug or surprise in one source must not stop the others
        db.rollback()
        run.status, run.error, run.finished_at = "error", f"{e.__class__.__name__}: {e}"[:500], datetime.now(timezone.utc)
        db.add(run)
        db.commit()
        log.exception("source=%s crashed", src.name)
    return run_dict(run)


def run_dict(r: IngestRun) -> dict:
    return {"id": r.id, "source": r.source, "status": r.status, "found": r.found, "new": r.new, "error": r.error,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None}


def run_cycle(sources: list[NoticeSource] | None = None, notify: bool = True) -> dict:
    """Run every enabled source once. Safe to call from several places at once: the lock lets only one proceed."""
    sources = load_sources() if sources is None else sources
    with cycle_lock() as got:
        if not got:
            return {"ran": False, "reason": "another cycle is already running", "runs": []}
        if not sources:
            log.info("no notice sources configured; nothing to check")
            return {"ran": True, "reason": "no sources configured", "runs": []}
        db = SessionLocal()
        try:
            return {"ran": True, "reason": None, "runs": [run_source(db, s, notify) for s in sources]}
        finally:
            db.close()


def dry_run(src: NoticeSource) -> dict:
    """Admin test: read a source and show what WOULD be saved, without saving or notifying."""
    from sqlalchemy import select
    from .dedupe import url_variants
    db = SessionLocal()
    try:
        items = src.fetch()
        known = set(db.scalars(select(Notice.url)).all())
        rows = [{"title": i.title, "url": i.url, "date": i.published.isoformat() if i.published else None,
                 "official_link": link_allowed(i.url), "already_saved": any(v in known for v in url_variants(i.url))} for i in items]
        return {"count": len(rows), "new": sum(1 for r in rows if r["official_link"] and not r["already_saved"]),
                "items": rows[:30]}
    finally:
        db.close()
