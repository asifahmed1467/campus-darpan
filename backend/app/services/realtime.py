"""Server-Sent Events broadcaster + anonymous presence counter (single-process; use Redis pub/sub to scale out)."""
import asyncio
import threading
import time
from datetime import date


from ..config import PRESENCE_WINDOW_SEC
from ..models import Visitor


class Broadcaster:
    def __init__(self):
        self.subs: set[asyncio.Queue] = set()
        self.loop: asyncio.AbstractEventLoop | None = None
        self._pushed: set[int] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self.subs.add(q)
        return q

    def unsubscribe(self, q):
        self.subs.discard(q)

    def publish(self, event: dict):
        """Safe to call from any thread. A notice id is only ever pushed once per process."""
        if event.get("type") == "notice":
            nid = event["notice"]["id"]
            if nid in self._pushed:
                return
            self._pushed.add(nid)
            if len(self._pushed) > 2000:
                self._pushed = set(sorted(self._pushed)[-500:])
        def _put():
            for q in list(self.subs):
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    pass
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(_put)


broadcaster = Broadcaster()


class Presence:
    """Who is online (last 60 s) + unique visitors per day. Database writes are batched in a background thread."""

    def __init__(self):
        self._seen: dict[str, float] = {}
        self._logged: set[tuple[date, str]] = set()
        self._pending: list[tuple[date, str]] = []
        self._lock = threading.Lock()
        self.peak = (0, None)
        self._flusher: threading.Thread | None = None

    def beat(self, vid: str, day: date):
        now = time.time()
        with self._lock:
            self._seen[vid] = now
            key = (day, vid)
            if key not in self._logged:
                if len(self._logged) > 50_000:
                    self._logged = {k for k in self._logged if k[0] == day}
                self._logged.add(key)
                self._pending.append(key)

    def start_flusher(self, every: float = 5.0):
        if self._flusher:
            return
        def loop():
            while True:
                time.sleep(every)
                try:
                    self.flush()
                except Exception:
                    pass
        self._flusher = threading.Thread(target=loop, daemon=True, name="presence-flush")
        self._flusher.start()

    def flush(self):
        from ..db import SessionLocal
        from sqlalchemy.exc import IntegrityError
        with self._lock:
            batch, self._pending = self._pending, []
        if not batch:
            return
        db = SessionLocal()
        try:
            for day, vid in batch:
                try:
                    with db.begin_nested():
                        db.add(Visitor(day=day, vid=vid))
                except IntegrityError:
                    pass  # already counted (other worker / restart)
            db.commit()
        finally:
            db.close()

    def count(self) -> int:
        cutoff = time.time() - PRESENCE_WINDOW_SEC
        with self._lock:
            if len(self._seen) > 5000:
                self._seen = {k: v for k, v in self._seen.items() if v >= cutoff}
            n = sum(1 for v in self._seen.values() if v >= cutoff)
        if n > self.peak[0]:
            self.peak = (n, time.time())
        return n


presence = Presence()
