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


# levels: "D has 9 floors" and "Annex 9 is a 5 floor building" are counted with the ground floor included.
BUILDINGS: tuple[Building, ...] = (
    Building("D", "D Building", "D", "tower", 9, "Has a North side, a South side and an Extension. The Extension exists only on the 1st, 2nd and 3rd floors. On the 1st to 3rd floors the North and South side rooms are labs only. Joined to Annex 9 by two bridges on the 2nd and 3rd floors.",
             formats=(("DS101", "D building, South side, 1st floor, room 01 (lab)"), ("DN107", "D building, North side, 1st floor, room 07 (lab)"),
                      ("DE204", "D building, Extension, 2nd floor, room 04")),
             extension_floors=(1, 2, 3), lab_floors=(1, 2, 3)),
    Building("C", "C Building (Administrative)", "C", "admin", None, "The round glass building. Administrative offices."),
    Building("A1", "Annex 1", "1", "annex", 1, "Ground floor only."),
    Building("A2", "Annex 2", "2", "annex", 1, "Ground floor only."),
    Building("A3", "Annex 3", "3", "annex", None),
    Building("A4", "Annex 4", "4", "annex", None),
    Building("A5", "Annex 5", "5", "annex", None),
    Building("A6", "Annex 6", "6", "annex", None),
    Building("A7", "Annex 7 (Architecture building)", "7", "annex", None, "The Architecture building."),
    Building("A9", "Annex 9", "9", "tower", 5, "New building next to D building, same shape as D. Joined to D by two bridges on the 2nd and 3rd floors.",
             formats=(("9204", "Annex 9, 2nd floor, room 04"),)),
)
BY_ID = {b.id: b for b in BUILDINGS}


def floor_label(n: int) -> str:
    if n == 0:
        return "Ground floor"
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix} floor"


def building_dict(b: Building) -> dict:
    return {"id": b.id, "name": b.name, "short": b.short, "kind": b.kind, "levels": b.levels, "note": b.note,
            "places": list(b.places), "extension_floors": list(b.extension_floors), "lab_floors": list(b.lab_floors), "formats": [{"code": c, "meaning": m} for c, m in b.formats],
            "floors": [{"n": i, "label": floor_label(i)} for i in range(b.levels)] if b.levels else []}


_ANNEX = re.compile(r"^(\d)(\d)(\d{2})$")
_DWING = re.compile(r"^D([NSE])([A-Z0-9]{2,5})$")


def parse_room(code: str | None) -> dict | None:
    """Decode a room code. Returns None when the code is empty, otherwise a dict that always has 'ok' and 'message'."""
    if not code or not code.strip():
        return None
    raw = code.strip()
    norm = re.sub(r"[\s\-_./]", "", raw).upper()
    m = _ANNEX.match(norm)
    if m:
        annex, floor, room = int(m.group(1)), int(m.group(2)), m.group(3)
        b = BY_ID.get(f"A{annex}")
        if not b:
            return {"ok": False, "code": raw, "message": f"{raw}: Annex {annex} is not on the campus map yet."}
        out = {"ok": True, "code": raw, "building": b.id, "building_name": b.name, "floor": floor, "floor_label": floor_label(floor),
               "room": room, "warning": None}
        if b.levels is not None and floor >= b.levels:
            top = b.levels - 1
            out["warning"] = f"{b.name} has floors up to {top} ({b.levels} floors with the ground floor). Check the room number."
        out["message"] = f"{b.name}, {floor_label(floor)}, room {room}."
        return out
    d = _DWING.match(norm)
    if d:
        b = BY_ID["D"]
        wing, rest = d.group(1), d.group(2)
        side = {"N": "North side", "S": "South side", "E": "Extension"}[wing]
        floor, room = None, rest
        if wing == "E" and re.fullmatch(r"\d\d{2}", rest):
            floor, room = int(rest[0]), rest[1:]
        elif wing in "NS" and re.fullmatch(r"\d{3}", rest):
            floor, room = int(rest[0]), rest[1:]
        elif wing in "NS" and not re.fullmatch(r"\d{2}", rest):
            room = rest
        out = {"ok": True, "code": raw, "building": "D", "building_name": b.name, "wing": side, "floor": floor,
               "floor_label": floor_label(floor) if floor is not None else None, "room": room, "warning": None}
        if wing in "NS" and floor is not None and floor in b.lab_floors:
            out["kind"] = "Lab"
            n = int(room)
            if not 1 <= n <= 12:
                out["warning"] = "D building floors 1 to 3 have rooms 01 to 12. Check the room number."
            elif (wing == "S") != (n <= 6):
                out["warning"] = f"On the 1st to 3rd floors, rooms 01 to 06 are on the South side and 07 to 12 on the North side, so this is probably D{'N' if wing == 'S' else 'S'}{floor}{room}."
        if wing == "E" and floor is not None and floor not in b.extension_floors:
            out["warning"] = "The D building Extension exists only on the 1st, 2nd and 3rd floors. Check the room number."
        tag = " (lab)" if out.get("kind") == "Lab" else ""
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
