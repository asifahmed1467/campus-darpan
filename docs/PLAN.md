# ক্যাম্পাসদর্পণ (Campus Darpan): Full Project Plan

> One fast, beautiful website where AIUB students can get the latest notices instantly, find any faculty member and their next free time, ask questions by voice or text with answers taken from official AIUB pages, and (later) find any room on campus.

**Working name ideas:** *AIUB Pulse* · *CampusMate* · *Kuril Companion*
**Target users:** AIUB students (freshers to seniors), plus an Admin panel for the team
**Load target:** 2,000 students using it at the same time without failure

---

## 1. Feature Overview

| # | Feature | Priority | Status |
|---|---|---|---|
| M1 | Live AIUB Notice Feed + instant notifications | Must | Phase 1 |
| M2 | Faculty Directory (all faculties) + room numbers | Must | Phase 1 |
| M2a | "Next Free Time" from consultation hours / TSF (live, based on current time) | Must | Phase 1 |
| M2b | Search-as-you-type autocomplete ("Ny" → "Nyme Ahmed") | Must | Phase 1 |
| M2c | Voice: Speech-to-Text input + Text-to-Speech answers | Must | Phase 2 |
| M2d | Ask AIUB (RAG chatbot) answering from aiub.edu with **references** | Must | Phase 2 |
| M3 | Room Finder for freshers (segment ready, data later) | Must (placeholder) | Phase 3 |
| A | Admin Panel: upload TSF as JSON array / CSV, manage data | Must | Phase 1 |
| X | Extra "wow" features (Section 8) | Nice | Phase 2–4 |

---

## 2. Tech Stack (light, fast, free-tier friendly)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript** | Fast, SEO, server rendering, easy deploy |
| UI | **Tailwind CSS + shadcn/ui + Framer Motion** | Modern look, smooth animations, accessible components |
| Icons / Fonts | Lucide icons, **Inter** (English) + **Hind Siliguri** (Bangla) | Clean and readable in both languages |
| Backend API | **FastAPI (Python)** | Async, fast, and best for scraping + AI work |
| Database | **PostgreSQL** (Supabase or Neon) + **pgvector** | One DB for normal data **and** AI vector search |
| Cache / Queue | **Redis** (Upstash or self-hosted) | Caching, rate limiting, job queue, pub/sub for notifications |
| Search | **Meilisearch** (or Postgres `pg_trgm` for v1) | Instant, typo-tolerant autocomplete |
| Background jobs | **Celery / ARQ worker + scheduler** | Scrape notices every few minutes, re-index pages |
| Scraping | `httpx` + `BeautifulSoup` (Playwright only if a page needs JS) | Lightweight and polite |
| AI — embeddings | **`multilingual-e5-small`** or **`bge-m3`** (handles English + Bangla) | Small, accurate, runs on CPU |
| AI — answer model | Hosted small LLM API: **Gemini Flash / Groq (Llama 3.x 8B) / GPT-4o-mini**; fallback local **Qwen2.5-3B via Ollama** | Cheap, fast, handles 2,000 users better than a self-hosted model |
| Voice | Browser **Web Speech API** (STT + TTS) — fallback: Whisper-small (STT) | Free, runs on the student's device, zero server load |
| Realtime | **Server-Sent Events (SSE)** + **Web Push (PWA)** | New-notice alerts in site and on phone |
| Hosting | Frontend on **Vercel**; API + worker on **Railway / Render / a VPS** behind **Cloudflare** | CDN + DDoS protection + free SSL |
| Monitoring | Sentry (errors), UptimeRobot (uptime), Grafana/Logs | Know before students complain |

---

## 3. System Architecture

```
            ┌──────────────────────── Students (2,000+) ────────────────────────┐
            │  Browser / Installed PWA  (Next.js UI, Web Speech STT/TTS)        │
            └───────────────┬───────────────────────────────┬───────────────────┘
                            │ HTTPS (via Cloudflare CDN)    │ SSE / Web Push
                            ▼                               ▼
                 ┌──────────────────────┐        ┌──────────────────────┐
                 │  Next.js (Vercel)    │        │  Notification Service │
                 │  pages, cached data  │        │  (SSE + Web Push)     │
                 └─────────┬────────────┘        └─────────▲────────────┘
                           │ REST API                      │ Redis pub/sub
                           ▼                               │
                 ┌──────────────────────────────────────────┴──────────┐
                 │                FastAPI Backend                       │
                 │  /notices  /faculty  /search  /free-time  /ask      │
                 │  rate limiter • request queue • semantic cache       │
                 └──────┬─────────────┬───────────────┬────────────────┘
                        │             │               │
                ┌───────▼──┐   ┌──────▼─────┐   ┌─────▼──────┐   ┌──────────────┐
                │PostgreSQL│   │   Redis    │   │Meilisearch │   │ LLM API      │
                │+ pgvector│   │cache/queue │   │autocomplete│   │(small model) │
                └───────▲──┘   └──────▲─────┘   └─────▲──────┘   └──────────────┘
                        │             │               │
                 ┌──────┴─────────────┴───────────────┴──────┐
                 │ Background Worker + Scheduler             │
                 │ • Notice scraper (every 3–5 min)          │
                 │ • Faculty scraper (daily)                 │
                 │ • Website crawler + embedder for RAG      │
                 │   (weekly + on new notices)               │
                 └───────────────────────────────────────────┘
```

**Key idea for 2,000 users:** students **never** trigger scraping. The worker scrapes once and saves to the DB; students only read from the cache/DB. This makes the site fast and avoids overloading aiub.edu.

---

## 4. Main Feature 1 — Live Notice Feed + Notifications

### How it works
1. Scheduler runs the **notice scraper every 3–5 minutes**.
2. Scraper fetches the AIUB notices list page (verify the exact URL on aiub.edu), reads title, date, link.
3. For each notice, it computes a **hash of the URL** → if it isn't already in the DB, it's **new**.
4. New notice → fetch the full notice page → save title, date, body text, attachments (PDF links).
5. Publish an event to **Redis pub/sub** → all open browsers get it via **SSE** (toast + bell badge), and subscribed phones get a **Web Push** notification.
6. The notice is also chunked + embedded into the RAG index so the chatbot knows it immediately.

### Smart extras
- **AI one-line summary** of each notice ("Final exam schedule for Fall 2026-27 published").
- **Auto category tags:** Exam · Registration · Holiday · Scholarship · Convocation · Admission · Events · Probation.
- **Deadline extraction:** dates detected inside notices → "⏰ 3 days left" countdown chips + **Add to Calendar (.ics / Google Calendar)** button.
- **Personal filters:** students subscribe only to the tags they care about (e.g., Exams + Scholarship).
- **"Changed" detection:** if an existing notice is edited/reposted, show an "Updated" badge.
- PDF notices: extract text with `pdfplumber` so they are searchable too.

### Polite scraping rules
- Check `robots.txt`, send a clear User-Agent, **max 1 request/second**, use `If-Modified-Since`/ETag when available.
- Retry with backoff; if aiub.edu is down, show the last cached notices with a "Last checked: 2 min ago" label.
- Ask the AIUB IT office for permission / an official feed. This protects the project and looks great in your report.

### DB table: `notices`
```sql
id UUID PK, url TEXT UNIQUE, url_hash TEXT UNIQUE, title TEXT, published_date DATE,
body_text TEXT, summary TEXT, tags TEXT[], deadlines JSONB, attachments JSONB,
first_seen_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

---

## 5. Main Feature 2 — Faculty Directory + Next Free Time

### 5.1 Faculty data collection
- Scrape the faculty list pages for **all five faculties**: **FST, FE, FBA, FASS, FHLS** (e.g., `aiub.edu/faculties/fst` → Faculty List).
- Collect: name, designation, department, faculty, email, **room number / building**, photo URL, profile URL.
- Run **daily** (faculty data changes rarely). Admin can also correct anything manually.

### DB table: `faculty`
```sql
id UUID PK, name TEXT, initials TEXT, designation TEXT, department TEXT,
faculty_code TEXT,            -- FST / FE / FBA / FASS / FHLS
email TEXT, room TEXT, building TEXT, floor TEXT,
photo_url TEXT, profile_url TEXT, aliases TEXT[],   -- e.g. "Nyme sir", short forms
updated_at TIMESTAMPTZ
```

### 5.2 TSF upload (Admin) — no pictures, easy array format

Admin uploads the TSF either as **JSON** or a **CSV/Excel file** (template provided). Each item is one weekly time block.

**JSON format (preferred):**
```json
{
  "semester": "Fall 2026-27",
  "valid_from": "2026-09-01",
  "valid_to": "2026-12-31",
  "faculty_email": "nyme.ahmed@aiub.edu",
  "slots": [
    { "day": "SUN", "start": "08:00", "end": "09:30", "type": "CLASS", "course": "CSE 3101", "room": "D-0302" },
    { "day": "SUN", "start": "10:00", "end": "11:30", "type": "FREE" },
    { "day": "SUN", "start": "11:30", "end": "13:00", "type": "CONSULTATION", "room": "D-0510" },
    { "day": "TUE", "start": "14:00", "end": "15:30", "type": "CLASS", "course": "CSE 4201", "room": "Annex-8 302" }
  ]
}
```

**CSV format (same data, for people who prefer Excel):**
```
faculty_email,day,start,end,type,course,room
nyme.ahmed@aiub.edu,SUN,10:00,11:30,FREE,,
nyme.ahmed@aiub.edu,SUN,11:30,13:00,CONSULTATION,,D-0510
```

**Upload one by one, whenever a TSF becomes available** (Admin Panel → TSF Manager → Add / Update TSF). Three ways:
- **Grid editor (easiest):** search the faculty → tap/drag blocks on a weekly grid → mark Class / Free / Consultation (+ room) → Save.
- **Paste JSON array** for that faculty.
- **Upload CSV/Excel** for one faculty (bulk upload also supported if many arrive together).

Uploading a TSF only adds/replaces **that** faculty's schedule. Faculty without a TSF show "Schedule not available yet". A **"Faculty without TSF"** list shows the admin what is still missing.

**Upload flow in Admin panel:**
1. Choose a method above (grid / JSON / CSV).
2. Validation: day names, `HH:MM` format, start < end, no overlapping slots, faculty exists.
3. **Preview as a weekly timetable grid** → admin clicks **Confirm**.
4. Saved with semester + version history (can roll back).

### DB table: `tsf_slots`
```sql
id UUID PK, faculty_id UUID FK, semester TEXT, day SMALLINT,   -- 0=SUN..6=SAT
start_time TIME, end_time TIME, type TEXT,  -- CLASS / FREE / CONSULTATION / OFF
course TEXT, room TEXT, valid_from DATE, valid_to DATE
```

### 5.3 "Next Free Time" logic (always Asia/Dhaka time)

```
now = current time in Asia/Dhaka
slots = this faculty's FREE + CONSULTATION slots valid for today's date

1. If now is inside a FREE/CONSULTATION slot
      → "🟢 Free now until 11:30 AM (45 min left) — Room D-0510"
2. Else find the first slot later today
      → "🟡 In class now (CSE 3101, D-0302). Next free: today 11:30 AM (in 25 min)"
3. Else look forward day by day (up to 7 days, skipping holidays)
      → "🔴 Not available today. Next free: Tuesday 10:00 AM"
4. No TSF uploaded → "Schedule not available yet" + email button
```

- Holiday table (`holidays`) — from notices or admin — so it doesn't say "free" on a holiday.
- Pre-compute each faculty's weekly schedule into Redis → answer in **<10 ms**.
- Live status badge on every faculty card: 🟢 Free · 🟡 In class · ⚪ Off-day.

### 5.4 Search-as-you-type autocomplete
- **Meilisearch** index on name, initials, aliases, department, room.
- Typing **"Ny"** → shows **"Nyme Ahmed — CSE, FST · Room D-0510 · 🟢 Free now"** in the dropdown.
- **Typo tolerant** ("Nime Ahmd" still finds him), searches by **room** or **course code** too.
- Debounce 150 ms on the frontend; results cached in Redis; keyboard navigation (↑ ↓ Enter).

### 5.5 Voice (STT + TTS)
- 🎤 mic button next to every search/chat box.
- **STT:** Browser Web Speech API (supports `en-US` and `bn-BD`). Fallback for unsupported browsers: upload audio → Whisper-small on server (rate limited).
- Example: student says *"When is Nyme sir free?"* → text → intent detected (faculty free-time) → answer.
- **TTS:** 🔊 "Listen" button on every answer using `speechSynthesis` (Bangla + English voices); speed control; auto-read toggle for accessibility.
- Runs on the student's device → **no server cost, no load issue**.

### 5.6 "Ask AIUB" — RAG chatbot with references

**Indexing (background, weekly + on every new notice):**
1. Crawl allowed aiub.edu pages: admission, scholarships/waivers, academic regulations, fees, grading, notices, faculty pages, FAQs, PDFs.
2. Clean the text → split into ~500-token chunks with overlap → store `url`, `title`, `section`, `last_crawled`.
3. Embed with `multilingual-e5-small` → store in **pgvector**.

**Answering (per question):**
1. **Intent router** (cheap rules + small classifier):
   - "free / room / where is sir" → **Faculty tool** (DB, no LLM needed)
   - "notice / exam schedule" → **Notice search**
   - everything else → **RAG**
2. **Hybrid retrieval:** vector search + keyword (BM25) → top 10 → re-rank → top 4 chunks.
3. Small LLM gets a strict prompt: *answer ONLY from these sources; if not found, say "I couldn't find this on the AIUB website" and link the closest page.*
4. Response shows **numbered citations** → `[1] Scholarship & Waiver — aiub.edu/...` (clickable, with "last updated" date).
5. Streamed word by word (feels fast), with 👍/👎 feedback stored for improvement.

**Accuracy safeguards:** no answer without a source; show page date; confidence threshold; admin can view 👎 answers and fix data.

### DB tables for RAG
```sql
documents(id, url, title, type, last_crawled, content_hash)
chunks(id, document_id, chunk_text, embedding VECTOR(384), section)
qa_logs(id, question, answer, sources JSONB, feedback SMALLINT, created_at)
```

---

## 6. Main Feature 3 — Room Finder (segment ready now, data later)

- Page + search bar ready from Phase 1, with a "Coming soon — map data being added" state.
- Data model prepared so the floor/room data can be plugged in later:
```sql
buildings(id, code, name, floors)
rooms(id, code, building_id, floor, type, near_landmarks TEXT[], x NUMERIC, y NUMERIC)
paths(id, from_node, to_node, distance, is_stairs, is_lift)   -- for routing later
```
- **v1 (simple):** "D-0302 → D Building, Level 3, next to Stair 2" + floor image with the room highlighted.
- **v2:** interactive SVG floor map, step-by-step route (A* on the `paths` graph).
- **v3:** AR navigation (the AR project idea) using the same graph.
- Linked everywhere: faculty room numbers and class rooms are clickable → open Room Finder.

---

## 7. Handling 2,000 Concurrent Students ("batch" + no failure)

| Problem | Solution |
|---|---|
| Many people loading notices/faculty | Served from **Redis cache + Cloudflare CDN**; pages use ISR/static caching |
| Scraping overload | Only the **background worker** scrapes; users never trigger it |
| LLM cost and slowness | **Request queue + batching** (group embedding calls, batch LLM requests); **semantic cache** — same/similar question ("scholarship criteria?") answered from cache instantly |
| Abuse/spam | Rate limit per IP/user (e.g., 10 AI questions/min), Cloudflare bot protection |
| Free-time lookups | Pre-computed schedules in Redis, pure math, no LLM |
| Voice | Done in the browser — zero server load |
| Server crash | 2+ API instances behind a load balancer, health checks, auto-restart; DB connection pooling (PgBouncer) |
| LLM API down | Fallback model provider → then "show top source links" mode |
| Realtime alerts for 2,000 users | SSE via a light service + Redis pub/sub; Web Push handled by the browser push service |

**Load testing:** use **k6** or **Locust** to simulate 2,000 virtual users (mix: 60% notices, 25% faculty search, 15% Ask AIUB). Target: p95 < 500 ms for normal pages, < 3 s first token for AI answers, 0% errors.

---

## 8. Extra Unique Features (make it stand out)

1. **📱 Installable PWA** — works like an app on Android/iPhone, home-screen icon, push notifications, works **offline** for cached notices and faculty list.
2. **⌘K Command Palette** — press `Ctrl+K` / `/` anywhere → search notices, faculty, rooms, ask questions in one box.
3. **🟢 Live faculty status chips** — Free now / In class / Off-day on every card.
4. **⭐ Favourite faculty** — "Notify me when Nyme sir becomes free" (push alert at the start of their next free slot).
5. **🗓️ My Day dashboard** — today's important notices, favourite faculty status, upcoming deadlines in one screen.
6. **🌐 Bangla / English toggle** — full UI + chatbot answers in both languages.
7. **🌙 Dark mode** + **high-contrast / large-text accessibility mode**.
8. **📌 QR codes for faculty doors** — admin prints a QR per faculty; scanning shows their live status and next free time (useful when the office is empty).
9. **🤖 Telegram/Messenger bot** (later) — same notice alerts + "free time" command, for students who don't open the website.
10. **🧠 "Explain this notice"** — one click, AI explains a long/complicated notice in simple Bangla.
11. **📊 Admin analytics** — most searched faculty, most asked questions, unanswered questions (shows what info AIUB should publish).
12. **👥 Live Active Users counter** — shown in the header: "🟢 312 students online now".
    - Works without login: each open tab gets an anonymous random ID and sends a tiny "heartbeat" every 30 s (or is counted through the open SSE connection).
    - Stored in Redis with a 60 s expiry → count = IDs seen in the last 60 s. Very light, handles 2,000+ users easily.
    - Admin dashboard also shows: online now, today / this week / this month unique visitors, peak time of day, most used features (chart).
    - No personal data stored — only anonymous IDs and counts.
13. **🔗 Share cards** — share a notice or faculty free-time as a nice image/link to WhatsApp/Messenger groups.

---

## 9. Frontend Design Plan (look + feel)

**Design style:** clean, modern "glass + cards" look, AIUB **dark blue** as primary colour, soft accent (sky blue / teal), lots of white space, rounded corners (16px), subtle shadows, smooth micro-animations.

**Colour palette (suggestion):**
- Primary: `#0B2A6F` (AIUB-style dark blue) · Accent: `#2BB0ED` · Success: `#16A34A` · Warning: `#F59E0B` · Danger: `#DC2626`
- Light background `#F7F9FC`, dark mode background `#0B1220`

**Pages:**
1. **Home ("My Day")** — big search bar (with mic), latest 5 notices, favourite faculty status, deadline chips.
2. **Notices** — infinite scroll cards, tag filter chips, search, "New" glow badge, calendar button.
3. **Faculty** — search with autocomplete, filters (FST / FE / FBA / FASS / FHLS, department), card grid with photo, room, live status.
4. **Faculty profile** — weekly timetable grid (colour-coded Class/Free/Consultation), "Next free" big banner, room link, email button, "Notify me".
5. **Ask AIUB** — chat UI with mic, streaming answers, citation chips, 🔊 listen button, suggested questions ("Scholarship criteria?", "Retake policy?").
6. **Room Finder** — search + "coming soon" map area.
7. **Admin** (the only page with a login) — TSF Manager (grid editor / JSON / CSV), "Faculty without TSF" list, faculty editor, holidays, scraper status, analytics.

> Students: **no signup, no login** — open the site and use everything immediately.

**UX rules:**
- **Mobile-first** (most students use phones), bottom navigation bar on mobile.
- Every action ≤ 2 taps from Home.
- Skeleton loaders (never blank screens), friendly empty states, toast notifications.
- Accessibility: keyboard navigation, ARIA labels, contrast ≥ 4.5:1, screen-reader friendly.
- Lighthouse target: **90+** on Performance, Accessibility, Best Practices, SEO.

---

## 10. API Endpoints (draft)

```
GET  /api/notices?tag=&q=&page=          list notices
GET  /api/notices/stream                 SSE — live new notices
POST /api/push/subscribe                 Web Push subscription
GET  /api/faculty?faculty=FST&dept=      list faculty
GET  /api/faculty/{id}                   profile + weekly TSF
GET  /api/faculty/{id}/next-free         live "next free time"
GET  /api/search/suggest?q=Ny            autocomplete
POST /api/ask                            RAG question → streamed answer + sources
POST /api/ask/feedback                   👍 / 👎
GET  /api/rooms?q=                       room finder (later)
POST /api/presence/heartbeat             anonymous "I'm online" ping
GET  /api/presence/count                 live active users count

# Admin (auth required)
POST /api/admin/tsf/upload               JSON array / CSV upload
POST /api/admin/tsf/confirm              confirm preview
CRUD /api/admin/faculty | /holidays
POST /api/admin/reindex                  re-crawl + re-embed
GET  /api/admin/analytics
```

---

## 11. Security & Privacy

- **Only the Admin has a login page** (`/admin/login`) — strong password + 2FA, role-based access (Super Admin, Data Editor). No public signup page exists.
- **Students never sign up or log in.** Everything works instantly when they open the site.
  - Favourite faculty, tag filters, language and dark mode are saved in the student's own browser (localStorage) — no account needed.
  - Push notifications use an **anonymous browser subscription** (no name, email or ID stored).
  - Rate limiting is done by IP + anonymous device ID, so no account is needed to prevent abuse.
- Never ask for AIUB portal passwords; never scrape the student portal.
- Show faculty schedules **only with university/faculty permission** — get written approval from the department before going live.
- Input validation, CORS, HTTPS everywhere, secrets in environment variables, daily DB backups.

---

## 12. Folder Structure

```
aiub-companion/
├── frontend/                 # Next.js app
│   ├── app/ (home, notices, faculty, ask, rooms, admin)
│   ├── components/ (ui, NoticeCard, FacultyCard, SearchBox, VoiceButton, ChatWindow)
│   ├── lib/ (api client, speech utils, sse)
│   └── public/ (icons, manifest.json, service-worker)
├── backend/                  # FastAPI
│   ├── app/api/ (notices, faculty, search, ask, admin)
│   ├── app/services/ (free_time.py, rag.py, intent_router.py, push.py)
│   ├── app/models/ (SQLAlchemy models)
│   └── app/core/ (config, cache, rate_limit, security)
├── worker/
│   ├── scrapers/ (notices.py, faculty.py, site_crawler.py)
│   ├── jobs/ (embed.py, summarize.py, schedule.py)
├── infra/ (docker-compose.yml, nginx.conf, k6 load tests)
└── docs/ (TSF_template.csv, TSF_template.json, API.md)
```

---

## 13. Development Roadmap (~14 weeks)

| Phase | Weeks | Deliverables |
|---|---|---|
| **0. Setup & permission** | 1 | Repo, design system in Figma, DB schema, request AIUB IT/department permission |
| **1. Core** | 2–5 | Notice scraper + feed + SSE alerts; faculty scraper + directory; autocomplete; Admin TSF upload; Next Free Time; Room Finder placeholder |
| **2. Intelligence** | 6–9 | RAG crawler + pgvector + Ask AIUB with citations; STT/TTS; notice summaries, tags, deadlines; PWA + Web Push |
| **3. Polish & extras** | 10–12 | Dark mode, Bangla UI, ⌘K palette, favourites + "notify when free", QR door codes, admin analytics |
| **4. Scale & launch** | 13–14 | k6 load test (2,000 users), caching tuning, monitoring, beta test with 50–100 students, fix feedback, public launch |

**Team split (4 members suggestion):** Frontend/UI · Backend/API · Scraping + RAG/AI · DevOps/testing/Admin panel.

---

## 14. Testing Checklist

- [ ] New notice appears on site within 5 minutes of AIUB posting it
- [ ] Push notification arrives on Android Chrome and installed PWA
- [ ] "Ny" shows "Nyme Ahmed" in < 200 ms; typos still match
- [ ] Next-free-time correct for: inside a free slot, between classes, end of day, weekend, holiday, no TSF
- [ ] Invalid TSF upload shows clear errors (bad time, overlap, unknown faculty)
- [ ] Ask AIUB always returns sources; says "not found" instead of guessing
- [ ] Voice works in Chrome (Android/desktop), graceful fallback in other browsers
- [ ] 2,000 virtual users: 0% errors, p95 < 500 ms (non-AI)
- [ ] Lighthouse 90+ on mobile

---

## 15. Success Metrics (for your report / defense)

- Notice alert delay: **< 5 min**
- Faculty search accuracy: **> 95%** correct match in top 3
- Ask AIUB: **> 85%** answers rated correct by a test panel, **100%** with references
- Load: **2,000 concurrent users**, zero failures
- Adoption: weekly active students, % of questions answered without contacting the office

---

## 16. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| AIUB website layout changes → scraper breaks | Selector config file, scraper health alerts, admin "scraper status" page |
| Faculty schedule privacy concerns | Official permission; faculty can opt out; show only free/consultation, not personal info |
| LLM gives wrong answer | Strict source-only prompt, citations, feedback loop, "not found" fallback |
| Free-tier limits hit | Caching, semantic cache, rate limits, upgrade path documented |
| aiub.edu blocks scraping | Low frequency, polite headers, ask for official feed/RSS |

---

## 17. Data Needed to Start (initial)

**Must have (Phase 1):**
1. **Exact URLs** — AIUB notice list page and the faculty list page of each faculty (FST, FE, FBA, FASS, FHLS).
2. **3–5 sample TSFs** (any format) — to finalise the TSF format and test the free-time logic.
3. **Official class time slots** — e.g. 8:00–9:30, 9:30–11:00 … and which days are class days / weekend.
4. **Current semester info** — name (e.g. Fall 2026-27), start date, end date, mid/final exam weeks.
5. **Holiday list** for this semester (or the academic calendar PDF).
6. **Admin details** — who will be admin(s) and how many.

**Needed for Phase 2 (AI chatbot):**
7. List of important AIUB pages/PDFs to answer from — scholarship/waiver, fees, academic regulations, grading, admission, FAQs.
8. 20–30 common student questions (with correct answers if possible) — to test chatbot accuracy.

**Needed later (Room Finder):**
9. Building list, floor plans/photos, room numbers per floor.

**Design / branding:**
10. Project name, logo (if any), preferred colours.
11. AIUB permission letter/email (for scraping and showing faculty schedules).

## 19. Build status (14 Nov 2026)

Phase 1 is built and tested: faculty directory, search, free-time logic, admin TSF upload, voice, extractive Ask AIUB, live notices, online counter. Not done: notice/faculty scraping (blocked by robots.txt, needs AIUB permission), AI-written answers, room finder data, click-to-draw TSF grid editor, push notifications when the site is closed, "notify me when sir is free". See README.md.

## 18. Update — facts confirmed on 14 Nov 2026

**Official links**
- Notices: `https://www.aiub.edu/category/notices`
- Faculty list: `https://www.aiub.edu/faculty-list/faculties`
- Academic calendar: `https://www.aiub.edu/academic-calendar` (HTML table)
- Answers for the chatbot: crawl `https://www.aiub.edu/` (with permission, see below)

**Admins:** Asif Ahmed (Super Admin) + 5–6 more admins (Data Editor role).

**Timing rules:** UG classes 8:00 AM–5:00 PM · weekend = **Friday + Saturday** · week runs Sun–Thu.
Observed period starts in the TSFs: 8:00, 9:40, 11:20, 12:40/1:00, 2:40 — but many classes (labs, 1-hour foundation classes) don't follow them, so store **exact start/end times**, never period numbers.

**Fall 2026-27 calendar (from the calendar page):** classes start 27 Sep 2026; midterms 8–15 Nov; finals 27 Dec–3 Jan; holidays: 20–21 Oct (Durga Puja), 16 Dec (Victory Day), 25 Dec (Christmas); 6 Dec no classes; 12 Dec online makeup for Sunday classes. AIUB may change the calendar, so admins edit holidays by hand.

**TSF format changes found in the real TSFs**
- Slot types are `CLASS`, `CONSULTATION`, `ADMIN` ("Administrative Hour"). `FREE` is **not stored**; it is derived.
- Status shown to students: 🟢 *Consultation hour* (available) · 🔴 *In class* · 🟡 *Not in class, no consultation listed* · ⚪ *Off-day*.
- Rooms are often `TBA` → store `null`, show "Room TBA".
- Room codes look like `3207`, `9409`, `DS0803` (labs). Keep them as text, not numbers.
- Some faculty have no consultation hours in their TSF → status can only be "in class / not in class".
- Faculty email is not on the TSF → admin tool matches by **name** (case-insensitive, `NYME AHMED` = `Nyme Ahmed`), email optional.
- Sample data file: `tsf_batch_01.json` (5 faculty).

**⚠ Scraping blocker:** while checking, the notices and faculty-list pages were refused by the site's robots rules. The scraper must obey `robots.txt`, so **written permission from AIUB IT (or an official feed) is now required before Phase 1 scraping**. Fallbacks: admin pastes the page HTML/CSV; manual entry of faculty list.

**⚠ Portal screenshots:** three of the TSFs came from the logged-in student portal. Entering them by hand is fine for testing, but get the department's OK before showing them publicly, and never scrape the portal.

### Next steps
1. Confirm the exact notice and faculty-list URLs on aiub.edu and check `robots.txt`.
2. Get permission from the department / IT office (attach this plan).
3. Fill the TSF template for 3–5 faculty as test data.
4. Build Phase 1 (notices + faculty + free time) first — it's the most visible, most-used part.
