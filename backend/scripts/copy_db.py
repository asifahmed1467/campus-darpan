"""Copy every row from one database to another (for example Render PostgreSQL to Supabase).

Standalone: needs only   pip install sqlalchemy "psycopg[binary]"
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
import sys

from sqlalchemy import MetaData, create_engine, func, select, text


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
        for t in reversed(order):
            d.execute(t.delete())
        for t in order:
            rows = [dict(r._mapping) for r in s.execute(select(sm.tables[t.name]))]
            for i in range(0, len(rows), 500):
                d.execute(t.insert(), rows[i:i + 500])
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
