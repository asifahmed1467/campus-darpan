# ক্যাম্পাসদর্পণ (Campus Darpan)

**Your Campus, Connected.** AIUB-এর সকল একাডেমিক তথ্য, এক ঠিকানায়।

A website for AIUB students: live notices, "is this teacher free right now?", ask-by-voice answers with sources, and (later) a room finder. Students never sign up. Only admins log in.

This is **Phase 1**. The full plan is in `docs/PLAN.md`.

## Run it

**Windows:** double-click `start-dev.bat`. It installs what is missing, creates the database, starts both servers and opens http://localhost:3000. It needs Python 3.11+ and Node 20+. (Written but not yet run on a Windows machine, so tell me if it stops.)

**Mac / Linux, by hand:**
```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m app.seed --demo          # loads semester, holidays, the 5 TSFs, and prints the admin password once
uvicorn app.main:app --port 8000

cd ../frontend                      # in a second terminal
cp .env.local.example .env.local
npm install && npm run dev          # http://localhost:3000
```
Admin login: http://localhost:3000/admin/login, username `asif`. The password is printed once by the seed step (or set `ADMIN_INITIAL_PASSWORD` before seeding). Create the other 5 to 6 admins from the API (`POST /api/admin/admins`, super admin only).

**Try the clock:** add `?at=2026-11-15T10:30` to any page address to see the site as if it were Sunday 10:30 AM. Turn this off in production with `ALLOW_TIME_TRAVEL=0`.

## What works

| Feature | Status |
|---|---|
| Faculty search with autocomplete ("Ny" finds Nyme Ahmed), typo tolerant | Done, tested |
| "Free now / until when / next free" from each TSF, Dhaka time, Fri+Sat weekend, holidays, semester dates | Done, tested (14 unit tests) |
| Admin: upload TSF one teacher at a time or many (paste JSON, JSON file, or CSV), checked and previewed as a timetable before saving | Done, tested in a browser |
| Teachers without a TSF list, teacher import (CSV), holidays, semester, pages for Ask AIUB | Done |
| Voice: speak a question, hear the answer (browser speech, no server cost) | Done; needs Chrome/Edge and a microphone |
| Ask AIUB: answers teacher questions from schedules, notices from the notice list, other questions only from pages an admin has added, always with the source | Done. Not yet an AI model, see below |
| Live notice alerts on every open screen, anonymous online counter, Bangla/English labels, installable app manifest | Done |
| Room Finder | Page and "coming soon" state only. Needs the floor plans |
| Notices pipeline: replaceable sources (RSS, JSON, forwarded email), duplicate detection, 5-minute scheduler, Web Push, admin review | **Built and tested with sample data. No AIUB source connected.** See `docs/NOTICES.md` |

65 automated tests: `cd backend && pytest`.

## Things you must do or decide

1. **A notice source.** aiub.edu's robots rules disallow automated access, so the app never reads its pages. Ask AIUB IT for a notice feed, an API or an email forward (`docs/NOTICES.md`). Until one is connected the Notices page stays empty and admins cannot post by hand. The faculty list must also come from AIUB or be entered by an admin.
2. **Ask AIUB is not an AI model yet.** It finds the best matching passage in pages you add and shows it with its link. A language model (for example Gemini Flash or Groq Llama) can sit on top later to phrase answers, with the same source rule.
3. **Permission to show schedules.** Three of the five TSFs came from the logged-in student portal. Ask the departments before going public. Never scrape the portal.
4. **Estimated times.** Some TSF end times were cut off in the screenshots and were estimated from block sizes. Check them against the portal.

## Going live (for 2,000 students)

- Put it behind Cloudflare. The API already sends `Cache-Control: public, max-age=15` on search, faculty and notice lists, so most requests never reach the server. Set `TRUST_PROXY_HEADERS=1` so rate limits see real student IPs.
- Use PostgreSQL: `DATABASE_URL=postgresql+psycopg://user:pass@host/db` (add `psycopg[binary]` to requirements).
- Set `AIUB_SECRET` to a long random value, `CORS_ORIGINS` to your site address, `ALLOW_TIME_TRAVEL=0`.
- Run the API with 2 or more workers: `uvicorn app.main:app --workers 2`. The 5-minute notice check can run inside the API (`ENABLE_SCHEDULER=1`) or as `python -m app.scheduler`. New notices reach open screens within about 5 seconds.
- The online counter and rate limits live in each worker's memory. For several servers, move them to Redis.

**Load test honesty:** in the build sandbox (2 CPUs shared with the load generator) 2,000 simulated students made 11,600 requests with zero errors, but the machine itself only managed about 200 requests per second, so its response times say little about real hosting. Measured without the network, one core handled roughly 400 to 600 requests per second on the real endpoints. That is enough headroom for 2,000 students on a small server, but it is an estimate: run a load test (k6 or Locust) on your actual hosting before exam week.

## Layout

```
backend/   FastAPI. app/api (public + admin), app/services (free_time, tsf_import, store, realtime, ingest, push), app/notice_sources, tests/
frontend/  Next.js 15 + Tailwind. app/ (pages), components/, lib/
docs/      PLAN.md (the full project plan)
```

## TSF file format

```json
{ "semester": "Fall 2026-27",
  "faculty": [ { "name": "Nyme Ahmed", "email": "nyme.ahmed@aiub.edu",
    "slots": [ { "day": "SUN", "start": "08:00", "end": "10:20", "type": "CLASS", "course": "OOP1", "section": "K", "room": "D-0302" },
               { "day": "SUN", "start": "10:20", "end": "12:40", "type": "CONSULTATION", "room": "D-0510" } ] } ] }
```
Types: `CLASS`, `CONSULTATION`, `ADMIN`. "Free" is worked out, never typed. A real example with 5 teachers is in `backend/seed_tsf_batch_01.json`.
