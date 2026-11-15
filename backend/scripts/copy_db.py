"""Copy every row from one database to another (for example Render PostgreSQL to Supabase).

Standalone: needs only   pip install sqlalchemy pg8000
The destination must already have the tables (start the API once against it, it creates them).

Set the two addresses in YOUR terminal so passwords never pass through chat:
    PowerShell:  $env:SRC_URL="postgresql://...old..."; $env:DST_URL="postgresql://...new..."
    cmd:         set SRC_URL=postgresql://...old...   then   set DST_URL=postgresql://...new...
Then:
    python copy_db.py            # dry run: shows row counts only
    python copy_db.py --go       # copies; REPLACES whatever is in the destination tables

The source is only read.
"""
import os
import ssl
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import MetaData, create_engine, func, select, text


def _driver() -> str:
    """psycopg if it loads, otherwise the pure-Python pg8000 (works where Windows blocks compiled files)."""
    try:
        import psycopg  # noqa: F401
        return "psycopg"
    except Exception:
        return "pg8000"


def engine_for(url: str):
    if url.startswith("sqlite"):
        return create_engine(url)
    for old in ("postgres://", "postgresql://"):
        if url.startswith(old):
            url = "postgresql://" + url[len(old):]
    drv = _driver()
    if drv == "psycopg":
        return create_engine(url.replace("postgresql://", "postgresql+psycopg://", 1), pool_pre_ping=True)
    parts = urlsplit(url.replace("postgresql://", "postgresql+pg8000://", 1))
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != "sslmode"]       # pg8000 takes SSL as an argument instead
    url = urlunsplit(parts._replace(query=urlencode(query)))
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE          # encrypted, like sslmode=require (no certificate check)
    return create_engine(url, pool_pre_ping=True, connect_args={"ssl_context": ctx})


def main() -> int:
    src_url, dst_url = os.getenv("SRC_URL"), os.getenv("DST_URL")
    if not src_url or not dst_url:
        print("Set SRC_URL and DST_URL first (see the top of this file)."); return 2
    if src_url == dst_url:
        print("SRC_URL and DST_URL are the same database. Stopping."); return 2
    go = "--go" in sys.argv
    src, dst = engine_for(src_url), engine_for(dst_url)
    sm, dm = MetaData(), MetaData()
    sm.reflect(bind=src)
    dm.reflect(bind=dst)
    missing = [t.name for t in sm.sorted_tables if t.name not in dm.tables]
    if missing:
        print("The destination is missing these tables:", ", ".join(missing))
        print("Start the API once with DATABASE_URL pointing at the destination (it creates them), then run this again."); return 2
    order = [dm.tables[t.name] for t in sm.sorted_tables]          # parents before children
    with src.connect() as s:
        counts = {t.name: s.execute(select(func.count()).select_from(t)).scalar() for t in sm.sorted_tables}
    for name, n in counts.items():
        print(f"  {name:20} {n:>7} rows")
    if not go:
        print("\nDry run only. Add --go to copy."); return 0
    with src.connect() as s, dst.begin() as d:
        if dst.dialect.name == "postgresql":
            # The live API may be writing (it logs a notice check every 5 minutes). Lock the tables so its writes wait until we are done.
            d.execute(text("SET LOCAL lock_timeout = '60s'"))
            d.execute(text("LOCK TABLE " + ", ".join(f'"{t.name}"' for t in order) + " IN ACCESS EXCLUSIVE MODE"))
        for t in reversed(order):
            d.execute(t.delete())
        for t in order:
            rows = [dict(r._mapping) for r in s.execute(select(sm.tables[t.name]))]
            for i in range(0, len(rows), 40):            # one multi-row INSERT per 40 rows: far fewer round trips than one per row
                d.execute(t.insert().values(rows[i:i + 40]))
            pk = [c for c in t.primary_key.columns if c.type.python_type is int]
            if rows and len(pk) == 1 and dst.dialect.name == "postgresql":
                col = pk[0].name
                d.execute(text(f"SELECT setval(pg_get_serial_sequence('{t.name}', '{col}'), COALESCE((SELECT MAX({col}) FROM {t.name}), 1))"))
    with dst.connect() as d:
        got = {t.name: d.execute(select(func.count()).select_from(t)).scalar() for t in order}
    bad = {k: (counts[k], got[k]) for k in counts if counts[k] != got[k]}
    if bad:
        print("MISMATCH (source, destination):", bad); return 1
    print("\nDone. Every table has the same number of rows as the source.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
