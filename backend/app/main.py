import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .api import admin, admin_notices, inbound, public, push as push_api
from . import config
from .config import CORS_ORIGINS
from .db import init_db
from .services.realtime import broadcaster, presence


def _new_notices_since(last_id: int) -> list[dict]:
    from sqlalchemy import select
    from .db import SessionLocal
    from .models import Notice
    from .services.notices import notice_dict
    db = SessionLocal()
    try:
        rows = db.scalars(select(Notice).where(Notice.id > last_id).order_by(Notice.id).limit(50)).all()
        return [notice_dict(n) for n in rows]
    finally:
        db.close()


async def notice_watcher(every: float = 5.0):
    """One cheap query every few seconds per web worker, so notices saved by the scraper process reach open screens."""
    from sqlalchemy import func, select
    from .db import SessionLocal
    from .models import Notice

    def current_max() -> int:
        db = SessionLocal()
        try:
            return db.scalar(select(func.max(Notice.id))) or 0
        finally:
            db.close()

    last = await asyncio.to_thread(current_max)
    while True:
        await asyncio.sleep(every)
        try:
            for n in await asyncio.to_thread(_new_notices_since, last):
                last = max(last, n["id"])
                broadcaster.publish({"type": "notice", "notice": n})
        except Exception:
            pass  # a failed check just waits for the next one


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    broadcaster.loop = asyncio.get_running_loop()
    presence.start_flusher()
    watcher = asyncio.create_task(notice_watcher())
    tasks = [watcher]
    if config.ENABLE_SCHEDULER:
        from .scheduler import scheduler_loop
        tasks.append(asyncio.create_task(scheduler_loop()))
    yield
    for t in tasks:
        t.cancel()
    presence.flush()


app = FastAPI(title="Campus Darpan API", version="0.1.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(public.router)
app.include_router(admin.router)
app.include_router(admin_notices.router)
app.include_router(admin_notices.public)
app.include_router(inbound.router)
app.include_router(push_api.router)


_CACHEABLE = ("/api/search/suggest", "/api/faculty", "/api/notices", "/api/meta")


@app.middleware("http")
async def cdn_cache_headers(request, call_next):
    """Same answer for everyone for 15 s -> a CDN (Cloudflare) can serve most traffic without touching the server."""
    resp = await call_next(request)
    p = request.url.path
    if (request.method == "GET" and resp.status_code == 200 and "at" not in request.query_params
            and p.startswith(_CACHEABLE) and p != "/api/notices/stream"):
        resp.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=30"
    return resp
