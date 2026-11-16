"""Campus buildings and room-code decoding. One place to change when the real numbers are confirmed.

Room codes for the Annex buildings: first digit = Annex number, second digit = floor, last two digits = room.
Example: 9204 = Annex 9, 2nd floor, room 04. Floor 0 is the ground floor.
D building, 1st to 3rd floor (labs only): D + N or S + floor + two digit room. DS101 = South side, 1st floor, room 01.
DN107 = North side, 1st floor, room 07. Rooms 01 to 06 are on the South side and 07 to 12 on the North side.
DE204 = Extension, 2nd floor, room 04 (the Extension exists on the 1st to 3rd floors only).
C building has no room format yet: its codes only resolve to the building."""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Building:
    id: str
    name: str
    short: str
    kind: str                 # tower / annex / admin
    levels: int | None        # floors counting the ground floor as one; None = not told yet
    note: str = ""
    places: tuple[str, ...] = ()
    formats: tuple[tuple[str, str], ...] = ()     # (example code, what it means)
    extension_floors: tuple[int, ...] = ()        # floors that have an Extension wing (D building)
    lab_floors: tuple[int, ...] = ()              # floors where the North and South side rooms are labs only (D building)
    pending_floors: tuple[int, ...] = ()          # floors whose room structure is not decided yet
    floor_notes: tuple[tuple[int, str], ...] = () # fixed notes for a floor, e.g. the ground floor


# levels count the ground floor as one. D building: ground floor plus the 1st to 9th floors = 10 levels (the 4th to 9th floors are named
# by the user but their room structure is not decided yet). Annex 9 is a 5 floor building: ground plus 4 (to be confirmed).
BUILDINGS: tuple[Building, ...] = (
    Building("D", "D Building", "D", "tower", 10, "Has a North side, a South side and an Extension. The Extension exists only on the 1st, 2nd and 3rd floors. On the 1st to 3rd floors the North and South side rooms are labs only. The ground floor has no classrooms (one auditorium and the waiting lobby). The room structure of the 4th to 9th floors is not decided yet. Joined to Annex 9 by two bridges on the 2nd and 3rd floors.",
             formats=(("DS101", "D building, South side, 1st floor, room 01 (lab)"), ("DN107", "D building, North side, 1st floor, room 07 (lab)"),
                      ("DE204", "D building, Extension, 2nd floor, room 04")),
             extension_floors=(1, 2, 3), lab_floors=(1, 2, 3), pending_floors=(4, 5, 6, 7, 8, 9),
             floor_notes=((0, "No classrooms on the ground floor. It has one auditorium and the waiting lobby."),)),
    Building("C", "C Building (Administrative)", "C", "admin", None, "The round glass building. Administrative offices."),
    Building("A1", "Annex 1", "1", "annex", 1, "Ground floor only."),
    Building("A2", "Annex 2", "2", "annex", 1, "Ground floor only."),
    Building("A3", "Annex 3", "3", "annex", None),
    Building("A4", "Annex 4", "4", "annex", None, formats=(("41D10", "Annex 4, 1st floor, section D, room 10"),)),
    Building("A5", "Annex 5", "5", "annex", None),
    Building("A6", "Annex 6", "6", "annex", None),
    Building("A7", "Annex 7 (Architecture building)", "7", "annex", None, "The Architecture building."),
    Building("A9", "Annex 9", "9", "tower", 6, "New building next to D building, same shape as D. Joined to D by two bridges on the 2nd and 3rd floors.",
             formats=(("9204", "Annex 9, 2nd floor, room 04"), ("9210E", "Annex 9, 2nd floor, room 10, seat E")))
)
BY_ID = {b.id: b for b in BUILDINGS}


def floor_label(n: int) -> str:
    if n == 0:
        return "Ground floor"
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix} floor"


def building_dict(b: Building) -> dict:
    return {"id": b.id, "name": b.name, "short": b.short, "kind": b.kind, "levels": b.levels, "note": b.note,
            "places": list(b.places), "extension_floors": list(b.extension_floors), "lab_floors": list(b.lab_floors), "pending_floors": list(b.pending_floors),
            "floor_notes": {str(n): t for n, t in b.floor_notes}, "formats": [{"code": c, "meaning": m} for c, m in b.formats],
            "floors": [{"n": i, "label": floor_label(i)} for i in range(b.levels)] if b.levels else []}


_ANNEX = re.compile(r"^(\d)(\d)(\d{2})([A-Z])?$")
_ANNEX_WING = re.compile(r"^(\d)(\d)([A-D])(\d{2})$")   # 41D10 = Annex 4, 1st floor, section D, room 10 (read from the faculty list; not confirmed by AIUB)
_DWING = re.compile(r"^D([NSE])([A-Z0-9]{2,5})$")


def parse_room(code: str | None) -> dict | None:
    """Decode a room code. Returns None when the code is empty, otherwise a dict that always has 'ok' and 'message'."""
    if not code or not code.strip():
        return None
    raw = code.strip()
    norm = re.sub(r"[\s\-_./]", "", raw).upper()
    w = _ANNEX_WING.match(norm)
    m = None if w else _ANNEX.match(norm)
    if w or m:
        if w:
            annex, floor, room, seat, section = int(w.group(1)), int(w.group(2)), w.group(4), None, w.group(3)
        else:
            annex, floor, room, seat, section = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4), None
        b = BY_ID.get(f"A{annex}")
        if not b:
            return {"ok": False, "code": raw, "message": f"{raw}: Annex {annex} is not on the campus map yet."}
        out = {"ok": True, "code": raw, "building": b.id, "building_name": b.name, "floor": floor, "floor_label": floor_label(floor),
               "room": room, "warning": None}
        if b.levels is not None and floor >= b.levels:
            top = b.levels - 1
            out["warning"] = f"{b.name} has floors up to {top} ({b.levels} floors with the ground floor). Check the room number."
        if section:
            out["section"] = section
        if seat:
            out["seat"] = seat
        extra = f", section {section}" if section else ""
        out["message"] = f"{b.name}, {floor_label(floor)}{extra}, room {room}" + (f", seat {seat}." if seat else ".")
        return out
    d = _DWING.match(norm)
    if d:
        b = BY_ID["D"]
        wing, rest = d.group(1), d.group(2)
        side = {"N": "North side", "S": "South side", "E": "Extension"}[wing]
        floor, room = None, rest
        office = wing in "NS" and re.fullmatch(r"\d{4}", rest) is not None   # DN0921 = North side, 9th floor, room 21 (two-digit floor)
        if office:
            floor, room = int(rest[:2]), rest[2:]
        elif wing == "E" and re.fullmatch(r"\d\d{2}", rest):
            floor, room = int(rest[0]), rest[1:]
        elif wing in "NS" and re.fullmatch(r"\d{3}", rest):
            floor, room = int(rest[0]), rest[1:]
        elif wing in "NS" and not re.fullmatch(r"\d{2}", rest):
            room = rest
        out = {"ok": True, "code": raw, "building": "D", "building_name": b.name, "wing": side, "floor": floor,
               "floor_label": floor_label(floor) if floor is not None else None, "room": room, "warning": None}
        notes = dict(b.floor_notes)
        if office:
            out["message"] = f"{b.name}, {side}, {floor_label(floor)}, room {room}."
            if not 0 <= floor < b.levels:
                out["warning"] = f"D building has floors up to the {floor_label(b.levels - 1)}. Check the room number."
            return out
        if floor is not None and floor in notes:
            out["warning"] = notes[floor] + " There are no room codes on this floor."
        elif floor is not None and floor in b.pending_floors:
            out["warning"] = f"The room structure for the 4th to 9th floors of D building is not decided yet, so {raw} cannot be placed on a room."
        elif wing in "NS" and floor is not None and floor in b.lab_floors:
            out["kind"] = "Lab"
            n = int(room)
            if not 1 <= n <= 12:
                out["warning"] = "D building floors 1 to 3 have rooms 01 to 12. Check the room number."
            elif (wing == "S") != (n <= 6):
                out["warning"] = f"On the 1st to 3rd floors, rooms 01 to 06 are on the South side and 07 to 12 on the North side, so this is probably D{'N' if wing == 'S' else 'S'}{floor}{room}."
        if wing == "E" and floor is not None and floor not in b.extension_floors:
            out["warning"] = "The D building Extension exists only on the 1st, 2nd and 3rd floors. Check the room number."
        tag = " (lab)" if out.get("kind") == "Lab" else ""
        if floor is not None and (floor in notes or floor in b.pending_floors):
            out["room"] = None
            out["message"] = f"{b.name}, {side}, {floor_label(floor)}."
            return out
        out["message"] = f"{b.name}, {side}, {floor_label(floor)}, room {room}{tag}." if floor is not None else f"{b.name}, {side}, room {room}."
        return out
    if norm.startswith("D") and len(norm) > 1:
        b = BY_ID["D"]
        return {"ok": True, "code": raw, "building": "D", "building_name": b.name, "floor": None, "floor_label": None, "room": None,
                "warning": None, "message": f"{b.name}. The floor and room format for D building is not added yet."}
    if norm.startswith("C") and len(norm) > 1 and not norm.startswith("CSE"):
        b = BY_ID["C"]
        return {"ok": True, "code": raw, "building": "C", "building_name": b.name, "floor": None, "floor_label": None, "room": None,
                "warning": None, "message": f"{b.name}. The floor and room format for C building is not added yet."}
    return {"ok": False, "code": raw, "message": f"“{raw}” is not a room code this map understands yet. Try 9204 (Annex 9), DS101 or DN107 (D building labs) or DE204 (D extension)."}
