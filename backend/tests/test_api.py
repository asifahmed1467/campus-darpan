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
    r = client.post("/api/ask", json={"question": "What is the cafeteria menu today?"}).json()
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
    # the consultation room becomes the teacher's office room automatically
    prof = client.get(f"/api/faculty/{hit['id']}").json()
    assert prof["room"] == "D-0510"
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


def test_notices_listing_tags_and_no_manual_posting(client, auth):
    from app.db import SessionLocal
    from app.services.notices import ingest_notice
    from datetime import date
    r = client.get("/api/notices").json()
    assert len(r["items"]) == 3 and all("DEMO" in n["title"] for n in r["items"][:3])
    # admins can no longer post notices by hand
    n = {"title": "Midterm exam routine published", "url": "https://www.aiub.edu/x-1"}
    assert client.post("/api/admin/notices", json=n, headers=auth).status_code in (404, 405)
    db = SessionLocal()
    assert ingest_notice(db, n["title"], n["url"], date(2026, 11, 13), source="test")[1] is True
    assert ingest_notice(db, n["title"], n["url"], date(2026, 11, 13), source="test")[1] is False  # same link, no duplicate
    db.close()
    items = client.get("/api/notices", params={"tag": "Exam"}).json()["items"]
    assert items[0]["title"].startswith("Midterm") and "Exam" in items[0]["tags"]


def test_rooms_placeholder_and_meta(client):
    assert client.get("/api/rooms", params={"q": "D-0302"}).json()["result"]["building"] == "D"
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


def test_directory_import_keeps_same_named_people_apart_and_tidies_caps(client, auth):
    csv_text = ('name,email,faculty_code,designation\n'
                '"MEHEDI HASAN","mehedi@aiub.edu","FE","SENIOR ASSISTANT PROFESSOR, Faculty"\n'
                '"MEHEDI HASAN","mehedi.hasan@aiub.edu","FST","ASSISTANT PROFESSOR, Faculty"\n'
                '"DR. MD. ANWARUL KABIR","kabir@aiub.edu","FST","ASSOCIATE PROFESSOR, Faculty"\n')
    r = client.post("/api/admin/faculty/import", json={"format": "csv", "content": csv_text}, headers=auth).json()
    assert r["created"] == 3 and r["updated"] == 0
    again = client.post("/api/admin/faculty/import", json={"format": "csv", "content": csv_text}, headers=auth).json()
    assert again["created"] == 0 and again["updated"] == 3
    items = client.get("/api/search/suggest", params={"q": "mehedi"}).json()["items"]
    assert len(items) == 2
    k = client.get("/api/search/suggest", params={"q": "anwarul"}).json()["items"][0]
    assert k["name"] == "Dr. Md. Anwarul Kabir"


def by_floor_ok(r):
    return r["ok"] and r["room"] is None


def test_room_codes_decode(client):
    from app.services.campus import parse_room
    r = parse_room("9204")
    assert (r["building"], r["floor"], r["room"]) == ("A9", 2, "04") and r["message"] == "Annex 9, 2nd floor, room 04." and r["warning"] is None
    assert parse_room(" 9-2 04 ")["room"] == "04"                      # spaces and dashes are ignored
    assert parse_room("1005")["floor_label"] == "Ground floor"           # floor 0
    assert parse_room("9805")["warning"].startswith("Annex 9 has floors up to 5")   # ground + 5 floors (the faculty list has rooms on floor 5)
    assert parse_room("8101")["ok"] is False and "Annex 8" in parse_room("8101")["message"]
    assert parse_room("7101")["building"] == "A7"                        # Annex 7 = Architecture building
    d = parse_room("D-0302")
    assert d["ok"] and d["building"] == "D" and d["floor"] is None       # D format not added yet: building only
    n, so, e = parse_room("DN03"), parse_room("ds-03"), parse_room("DE204")
    assert (n["wing"], n["room"], n["floor"]) == ("North side", "03", None)
    assert (so["wing"], so["room"]) == ("South side", "03")
    assert (e["wing"], e["floor"], e["room"]) == ("Extension", 2, "04") and e["message"] == "D Building, Extension, 2nd floor, room 04."
    assert e["warning"] is None and parse_room("DE804")["warning"].startswith("The D building Extension exists only")
    a, b2, c = parse_room("DS101"), parse_room("DN107"), parse_room("DN102")
    assert (a["wing"], a["floor"], a["room"], a["kind"], a["warning"]) == ("South side", 1, "01", "Lab", None)
    assert a["message"] == "D Building, South side, 1st floor, room 01 (lab)." and (b2["room"], b2["floor"], b2["warning"]) == ("07", 1, None)
    assert "probably DS102" in c["warning"] and parse_room("DS313")["warning"].startswith("D building floors 1 to 3 have rooms 01 to 12")
    g, up = parse_room("DS001"), parse_room("DN507")
    assert g["room"] is None and "No classrooms on the ground floor" in g["warning"]
    assert up["room"] is None and up["floor"] == 5 and "not decided yet" in up["warning"] and up.get("kind") is None
    assert parse_room("DS909")["floor"] == 9 and by_floor_ok(parse_room("DS909"))
    g = parse_room("DNGA05"); assert (g["room"], g["section"], g["floor"], g["wing"]) == ("05", "A", 0, "North side")   # ground floor, section A
    seat = parse_room("9210e")                                            # a seat letter after the room: 9210E = room 10, seat E
    assert seat["room"] == "10" and seat["seat"] == "E" and seat["floor"] == 2 and seat["warning"] is None
    wing = parse_room("42C06")                                            # Annex 4 sections: 42C06 = 2nd floor, section C, room 06
    assert wing["building"] == "A4" and wing["floor"] == 2 and wing["section"] == "C" and wing["room"] == "06"
    assert parse_room("hello")["ok"] is False and parse_room("") is None and parse_room(None) is None


def test_campus_and_room_endpoints(client):
    c = client.get("/api/campus").json()
    ids = [b["id"] for b in c["buildings"]]
    assert ids == ["D", "C", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A9"]
    by = {b["id"]: b for b in c["buildings"]}
    assert by["D"]["levels"] == 10 and len(by["D"]["floors"]) == 10 and by["D"]["floors"][0]["label"] == "Ground floor"
    assert by["A9"]["levels"] == 6 and by["A1"]["levels"] == 1 and by["A3"]["levels"] is None and by["A3"]["floors"] == []
    assert by["C"]["places"] == []
    r = client.get("/api/rooms", params={"q": "9204"}).json()
    assert r["result"]["building"] == "A9" and r["message"].startswith("Annex 9, 2nd floor")
    assert client.get("/api/rooms").json()["result"] is None


def test_faculty_profile_carries_decoded_room(client, auth):
    csv_text = "name,email,room\nRoom Decode Prof,room.decode@aiub.edu,9204\n"
    client.post("/api/admin/faculty/import", json={"format": "csv", "content": csv_text}, headers=auth)
    fid = client.get("/api/search/suggest", params={"q": "Room Decode"}).json()["items"][0]["id"]
    info = client.get(f"/api/faculty/{fid}").json()["room_info"]
    assert info["building"] == "A9" and info["floor"] == 2 and info["room"] == "04"


def test_ask_sample_questions_are_answered_and_labelled(client):
    from app.services.sample_faq import SAMPLES
    from app.services.store import search_faq
    assert len(SAMPLES) >= 20 and all(row[5] for row in SAMPLES)
    for row in SAMPLES:                                     # every sample question finds its own answer
        assert search_faq(row[1]) is row, row[1]
    r = client.post("/api/ask", json={"question": "What CGPA do I need to graduate?"}).json()
    assert r["mode"] == "faq" and r["sample"] is True and "2.50" in r["answer"] and not r["answer"].startswith("Sample answer")
    assert r["sources"][0]["url"].startswith("https://aiub.edu/")
    r = client.post("/api/ask", json={"question": "how to add drop course"}).json()
    assert r["mode"] == "faq" and "VUES" in r["answer"]
    r = client.post("/api/ask", json={"question": "what does room 9204 mean"}).json()
    assert r["mode"] == "faq" and "Annex 9" in r["answer"] and r["sources"][0]["url"].startswith("/rooms")
    assert client.post("/api/ask", json={"question": "zzzz wombat spaceship"}).json()["answered"] is False


def test_ask_samples_endpoint(client):
    d = client.get("/api/ask/samples").json()
    assert d["count"] >= 20 and sum(len(t["questions"]) for t in d["topics"]) == d["count"]
    assert {t["topic"] for t in d["topics"]} >= {"About AIUB", "Admission", "Academics", "Registration", "Scholarships"}


def test_faculty_is_worked_out_from_department():
    from app.services.store import faculty_for
    assert faculty_for("Computer Science") == "FST"
    assert faculty_for("Electrical & Electronic Engineering") == "FE"
    assert faculty_for("Computer Engineering") == "FE"
    assert faculty_for("Marketing") == "FBA"
    assert faculty_for("Operations and Supply Chain Management") == "FBA"
    assert faculty_for("Law") == "FASS"
    assert faculty_for("Journalism and Mass Communication") == "FASS"
    assert faculty_for("Pharmacy") == "FHLS"
    assert faculty_for("Natural Science [Physics]") == "FST"
    assert faculty_for("") is None and faculty_for(None) is None


def test_d_building_four_digit_codes():
    from app.services.campus import parse_room
    r = parse_room("DN0921")
    assert r["ok"] and r["floor"] == 9 and r["room"] == "21" and r["wing"] == "North side" and not r["warning"]
    assert "North side, 9th floor, room 21" in r["message"]
    r = parse_room("DS0412")
    assert r["floor"] == 4 and r["wing"] == "South side" and "4th floor" in r["message"]
    assert parse_room("DN107")["floor"] == 1   # the three-digit lab codes still work


def test_today_helpers():
    from datetime import date, datetime
    from app.services import today as T
    d = date(2026, 11, 16)
    assert T.title_dates("Seat Plan of Mid-Term Exams of Fall 2026-27, [Except LLB & B PHARM] Day 7 : Nov 16, 2026 ( Monday )") == [d]
    assert T.title_dates("Holiday Notice: National Revolution and Solidarity Day Saturday 07 Nov 2026") == [date(2026, 11, 7)]
    dated, fresh = T.notice_lines([
        {"title": "Seat Plan of Mid-Term Exams of Fall 2026-27, [Except LLB & B PHARM] Day 7 : Nov 16, 2026 ( Monday )", "url": "u1", "date": date(2026, 11, 15)},
        {"title": "Seat Plan for Final-Term Exams of Fall 2025-26 [ Only for LLB and BPharm ] ,Day 3 : Nov 17, 2026", "url": "u2", "date": date(2026, 11, 16)},
        {"title": "BBA Set B Exam For Mid-term of Fall 2026-27", "url": "u3", "date": date(2026, 11, 15)},
        {"title": "Old notice", "url": "u4", "date": date(2026, 11, 1)},
    ], d)
    assert dated[0]["text"] == "Mid-term exams, day 7 today (all except LLB and B Pharm)"
    assert dated[1]["text"] == "Final-term exams, day 3 tomorrow (LLB and B Pharm only)"
    assert [f["url"] for f in fresh] == ["u3"]
    assert T.semester_week(date(2026, 9, 6), date(2026, 12, 20), d) == {"week": 11, "of": 16}
    hourly = {"time": [f"2026-11-16T{h:02d}:00" for h in range(24)],
              "precipitation_probability": [70 if h == 14 else 5 for h in range(24)], "temperature_2m": [28.0] * 24}
    w = T.weather_summary(hourly, datetime(2026, 11, 16, 9, 0))
    assert "2 PM" in w["text"] and w["rain"] == 70
    assert T.traffic_level(2400, 1200) == "heavy" and T.traffic_level(1700, 1200) == "slow" and T.traffic_level(1300, 1200) == "smooth"
    assert T.get_traffic() is None   # no key set, so no traffic section


def test_d_building_office_codes_with_desks_and_ground_floor():
    from app.services.campus import parse_room
    r = parse_room("DS0401A")
    assert (r["wing"], r["floor"], r["room"], r["seat"]) == ("South side", 4, "01", "A") and not r["warning"]
    assert r["message"] == "D Building, South side, 4th floor, room 01, desk A."
    r = parse_room("DN0927E")
    assert (r["floor"], r["room"], r["seat"]) == (9, "27", "E")
    r = parse_room("DNG09")
    assert (r["floor"], r["room"]) == (0, "09") and not r["warning"]
    r = parse_room("DNGA11")
    assert (r["floor"], r["room"], r["section"]) == (0, "11", "A")
    r = parse_room("DE0702B")
    assert (r["wing"], r["floor"], r["room"], r["seat"]) == ("Extension", 7, "02", "B")
    assert parse_room("DS101")["floor"] == 1 and parse_room("DN0921")["room"] == "21"


def test_voice_status_and_no_key():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    assert c.get("/api/voice/status").json()["server"] is False
    r = c.post("/api/voice/transcribe", files={"audio": ("a.webm", b"x" * 10, "audio/webm")}, data={"lang": "en"})
    assert r.status_code == 503


def test_ask_uses_ai_when_set_up(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.services import llm
    seen = {}
    monkeypatch.setattr(llm, "enabled", lambda: True)
    def fake(question, sources, history=None):
        seen["n"] = len(sources); seen["h"] = history
        return {"answer": "AIUB was founded in 1994 [2].", "used": [1], "model": "test"}
    monkeypatch.setattr(llm, "answer", fake)
    r = TestClient(app).post("/api/ask", json={"question": "When was AIUB founded?"}).json()
    assert r["mode"] == "ai" and r["ai"] and r["answered"] and r["answer"] == "AIUB was founded in 1994 [1]."
    assert seen["n"] >= 2 and len(r["sources"]) == 1 and r["general"] is False
    # a teacher question still uses the exact schedule, not the AI
    r = TestClient(app).post("/api/ask", json={"question": "When is Nyme Ahmed free?"}).json()
    assert r["mode"] == "faculty"
    # if the AI fails, the old answer is used
    r = TestClient(app).post("/api/ask", json={"question": "and the year it moved?", "history": [
        {"role": "user", "text": "When was AIUB founded?"}, {"role": "assistant", "text": "1994."}]}).json()
    assert r["mode"] == "ai" and seen["h"][0]["text"] == "When was AIUB founded?"
    monkeypatch.setattr(llm, "answer", lambda q, s, h=None: None)
    r = TestClient(app).post("/api/ask", json={"question": "When was AIUB founded?"}).json()
    assert r["mode"] in ("faq", "docs")



def test_question_words_do_not_match_teachers_by_email():
    from fastapi.testclient import TestClient
    from app.main import app
    r = TestClient(app).post("/api/ask", json={"question": "and who do I email if there is a problem?"}).json()
    assert r["mode"] != "faculty"
    assert TestClient(app).post("/api/ask", json={"question": "When is Nyme sir free?"}).json()["mode"] == "faculty"
