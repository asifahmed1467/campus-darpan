from datetime import date, datetime

from app.services.free_time import Schedule, Slot, compute_status, describe
from app.services.timeutil import TZ

SUN, MON, TUE, WED, THU, FRI, SAT = range(7)


def at(y, mo, d, h, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=TZ)


def t(h, m=0):
    return h * 60 + m


# 2026-11-15 is a Sunday, 2026-11-14 a Saturday
def iftekhar():
    return Schedule([
        Slot(SUN, t(8), t(9, 30), "CLASS", "BC", "E", "DS0803"),
        Slot(SUN, t(11, 10), t(13), "CONSULTATION"),
        Slot(SUN, t(13), t(14, 30), "CLASS", "TLAS", "A", "6212"),
        Slot(SUN, t(14, 30), t(16, 15), "CONSULTATION"),
        Slot(MON, t(8), t(9, 30), "CLASS", "EWS&C", "D", "DS0703"),
        Slot(THU, t(8), t(13, 40), "CONSULTATION"),
    ], default_room="5101")


def no_consult():
    return Schedule([
        Slot(SUN, t(9, 40), t(11, 10), "CLASS", "CVAPR", "I", "3207"),
        Slot(SUN, t(13), t(14, 30), "CLASS", "EIDS&E", "B"),
    ])


def test_available_inside_consultation():
    st = compute_status(iftekhar(), at(2026, 11, 15, 11, 30))
    assert st["status"] == "available" and st["basis"] == "consultation"
    assert st["until"] == "1:00 PM" and st["minutes_left"] == 90
    assert st["room"] == "5101"  # falls back to the teacher's default room


def test_in_class_reports_next_consultation():
    st = compute_status(iftekhar(), at(2026, 11, 15, 8, 30))
    assert st["status"] == "in_class" and st["current"]["course"] == "BC"
    assert st["until"] == "9:30 AM"
    assert st["next"]["start_label"] == "11:10 AM" and st["next"]["minutes_until"] == 160
    assert st["next"]["when"] == "today at 11:10 AM"


def test_between_blocks_is_unavailable_with_next():
    st = compute_status(iftekhar(), at(2026, 11, 15, 10, 0))
    assert st["status"] == "unavailable"
    assert st["next"]["start_label"] == "11:10 AM"


def test_end_boundary_is_exclusive_and_start_inclusive():
    assert compute_status(iftekhar(), at(2026, 11, 15, 9, 30))["status"] == "unavailable"
    assert compute_status(iftekhar(), at(2026, 11, 15, 11, 10))["status"] == "available"
    assert compute_status(iftekhar(), at(2026, 11, 15, 13, 0))["status"] == "in_class"


def test_after_hours_rolls_to_next_working_day():
    st = compute_status(iftekhar(), at(2026, 11, 15, 17, 0))
    assert st["status"] == "unavailable"
    # Monday has no consultation, Tuesday/Wed none, Thursday 8:00 is next
    assert st["next"]["day"] == "Thursday" and st["next"]["start_label"] == "8:00 AM"


def test_saturday_is_off_and_points_to_sunday():
    st = compute_status(iftekhar(), at(2026, 11, 14, 12, 0))
    assert st["status"] == "off" and st["reason"] == "Weekend"
    assert st["next"]["day"] == "Sunday" and st["next"]["when"] == "tomorrow at 11:10 AM"


def test_holiday_is_off_even_on_a_working_day():
    hol = {date(2026, 11, 15): "Test holiday"}
    st = compute_status(iftekhar(), at(2026, 11, 15, 11, 30), hol)
    assert st["status"] == "off" and st["reason"] == "Test holiday"
    assert st["next"]["day"] == "Thursday"


def test_no_schedule():
    assert compute_status(None, at(2026, 11, 15, 10))["status"] == "no_schedule"
    assert compute_status(Schedule([]), at(2026, 11, 15, 10))["status"] == "no_schedule"


def test_outside_semester_dates():
    st = compute_status(iftekhar(), at(2026, 8, 2, 11), sem_start=date(2026, 9, 27), sem_end=date(2027, 1, 3))
    assert st["status"] == "no_schedule"
    st = compute_status(iftekhar(), at(2027, 2, 1, 11), sem_start=date(2026, 9, 27), sem_end=date(2027, 1, 3))
    assert st["status"] == "no_schedule"


def test_gap_basis_when_no_consultation_hours():
    s = no_consult()
    st = compute_status(s, at(2026, 11, 15, 12, 0))  # between the two classes
    assert st["status"] == "available" and st["basis"] == "gap"
    assert st["until"] == "1:00 PM"
    st = compute_status(s, at(2026, 11, 15, 10, 0))
    assert st["status"] == "in_class"


def test_gap_basis_ignores_days_without_any_block():
    # Monday has no blocks -> teacher is not assumed on campus
    st = compute_status(no_consult(), at(2026, 11, 16, 12, 0))
    assert st["status"] == "off"
    assert st["next"]["day"] == "Sunday" or st["next"]["date"] > "2026-11-16"


def test_adjacent_blocks_merge_for_in_class_until():
    s = Schedule([Slot(SUN, t(8), t(9), "CLASS", "A"), Slot(SUN, t(9), t(10, 30), "CLASS", "B")])
    st = compute_status(s, at(2026, 11, 15, 8, 30))
    assert st["until"] == "10:30 AM"


def test_next_never_skips_beyond_semester_end():
    st = compute_status(iftekhar(), at(2027, 1, 3, 17, 30), sem_end=date(2027, 1, 3))
    assert st["next"] is None


def test_describe_sentences():
    s = iftekhar()
    assert "consultation hours now, until 1:00 PM" in describe("Iftekhar Mahmud", compute_status(s, at(2026, 11, 15, 11, 30)))
    assert "in class (BC E) until 9:30 AM" in describe("Iftekhar Mahmud", compute_status(s, at(2026, 11, 15, 9, 0)))
    assert "Next available tomorrow" in describe("Iftekhar Mahmud", compute_status(s, at(2026, 11, 14, 12)))
    assert "not available yet" in describe("X", compute_status(None, at(2026, 11, 15, 10)))
