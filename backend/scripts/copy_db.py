"""Copy every table from one database to another (for example Render PostgreSQL to Supabase).

Usage (set the two addresses in YOUR terminal so passwords never pass through chat):
    set SRC_URL=postgresql://...old...        (Windows cmd; use  $env:SRC_URL="..."  in PowerShell)
    set DST_URL=postgresql://...new...
    python scripts/copy_db.py            # dry run: shows row counts only
    python scripts/copy_db.py --go       # copies; replaces whatever is in the destination tables

The source is only read. The destination tables are created if missing, emptied, then filled.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, func, select, text  # noqa: E402

from app import models  # noqa: E402,F401  (registers every table on Base.metadata)
from app.db import Base  # noqa: E402


def engine_for(url: str):
    for old in ("postgres://", "postgresql://"):
        if url.startswith(old):
            url = "postgresql+psycopg://" + url[len(old):]
    return create_engine(url, pool_pre_ping=True)


def main() -> int:
    src_url, dst_url = os.getenv("SRC_URL"), os.getenv("DST_URL")
    if not src_url or not dst_url:
        print("Set SRC_URL and DST_URL first (see the top of this file)."); return 2
    if src_url == dst_url:
        print("SRC_URL and DST_URL are the same database. Stopping."); return 2
    go = "--go" in sys.argv
    src, dst = engine_for(src_url), engine_for(dst_url)
    tables = list(Base.metadata.sorted_tables)           # parents before children
    with src.connect() as s:
        counts = {t.name: s.execute(select(func.count()).select_from(t)).scalar() for t in tables}
    for name, n in counts.items():
        print(f"  {name:20} {n:>7} rows")
    if not go:
        print("\nDry run only. Add --go to copy."); return 0
    Base.metadata.create_all(dst)
    with dst.begin() as d:
        for t in reversed(tables):
            d.execute(t.delete())
    with src.connect() as s, dst.begin() as d:
        for t in tables:
            rows = [dict(r._mapping) for r in s.execute(select(t))]
            for i in range(0, len(rows), 500):
                d.execute(t.insert(), rows[i:i + 500])
            pk = [c for c in t.primary_key.columns if c.type.python_type is int]
            if rows and len(pk) == 1 and dst.dialect.name == "postgresql":
                col = pk[0].name
                d.execute(text(f"SELECT setval(pg_get_serial_sequence('{t.name}', '{col}'), COALESCE((SELECT MAX({col}) FROM {t.name}), 1))"))
    with dst.connect() as d:
        bad = [(t.name, counts[t.name], d.execute(select(func.count()).select_from(t)).scalar()) for t in tables]
    bad = [b for b in bad if b[1] != b[2]]
    if bad:
        print("MISMATCH:", bad); return 1
    print("\nDone. Every table has the same number of rows as the source.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
