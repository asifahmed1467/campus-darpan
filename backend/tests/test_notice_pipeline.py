"""Tests for the interchangeable notice-source pipeline.

The feeds and emails below are small samples written for these tests. They prove the code behaves; they are NOT
evidence that any real AIUB integration works (none exists yet)."""
import asyncio
import json
from datetime import date

import pytest

from app import config
from app.db import SessionLocal
from app.models import IngestRun, InboundEmail, Notice, NotificationLog, PushSubscription
from app.notice_sources.base import NoticeSource, RawNotice, SourceError
from app.notice_sources.json_api import parse_items
from app.notice_sources.registry import load_sources
from app.notice_sources.rss import parse_feed
from app.services import ingest, push
from app.services.dedupe import canonical_url, content_hash, link_allowed, url_variants
from app.services.emailparse import clean_subject, parse_email

RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>Sample notice A</title><link>https://www.aiub.edu/sample-a</link><pubDate>Mon, 16 Nov 2026 09:00:00 +0600</pubDate>
<description>About A</description><enclosure url="https://www.aiub.edu/files/a.pdf" type="application/pdf"/></item>
<item><title>No link item</title></item></channel></rss>"""
ATOM = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom notice</title>
<link href="https://www.aiub.edu/atom-1"/><updated>2026-11-17T08:00:00Z</updated></entry></feed>"""


class FakeSource(NoticeSource):
    kind = "fake"

    def __init__(self, name, items=None, error=None):
        self.name, self.items, self.error = name, items or [], error

    def fetch(self):
        if self.error:
            raise self.error
        return self.items


def uniq(tag):  # each test gets fresh links so the shared test database never collides
    return f"https://www.aiub.edu/t/{tag}-{id(object())}"


# ---------- dedupe helpers ----------
def test_canonical_url_collapses_variants():
    base = canonical_url("https://www.aiub.edu/notice-x")
    assert canonical_url("http://WWW.AIUB.edu/notice-x/") == base
    assert "https://aiub.edu/notice-x" in url_variants("https://www.aiub.edu/notice-x")  # www twin counts as the same page
    assert canonical_url("https://www.aiub.edu/notice-x?utm_source=fb#top") == base
    assert canonical_url("https://www.aiub.edu/notice-x?id=2") != base


def test_content_hash_ignores_case_and_punctuation():
    d = date(2026, 11, 16)
    assert content_hash("Final  Exam: Routine!", d) == content_hash("final exam routine", d)
    assert content_hash("final exam routine", d) != content_hash("final exam routine", date(2026, 11, 17))


def test_only_official_links_allowed():
    assert link_allowed("https://www.aiub.edu/x") and link_allowed("https://portal.aiub.edu/y")
    assert not link_allowed("https://aiub.edu.evil.com/x") and not link_allowed("https://example.com/aiub.edu")
    assert not link_allowed("javascript:alert(1)")


# ---------- parsers ----------
def test_rss_and_atom_parse():
    items = parse_feed(RSS)
    assert len(items) == 1  # the item without a link is dropped
    assert items[0].title == "Sample notice A" and items[0].published == date(2026, 11, 16)
    assert items[0].attachment_url == "https://www.aiub.edu/files/a.pdf"
    a = parse_feed(ATOM)
    assert a[0].url == "https://www.aiub.edu/atom-1" and a[0].published == date(2026, 11, 17)


def test_rss_rejects_bad_xml_and_entity_bombs():
    with pytest.raises(SourceError):
        parse_feed("<rss><oops")
    bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><rss><channel><item><title>&b;</title><link>https://www.aiub.edu/z</link></item></channel></rss>'
    with pytest.raises(SourceError):
        parse_feed(bomb)


def test_json_mapping():
    data = {"data": {"notices": [{"headline": "J1", "href": "https://www.aiub.edu/j1", "when": "2026-11-18"}, {"headline": "bad"}]}}
    out = parse_items(data, "data.notices", {"title": "headline", "url": "href", "published": "when"})
    assert [(o.title, o.published) for o in out] == [("J1", date(2026, 11, 18))]
    with pytest.raises(SourceError):
        parse_items(data, "data.missing", {})


def test_registry_builds_and_survives_bad_config():
    raw = json.dumps([{"type": "rss", "name": "feed", "url": "https://example.org/f.xml"}, {"type": "nope"}, {"type": "email"}])
    names = [s.name for s in load_sources(raw)]
    assert names == ["feed", "email"]
    assert load_sources("not json") == []


def test_feed_source_refuses_plain_http_and_unverifiable_robots(monkeypatch):
    from app.notice_sources.rss import RssSource
    with pytest.raises(SourceError):
        RssSource("x", "http://example.org/f.xml").fetch()
    monkeypatch.setattr("app.notice_sources.http.robots_allows", lambda url: False)
    with pytest.raises(SourceError) as e:
        RssSource("x", "https://example.org/f.xml").fetch()
    assert "robots" in str(e.value)


# ---------- the cycle ----------
def test_cycle_saves_new_dedupes_and_skips_unofficial_links(client):
    u = uniq("cycle")
    items = [RawNotice("Cycle notice one", u, date(2026, 11, 20)),
             RawNotice("Cycle notice one", u + "?utm_campaign=x", date(2026, 11, 20)),   # same page, tracking param
             RawNotice("Elsewhere", "https://evil.example.com/a")]
    r1 = ingest.run_cycle([FakeSource("fake1", items)], notify=False)["runs"][0]
    assert (r1["status"], r1["found"], r1["new"]) == ("ok", 3, 1)
    assert "skipped" in r1["error"]
    r2 = ingest.run_cycle([FakeSource("fake1", items)], notify=False)["runs"][0]
    assert r2["new"] == 0  # nothing new the second time


def test_www_and_bare_host_are_one_notice(client):
    path = f"/t/www-{id(object())}"
    ingest.run_cycle([FakeSource("w1", [RawNotice("WWW twin notice", "https://www.aiub.edu" + path, date(2026, 11, 26))])], notify=False)
    r = ingest.run_cycle([FakeSource("w2", [RawNotice("WWW twin notice", "https://aiub.edu" + path)])], notify=False)["runs"][0]
    assert r["new"] == 0


def test_same_title_and_date_with_new_link_is_a_duplicate(client):
    d = date(2026, 11, 21)
    ingest.run_cycle([FakeSource("a", [RawNotice("Hash dedupe notice", uniq("h1"), d)])], notify=False)
    r = ingest.run_cycle([FakeSource("b", [RawNotice("Hash dedupe notice", uniq("h2"), d)])], notify=False)["runs"][0]
    assert r["new"] == 0


def test_one_failing_source_does_not_stop_the_others(client):
    runs = ingest.run_cycle([FakeSource("broken", error=SourceError("HTTP 503")),
                             FakeSource("crashy", error=RuntimeError("boom")),
                             FakeSource("fine", [RawNotice("Fine notice", uniq("fine"), date(2026, 11, 22))])], notify=False)["runs"]
    assert [(r["source"], r["status"]) for r in runs] == [("broken", "error"), ("crashy", "error"), ("fine", "ok")]
    assert runs[0]["error"] == "HTTP 503" and "boom" in runs[1]["error"] and runs[2]["new"] == 1
    db = SessionLocal()
    assert db.query(IngestRun).filter(IngestRun.source == "broken", IngestRun.status == "error").count() >= 1
    db.close()


def test_two_cycles_cannot_overlap(client):
    with ingest.cycle_lock() as got:
        assert got
        again = ingest.run_cycle([FakeSource("x", [RawNotice("Never saved", uniq("lock"))])], notify=False)
    assert again["ran"] is False and again["runs"] == []


def test_no_sources_is_a_calm_no_op(client):
    r = ingest.run_cycle([], notify=False)
    assert r["ran"] is True and r["reason"] == "no sources configured"


def test_dry_run_saves_nothing(client):
    u = uniq("dry")
    out = ingest.dry_run(FakeSource("d", [RawNotice("Dry run notice", u), RawNotice("Off", "https://evil.example.com")]))
    assert out["count"] == 2 and out["new"] == 1 and out["items"][1]["official_link"] is False
    db = SessionLocal()
    assert db.query(Notice).filter(Notice.url == canonical_url(u)).count() == 0
    db.close()


def test_scheduler_loop_runs_a_cycle(client, monkeypatch):
    from app import scheduler
    u = uniq("sched")
    monkeypatch.setattr(ingest, "load_sources", lambda raw=None: [FakeSource("sched", [RawNotice("Scheduled notice", u, date(2026, 11, 23))])])
    monkeypatch.setattr(push, "enabled", lambda: False)

    async def go():
        t = asyncio.create_task(scheduler.scheduler_loop(interval=3600))
        await asyncio.sleep(0.6)
        t.cancel()
    asyncio.run(go())
    db = SessionLocal()
    assert db.query(Notice).filter(Notice.url == canonical_url(u)).count() == 1
    db.close()


# ---------- email parsing ----------
def test_email_parsing_rules(monkeypatch):
    monkeypatch.setattr(config, "INBOUND_SENDER_ALLOWLIST", ["aiub.edu", "registrar@example.org"])
    ok = parse_email({"from": "Registrar <registrar@aiub.edu>", "subject": "Fwd: [AIUB] Final exam schedule",
                      "text": "Details: https://www.aiub.edu/final-exam-schedule?utm_source=mail and https://www.aiub.edu/files/sched.pdf.",
                      "date": "Tue, 17 Nov 2026 10:00:00 +0600"})
    assert ok.status == "accepted" and ok.title == "Final exam schedule"
    assert ok.url == "https://www.aiub.edu/final-exam-schedule" and ok.attachment_url == "https://www.aiub.edu/files/sched.pdf"
    assert ok.published == date(2026, 11, 17)
    assert parse_email({"from": "x@gmail.com", "subject": "Hello there", "text": "https://www.aiub.edu/a"}).status == "quarantined"
    no_link = parse_email({"from": "a@aiub.edu", "subject": "No link here", "text": "see https://evil.example.com/x"})
    assert no_link.status == "quarantined" and "official page" in no_link.reason
    assert parse_email({"from": "a@aiub.edu.evil.com", "subject": "Spoof", "text": "https://www.aiub.edu/a"}).status == "quarantined"
    html = parse_email({"from": "a@aiub.edu", "subject": "HTML mail", "html": "<p>Open <a href='https://www.aiub.edu/h'>notice</a></p>", "links": ["https://www.aiub.edu/h"]})
    assert html.status == "accepted"
    monkeypatch.setattr(config, "INBOUND_AUTO_PUBLISH", False)
    assert parse_email({"from": "a@aiub.edu", "subject": "Needs review", "text": "https://www.aiub.edu/r"}).reason.startswith("Waiting")
    assert clean_subject("RE: Fwd: [Notice] Hello") == "Hello"


# ---------- webhook, review, push ----------
@pytest.fixture
def mail_env(monkeypatch):
    monkeypatch.setattr(config, "INBOUND_EMAIL_SECRET", "hook-secret")
    monkeypatch.setattr(config, "INBOUND_SENDER_ALLOWLIST", ["aiub.edu"])
    monkeypatch.setattr(config, "INBOUND_AUTO_PUBLISH", True)
    monkeypatch.setattr(push, "enabled", lambda: False)


def post_mail(client, payload, secret="hook-secret"):
    return client.post("/api/inbound/email", json=payload, headers={"X-Inbound-Secret": secret})


def test_webhook_requires_secret(client, mail_env):
    assert post_mail(client, {"from": "a@aiub.edu", "subject": "x y z"}, secret="wrong").status_code == 401
    assert post_mail(client, {"from": "a@aiub.edu", "subject": "x y z"}, secret="").status_code == 401


def test_webhook_publishes_then_ignores_the_same_message(client, mail_env):
    u = uniq("mail")
    body = {"from": "records@aiub.edu", "subject": "Fwd: Convocation notice test", "text": f"Read {u}", "message_id": "<m-1@test>"}
    r = post_mail(client, body).json()
    assert r["status"] == "published" and r["notice_id"]
    assert post_mail(client, body).json()["status"] == "duplicate"
    items = client.get("/api/notices", params={"q": "Convocation notice test"}).json()["items"]
    assert items and items[0]["source"] == "email"


def test_quarantine_review_approve_and_reject(client, mail_env, auth):
    u = uniq("review")
    r = post_mail(client, {"from": "someone@gmail.com", "subject": "Unknown sender notice", "text": u, "message_id": "<m-2@test>"}).json()
    assert r["status"] == "quarantined"
    box = client.get("/api/admin/inbox", params={"status": "quarantined"}, headers=auth).json()["items"]
    eid = next(e["id"] for e in box if e["title"] == "Unknown sender notice")
    assert client.post(f"/api/admin/inbox/{eid}/approve", headers=auth).json()["notice_id"]
    # an email without any official link cannot be approved: admins verify, they do not author
    r2 = post_mail(client, {"from": "x@gmail.com", "subject": "No link at all", "text": "just words", "message_id": "<m-3@test>"}).json()
    assert r2["status"] == "quarantined"
    box = client.get("/api/admin/inbox", headers=auth).json()["items"]
    eid2 = next(e["id"] for e in box if e["title"] == "No link at all")
    assert client.post(f"/api/admin/inbox/{eid2}/approve", headers=auth).status_code == 422
    assert client.post(f"/api/admin/inbox/{eid2}/reject", headers=auth).json()["ok"]


def test_preview_email_saves_nothing(client, auth, mail_env):
    before = len(client.get("/api/admin/inbox", headers=auth).json()["items"])
    p = client.post("/api/admin/inbound/preview", headers=auth,
                    json={"from": "a@aiub.edu", "subject": "Preview only", "text": "https://www.aiub.edu/preview-only"}).json()
    assert p["status"] == "accepted" and p["url"].endswith("/preview-only")
    assert len(client.get("/api/admin/inbox", headers=auth).json()["items"]) == before


@pytest.fixture
def vapid(monkeypatch):
    monkeypatch.setattr(config, "VAPID_PUBLIC_KEY", "BPublicKeyForTests")
    monkeypatch.setattr(config, "VAPID_PRIVATE_KEY", "PrivateKeyForTests")
    sent = []

    def fake(sub, payload):
        if "gone" in sub["endpoint"]:
            raise push.Gone()
        if "flaky" in sub["endpoint"]:
            raise RuntimeError("push service down")
        sent.append((sub["endpoint"], payload))
    monkeypatch.setattr(push, "_send", fake)
    return sent


def subscribe(client, name, tags=None):
    return client.post("/api/push/subscribe", json={"endpoint": f"https://push.example/{name}-{id(name)}" if False else f"https://push.example/{name}",
                                                       "keys": {"p256dh": "k" * 20, "auth": "a" * 10}, "tags": tags or []})


def test_push_subscribe_unsubscribe_status(client, vapid):
    assert client.get("/api/push/key").json()["enabled"] is True
    ep = "https://push.example/life"
    assert subscribe(client, "life").status_code == 200
    assert client.post("/api/push/status", json={"endpoint": ep}).json()["subscribed"] is True
    assert subscribe(client, "life", ["Exam"]).json()["tags"] == ["Exam"]   # re-subscribing updates, not duplicates
    client.post("/api/push/unsubscribe", json={"endpoint": ep})
    assert client.post("/api/push/status", json={"endpoint": ep}).json()["subscribed"] is False
    assert client.post("/api/push/subscribe", json={"endpoint": "http://insecure.example/x" + "y" * 10, "keys": {"p256dh": "k", "auth": "a"}}).status_code == 422


def test_push_not_configured_is_refused_politely(client, monkeypatch):
    monkeypatch.setattr(config, "VAPID_PUBLIC_KEY", "")
    assert client.post("/api/push/subscribe", json={"endpoint": "https://push.example/none" + "x" * 10, "keys": {"p256dh": "k", "auth": "a"}}).status_code == 503


def test_new_notice_pushes_once_to_matching_subscribers_and_cleans_up(client, vapid):
    db = SessionLocal()
    db.query(PushSubscription).delete()
    db.commit()
    subscribe(client, "all-notices")
    subscribe(client, "exam-only", ["Exam"])
    subscribe(client, "holiday-only", ["Holiday"])
    subscribe(client, "gone-device")
    subscribe(client, "flaky-device")
    u = uniq("push")
    run = ingest.run_cycle([FakeSource("p", [RawNotice("Midterm exam routine for push test", u, date(2026, 11, 24))])])["runs"][0]
    assert run["new"] == 1
    endpoints = sorted(e for e, _ in vapid)
    assert endpoints == ["https://push.example/all-notices", "https://push.example/exam-only"]  # holiday-only filtered out
    assert vapid[0][1]["body"] == "Midterm exam routine for push test" and "/notices#n" in vapid[0][1]["url"]
    n = db.query(Notice).filter(Notice.url == canonical_url(u)).one()
    log = db.query(NotificationLog).filter(NotificationLog.notice_id == n.id).one()
    assert (log.recipients, log.delivered, log.failed, log.removed) == (4, 2, 1, 1)
    gone = db.query(PushSubscription).filter(PushSubscription.endpoint.like("%gone-device")).one()
    assert gone.active is False  # the browser said it is gone
    # running the same notice again never pushes a second time
    vapid.clear()
    assert push.notify_new(db, [n]) == []
    assert ingest.run_cycle([FakeSource("p", [RawNotice("Midterm exam routine for push test", u, date(2026, 11, 24))])])["runs"][0]["new"] == 0
    assert vapid == []
    db.close()


def test_push_failures_do_not_lose_the_notice(client, vapid, monkeypatch):
    def boom(db, notices):
        raise RuntimeError("push exploded")
    monkeypatch.setattr(push, "notify_new", boom)
    u = uniq("safe")
    run = ingest.run_cycle([FakeSource("s", [RawNotice("Saved even if push fails", u, date(2026, 11, 25))])])["runs"][0]
    assert run["status"] == "ok" and run["new"] == 1
    db = SessionLocal()
    assert db.query(Notice).filter(Notice.url == canonical_url(u)).count() == 1
    db.close()


def test_real_vapid_key_signs(client):
    """The key format our generator prints really works with the push library (no network involved)."""
    import subprocess, sys
    from py_vapid import Vapid
    out = subprocess.run([sys.executable, "-m", "app.tools.vapid"], capture_output=True, text=True, check=True).stdout
    priv = next(l.split("=", 1)[1] for l in out.splitlines() if l.startswith("VAPID_PRIVATE_KEY="))
    headers = Vapid.from_string(priv).sign({"sub": "mailto:a@example.com", "aud": "https://push.example"})
    assert "Authorization" in headers and headers["Authorization"].startswith("vapid ")


# ---------- admin screens ----------
def test_admin_pipeline_endpoints_need_login_and_report(client, auth, vapid):
    for path in ("/api/admin/pipeline", "/api/admin/runs", "/api/admin/inbox", "/api/admin/notifications", "/api/admin/subscriptions"):
        assert client.get(path).status_code in (401, 403)
    p = client.get("/api/admin/pipeline", headers=auth).json()
    assert p["push_enabled"] is True and p["sources"] == [] and p["link_domains"] == ["aiub.edu"]
    assert client.get("/api/admin/runs", headers=auth).json()["items"]
    assert "title" in client.get("/api/admin/notifications", headers=auth).json()["items"][0]
    assert client.get("/api/admin/subscriptions", headers=auth).json()["total"] >= 1
    assert client.post("/api/admin/sources/nothing/test", headers=auth).status_code == 404
    assert client.post("/api/admin/run-now", headers=auth).json()["reason"] == "no sources configured"


def test_cron_endpoint_needs_its_secret(client, monkeypatch):
    assert client.post("/api/internal/run-cycle").status_code == 401  # secret not configured: closed
    monkeypatch.setattr(config, "CRON_SECRET", "cron-secret")
    assert client.post("/api/internal/run-cycle", headers={"X-Cron-Secret": "nope"}).status_code == 401
    assert client.post("/api/internal/run-cycle", headers={"X-Cron-Secret": "cron-secret"}).json()["ran"] is True


def test_source_test_endpoint_is_a_dry_run(client, auth, monkeypatch):
    u = uniq("srctest")
    from app.api import admin_notices
    monkeypatch.setattr(admin_notices, "load_sources", lambda: [FakeSource("demo-src", [RawNotice("Tested source notice", u)])])
    r = client.post("/api/admin/sources/demo-src/test", headers=auth).json()
    assert r["ok"] and r["new"] == 1
    assert client.get("/api/notices", params={"q": "Tested source notice"}).json()["items"] == []
    monkeypatch.setattr(admin_notices, "load_sources", lambda: [FakeSource("bad", error=SourceError("HTTP 500"))])
    assert client.post("/api/admin/sources/bad/test", headers=auth).json() == {"ok": False, "error": "HTTP 500"}


def test_html_list_parses_rows_and_skips_pagination():
    from app.notice_sources.html_list import parse_list
    html = '''<a href="/category/notices?pageNo=2&pageSize=20">2</a>
    <a href="/holiday-notice-x">04 Nov 2026 Holiday Notice: National Day</a>
    <a href="https://evil.example/x">05 Nov 2026 Off-site link</a>
    <a href="/mid-term">09 Nov 2026 Mid Term Exam ... Department of EEE</a><a href="/about">About</a>'''
    items = parse_list(html, "https://www.aiub.edu/category/notices")
    assert [i.url for i in items] == ["https://www.aiub.edu/holiday-notice-x", "https://www.aiub.edu/mid-term"]
    assert str(items[0].published) == "2026-11-04" and items[0].title.startswith("Holiday Notice")
