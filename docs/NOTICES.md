# Notices: how data gets in, and how alerts go out

This app does **not** read aiub.edu pages. AIUB's robots.txt disallows automated access, so there is no scraper.
New notices can arrive through three replaceable sources. None is connected until AIUB provides one.

```
 RSS/Atom feed ─┐
 JSON API ──────┼─> NoticeSource.fetch() ─> ingest (official-link check, dedupe, save, log) ─> Web Push + live screens
 Forwarded email┘                                      ^
                       scheduler every 5 min ──────────┘     (API itself, or a free pinger, or `python -m app.scheduler`)
```

## What is built and tested

- `backend/app/notice_sources/` the interface (`base.py`) plus RSS, JSON and email sources. Add a new kind in `registry.py` only.
- `services/ingest.py` one cycle: fetch, keep only links on `NOTICE_LINK_DOMAINS`, dedupe, save, log (`ingest_runs`), then push.
- Duplicates: same canonical link (www/non-www, tracking parameters, fragments and trailing slashes ignored) **or** same title and date.
  The database's unique index settles races between two workers.
- One cycle at a time: a PostgreSQL advisory lock (a thread lock on SQLite).
- Web Push (VAPID): anonymous subscriptions, optional topic filter, one push per notice (`notification_log`), dead subscriptions removed.
- Admin: Notice sources (status, dry-run test, run now, recent checks), Email inbox (review, approve, reject, test an email), Alerts (subscribers, history, test alert to your own browser).
- No manual posting: admins can approve or reject a forwarded email that carries an official link. They cannot type a notice in.

**Honest limits.** The tests use small sample feeds and emails written for the tests. They prove the code, not any AIUB connection.
Web Push delivery to a real browser has not been run end to end in the build environment (no real push service is reachable there).
The push signing with your key format is tested, and the sending step is tested with a fake sender. Do the check below once deployed.

## One-time setup on Render

1. `python -m app.tools.vapid` on any computer. Put `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in the API service's environment. Keep the private one secret.
2. Keep `ENABLE_SCHEDULER=1`. Free Render services sleep after 15 minutes without visits, and a sleeping API checks nothing.
   To keep it awake and trigger checks every 5 minutes, make a free job at cron-job.org (or a GitHub Actions schedule):
   `POST https://<api>/api/internal/run-cycle` with header `X-Cron-Secret: <CRON_SECRET from Render>`.
3. Test push: open the site's Notices page on your phone, tap "Notify me", then Admin, Alerts, "Send a test alert to this browser".
   On iPhone, add the site to the Home Screen first (Apple only allows web push for installed web apps).

## Connecting a source when AIUB provides one

Set `NOTICE_SOURCES` (JSON list) on the API service, then Admin, Notice sources, "Test" shows what would be saved without saving anything.

| AIUB gives you | Config |
|---|---|
| An RSS/Atom feed | `{"type":"rss","name":"aiub-feed","url":"https://...","authorized_by":"who said yes, when"}` |
| A JSON API | `{"type":"json","name":"aiub-api","url":"https://...","items_path":"data.items","fields":{"title":"headline","url":"link","published":"date"},"auth_env":"AIUB_API_TOKEN"}` |
| Forwarded emails | `{"type":"email","name":"email-inbox"}` plus the webhook below |

`authorized_by` turns off the robots.txt check for that one source. Fill it in only with written permission. Without it, the source refuses to
fetch anything robots.txt does not allow, or cannot confirm. Source URLs must be https.

## Forwarded email webhook

`POST https://<api>/api/inbound/email` with header `X-Inbound-Secret: <INBOUND_EMAIL_SECRET>` and a JSON body:

```json
{"from": "Registrar <registrar@aiub.edu>", "subject": "Fwd: Final exam schedule", "text": "https://www.aiub.edu/...", "date": "Tue, 17 Nov 2026 10:00:00 +0600", "message_id": "<unique@id>"}
```

(`html` and a `links` list of hrefs also work.) The notice is published automatically only if the sender is on `INBOUND_SENDER_ALLOWLIST`
and the email contains a link on `NOTICE_LINK_DOMAINS`. Everything else waits in Admin, Email inbox. The same message-id is never processed twice.
Set `INBOUND_AUTO_PUBLISH=0` to hold every email for review.

How the email reaches the webhook is up to AIUB IT. Possible routes (none tested with AIUB's systems): a mail rule or flow in their Microsoft 365
that posts to the webhook, or a mail-to-webhook service such as a Cloudflare Email Worker. Only a dedicated mailbox should be forwarded, never students' own mail.
The shared secret protects the webhook. The sender allowlist is a second check on a header the sender controls, so treat it as a filter, not as proof.

## Running the scheduler somewhere else

`python -m app.scheduler` runs the same loop as its own process (a paid worker, a small VPS). Running it in two places is harmless because of the lock.
