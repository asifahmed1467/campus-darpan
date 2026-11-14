import os
import secrets

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./aiub.db")
# Hosts such as Render hand out "postgres://" or "postgresql://"; SQLAlchemy needs the psycopg driver named.
for _old in ("postgres://", "postgresql://"):
    if DATABASE_URL.startswith(_old):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len(_old):]
TIMEZONE = os.getenv("AIUB_TZ", "Asia/Dhaka")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

# Weekend for AIUB UG programs: Friday + Saturday (day index: SUN=0 ... SAT=6)
WEEKEND_DAYS = {5, 6}
WORK_START_MIN = 8 * 60   # 08:00
WORK_END_MIN = 17 * 60    # 17:00 (UG classes run 8am-5pm)
MIN_GAP_MIN = 20          # shortest "not in class" gap worth showing

# Admin auth. Set AIUB_SECRET in production; a random one only lasts until restart.
SECRET = os.getenv("AIUB_SECRET") or secrets.token_urlsafe(48)
TOKEN_HOURS = 12

# Lets ?at=2026-11-15T10:30 simulate "now" (handy for demos/tests). Turn off in production.
ALLOW_TIME_TRAVEL = os.getenv("ALLOW_TIME_TRAVEL", "1") == "1"

PRESENCE_WINDOW_SEC = 60
STORE_TTL_SEC = 30

# Set TRUST_PROXY_HEADERS=1 only when the API sits behind Cloudflare/nginx (so client IPs can be trusted).
TRUST_PROXY_HEADERS = os.getenv("TRUST_PROXY_HEADERS", "0") == "1"
