"""Five-minute monitoring loop.

Runs inside the API process when ENABLE_SCHEDULER=1, or on its own:  python -m app.scheduler
A database lock makes overlapping runs impossible, so running it in two places is harmless."""
import asyncio
import logging

from . import config
from .services.ingest import run_cycle

log = logging.getLogger("scheduler")


async def scheduler_loop(interval: int | None = None):
    every = interval or config.SCHEDULER_INTERVAL_SEC
    log.info("scheduler started, every %ss", every)
    while True:
        try:
            result = await asyncio.to_thread(run_cycle)
            if result["runs"]:
                log.info("cycle done: %s", [(r["source"], r["status"], r["new"]) for r in result["runs"]])
        except Exception:
            log.exception("cycle crashed; will retry next interval")
        await asyncio.sleep(every)


if __name__ == "__main__":
    from .db import init_db
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    init_db()
    asyncio.run(scheduler_loop())
