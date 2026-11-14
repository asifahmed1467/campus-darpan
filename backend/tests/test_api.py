import json

SUN_1030 = "2026-11-15T10:30"   # Sunday
SAT_NOON = "2026-11-14T12:00"   # Saturday (weekend)


def names(r):
    return [i["name"] for i in r.json()["items"]]


def test_autocomplete_ny_finds_nyme_ahmed(client):
    r = client.get("/api/search/suggest", params={"q": "Ny", "at": SUN_1030})
    assert r.status_code == 200
    assert r.json()["items"][0]["name"] == "Nyme Ahmed"


def test_autocomplete_is_typo_tolerant_and_case_insensitive(client):
    assert names(client.get("/api/search/suggest", params={"q": "nime ahmd"}))[0] == "Nyme Ahmed"
    assert names(client.get("/api/search/suggest", params={"q": "IFTEKHAR"}))[0] == "Iftekhar Mahmud"
    assert names(client.get("/api/search/suggest", params={"q": "Dipta Gom"}))[0] == "Dipta Justin Gomes"


def test_autocomplete_searches_courses_and_empty_query(client):
    assert "Nyme Ahmed" in names(client.get("/api/search/suggest", params={"q": "OOP1"}))
    assert client.get("/api/search/suggest", params={"q": ""}).json()["items"] == []
    assert client.get("/api/search/suggest", params={"q": "zzzzzz"}).json()["items"] == []


def test_nyme_free_time_matches_his_tsf(client):
    fid = client.get("/api/search/suggest", params={"q": "Nyme"}).json()["items"][0]["id"]
    # Sunday 10:30 is inside his 10:20-12:40 consultation block
    r = client.get(f"/api/faculty/{fid}/next-free", params={"at": SUN_1030}).json()
    assert r["status"]["status"] == "available" and r["status"]["until"] == "12:40 PM"
    # Sunday 09:00 he is teaching OOP1; next consultation starts 10:20
    r = client.get(f"/api/faculty/{fid}/next-free", params={"at": "2026-11-15T09:00"}).json()
    assert r["status"]["status"] == "in_class" and r["status"]["next"]["start_label"] == "10:20 AM"
    # Thursday is his administrative hour
    r = client.get(f"/api/faculty/{fid}/next-free", params={"at": "2026-11-19T13:00"}).json()
    assert r["status"]["status"] == "admin"


def test_weekend_and_no_consultation_teacher(client):
    fid = client.get("/api/search/suggest", params={"q": "Farzan"}).json()["items"][0]["id"]
    r = client.get(f"/api/faculty/{fid}/next-free", params={"at": SAT_NOON}).json()
    assert r["status"]["status"] == "off" and r["status"]["next"]["day"] == "Sunday"
    r = client.get(f"/api/faculty/{fid}/next-free", params={"at": "2026-11-15T10:00"}).json()
    assert r["status"]["basis"] == "gap" and r["status"]["status"] == "available"


def test_holiday_makes_teacher_off(client):
    fid = client.get("/api/search/suggest", params={"q": "Iftekhar"}).json()["items"][0]["id"]
    r = client.get(f"/api/faculty/{fid}/next-free", params={"at": "2026-12-16T11:30"}).json()  # Victory Day (Wed)
    assert r["status"]["status"] == "off" and r["status"]["reason"] == "Victory Day"


def test_profile_has_weekly_grid(client):
    fid = client.get("/api/search/suggest", params={"q": "Iftekhar"}).json()["items"][0]["id"]
    p = client.get(f"/api/faculty/{fid}", params={"at": SUN_1030}).json()
    assert [d["day"] for d in p["week"]] == ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
    assert len(p["week"][0]["slots"]) == 5 and p["semester"] == "Fall 2026-27"
    assert client.get("/api/faculty/99999").status_code == 404


def test_list_filters(client):
    r = client.get("/api/faculty", params={"at": SUN_1030}).json()
    assert r["total"] == 5
    r = client.get("/api/faculty", params={"faculty": "FASS"}).json()
    assert [i["name"] for i in r["items"]] == ["Iftekhar Mahmud"]
    r = client.get("/api/faculty", params={"status": "available", "at": SUN_1030}).json()
    assert "Nyme Ahmed" in [i["name"] for i in r["items"]]


def test_ask_faculty_by_voice_like_question(client):
    r = client.post("/api/ask", json={"question": "When is Nyme sir free?", "at": SUN_1030}).json()
    assert r["mode"] == "faculty" and "Nyme Ahmed" in r["answer"] and "12:40 PM" in r["answer"]
    assert r["sources"][0]["url"].startswith("/faculty/")


def test_ask_unknown_says_not_found_and_never_invents(client):
    r = client.post("/api/ask", json={"question": "What is the scholarship criteria?"}).json()
    assert r["answered"] is False and r["sources"][0]["url"] == "https://www.aiub.edu/"


def test_ask_uses_documents_with_citation(client, auth):
    d = {"url": "https://www.aiub.edu/test-scholarship", "title": "Scholarship rules",
         "text": "Students with a CGPA of 3.80 or above are eligible for the merit scholarship every semester."}
    assert client.post("/api/admin/documents", json=d, headers=auth).status_code == 200
    r = client.post("/api/ask", json={"question": "Who is eligible for the merit scholarship?"}).json()
    assert r["mode"] == "docs" and r["sources"][0]["url"] == d["url"] and "3.80" in r["answer"]


def test_admin_endpoints_require_login(client):
    assert client.get("/api/admin/me").status_code == 401
    assert client.post("/api/admin/tsf/preview", json={"format": "json", "content": "{}"}).status_code == 401
    assert client.post("/api/admin/login", json={"username": "asif", "password": "nope"}).status_code == 401


def test_tsf_preview_reports_clear_errors(client, auth):
    bad = {"semester": "Fall 2026-27", "faculty": [{"name": "Nyme Ahmed", "slots": [
        {"day": "SUN", "start": "08:00", "end": "09:30", "type": "CLASS", "course": "A"},
        {"day": "SUN", "start": "09:00", "end": "10:00", "type": "CLASS", "course": "B"},
        {"day": "XXX", "start": "08:00", "end": "09:00", "type": "CLASS"},
        {"day": "MON", "start": "9am", "end": "10:00", "type": "CLASS"},
        {"day": "TUE", "start": "10:00", "end": "09:00", "type": "CLASS"}]}]}
    r = client.post("/api/admin/tsf/preview", json={"format": "json", "content": json.dumps(bad)}, headers=auth).json()
    assert r["ok"] is False
    errs = " | ".join(r["teachers"][0]["errors"])
    assert "overlaps" in errs and "day must be" in errs and "start/end must look like" in errs and "must be before end" in errs
    assert client.post("/api/admin/tsf/confirm", json={"format": "json", "content": json.dumps(bad)}, headers=auth).status_code == 422
    assert client.post("/api/admin/tsf/preview", json={"format": "json", "content": "{nope"}, headers=auth).json()["errors"][0].startswith("Not valid JSON")


def test_tsf_upload_one_by_one_adds_new_teacher_and_replaces_existing(client, auth):
    one = {"semester": "Fall 2026-27", "faculty_email": "test.teacher@aiub.edu", "name": "Dr. Test TEACHER",
           "faculty_code": "FST", "slots": [
               {"day": "SUN", "start": "10:00", "end": "11:30", "type": "CONSULTATION", "room": "D-0510"}]}
    r = client.post("/api/admin/tsf/confirm", json={"format": "json", "content": json.dumps(one)}, headers=auth)
    assert r.status_code == 200 and r.json()["applied"][0]["slots"] == 1
    hit = client.get("/api/search/suggest", params={"q": "test te", "at": "2026-11-15T10:30"}).json()["items"][0]
    assert hit["name"] == "Dr. Test TEACHER" and hit["status"] == "available"
    # re-upload replaces, other teachers untouched
    one["slots"] = [{"day": "MON", "start": "10:00", "end": "11:30", "type": "CONSULTATION"}]
    client.post("/api/admin/tsf/confirm", json={"format": "json", "content": json.dumps(one)}, headers=auth)
    assert client.get("/api/search/suggest", params={"q": "test te", "at": "2026-11-15T10:30"}).json()["items"][0]["status"] != "available"
    assert client.get("/api/faculty").json()["total"] >= 6
    miss = client.get("/api/admin/faculty/missing-tsf", headers=auth).json()
    assert all(i["name"] != "Dr. Test TEACHER" for i in miss["items"])


def test_csv_upload(client, auth):
    csv_text = ("faculty_name,faculty_email,day,start,end,type,course,section,room\n"
                "CSV Person,csv.person@aiub.edu,SUN,08:00,09:30,CLASS,CSE 1101,A,1101\n"
                "CSV Person,csv.person@aiub.edu,SUN,09:30,11:00,CONSULTATION,,,\n")
    r = client.post("/api/admin/tsf/confirm", json={"format": "csv", "content": csv_text, "semester": "Fall 2026-27"}, headers=auth)
    assert r.status_code == 200, r.text
    assert client.get("/api/search/suggest", params={"q": "csv per"}).json()["items"][0]["name"] == "CSV Person"


def test_faculty_directory_import(client, auth):
    csv_text = "name,email,faculty_code,department,room\nNew Prof,new.prof@aiub.edu,FBA,Finance,4102\nNyme Ahmed,,FST,CS,D-0510\n"
    r = client.post("/api/admin/faculty/import", json={"format": "csv", "content": csv_text}, headers=auth).json()
    assert r["created"] == 1 and r["updated"] == 1
    p = client.get("/api/search/suggest", params={"q": "nyme"}).json()["items"][0]
    assert p["room"] == "D-0510" and p["faculty_code"] == "FST"


def test_presence_counter_is_anonymous(client, auth):
    assert client.post("/api/presence/heartbeat", json={"vid": "abc12345"}).json()["online"] == 1
    client.post("/api/presence/heartbeat", json={"vid": "abc12345"})
    assert client.post("/api/presence/heartbeat", json={"vid": "xyz98765"}).json()["online"] == 2
    assert client.post("/api/presence/heartbeat", json={"vid": "bad id!"}).status_code == 422
    from app.services.realtime import presence
    presence.flush()
    a = client.get("/api/admin/analytics", headers=auth).json()
    assert a["online_now"] == 2 and a["unique_today"] == 2


def test_notices_listing_tags_and_admin_add(client, auth):
    r = client.get("/api/notices").json()
    assert len(r["items"]) == 3 and all("DEMO" in n["title"] for n in r["items"][:3])
    n = {"title": "Midterm exam routine published", "url": "https://www.aiub.edu/x-1", "published_date": "2026-11-13"}
    assert client.post("/api/admin/notices", json=n, headers=auth).json()["created"] is True
    assert client.post("/api/admin/notices", json=n, headers=auth).json()["created"] is False  # same URL, no duplicate
    items = client.get("/api/notices", params={"tag": "Exam"}).json()["items"]
    assert items[0]["title"].startswith("Midterm") and "Exam" in items[0]["tags"]


def test_rooms_placeholder_and_meta(client):
    assert client.get("/api/rooms", params={"q": "D-0302"}).json()["coming_soon"] is True
    m = client.get("/api/meta", params={"at": SAT_NOON}).json()
    assert m["semester"] == "Fall 2026-27" and "Victory Day" in [h["name"] for h in m["upcoming_holidays"]]


def test_rate_limits_are_per_device_not_per_ip(client):
    # 30 different students behind the same campus IP are all fine ...
    for i in range(30):
        assert client.post("/api/presence/heartbeat", json={"vid": f"campus{i:05d}"}).status_code == 200
    # ... but one device hammering gets slowed down
    codes = [client.post("/api/presence/heartbeat", json={"vid": "spammer01"}).status_code for _ in range(12)]
    codes += [client.post("/api/presence/heartbeat", json={"vid": "spammer01"}).status_code for _ in range(12)]
    assert codes[:20] == [200] * 20 and 429 in codes[20:]
    for i in range(3):  # Ask limit is per device too
        assert client.post("/api/ask", json={"question": "hello there"}, headers={"x-visitor": f"asker{i:05d}"}).status_code == 200


def test_cdn_cache_headers(client):
    r = client.get("/api/search/suggest", params={"q": "Ny"})
    assert "max-age=15" in r.headers["cache-control"]
    assert "cache-control" not in client.get("/api/search/suggest", params={"q": "Ny", "at": "2026-11-15T10:30"}).headers
    assert "cache-control" not in client.get("/api/health").headers
    assert "cache-control" not in client.get("/api/presence/count").headers
