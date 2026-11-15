"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CampusMap, { BUILDING_COLORS, type CampusBuilding } from "@/components/CampusMap";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface RoomResult { ok: boolean; message: string; building?: string; building_name?: string; floor?: number | null; floor_label?: string | null; room?: string | null; warning?: string | null }

export default function RoomsPage() {
  const { t } = useLang();
  const [buildings, setBuildings] = useState<CampusBuilding[]>([]);
  const [rule, setRule] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<RoomResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ buildings: CampusBuilding[]; rule: string }>("/api/campus").then((c) => { setBuildings(c.buildings); setRule(c.rule); }).catch((x) => setErr((x as Error).message));
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) { setQ(code); lookup(code); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookup = async (code: string) => {
    setErr(null);
    try {
      const r = await api<{ result: RoomResult | null }>(`/api/rooms?q=${encodeURIComponent(code.trim())}`);
      setRes(r.result);
      if (r.result?.ok && r.result.building) { setSel(r.result.building); setFloor(r.result.floor ?? null); }
    } catch (x) { setErr((x as Error).message); }
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); lookup(q); };
  const pick = (id: string) => { setSel(id); setFloor(null); setRes(null); };

  const b = useMemo(() => buildings.find((x) => x.id === sel) ?? null, [buildings, sel]);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-4xl font-bold sm:text-5xl">{t("rooms.title")}</h1>
      <p className="mt-2 max-w-[56ch] text-lg text-mute">Type a room number like 9204, DN03 or DE204 to see the building and floor, or tap a building on the map.</p>
      <form onSubmit={submit} className="mt-6 flex max-w-xl gap-2">
        <label htmlFor="rq" className="sr-only">Room number</label>
        <input id="rq" className="field font-display !text-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Room number, for example 9204" autoComplete="off" inputMode="text" />
        <button className="btn btn-primary" type="submit" disabled={!q.trim()}>Find room</button>
      </form>
      {err && <p role="alert" className="mt-3 text-busy">{err}</p>}
      {res && (
        <div role="status" className={`mt-4 max-w-xl rounded-xl border-2 p-4 ${res.ok ? "border-go" : "border-line"} bg-sheet`}>
          <p className="font-display text-xl font-semibold">{res.message}</p>
          {res.warning && <p className="mt-1 text-warn">{res.warning}</p>}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_19rem]">
        <section aria-label="Campus map" className="self-start rounded-2xl border border-line bg-paper p-2 sm:p-4">
          {buildings.length ? <CampusMap buildings={buildings} selected={sel} floor={floor} onSelect={pick} /> : <div className="skeleton h-72 rounded-xl" />}
          <p className="px-2 pb-1 text-[15px] text-mute">A sketch of how the buildings sit, following the campus map. Not to scale. Heights follow the floor counts; dashed roofs mean the floor count is not added yet. Each building has its own colour.</p>
        </section>

        <aside className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Buildings">
            {buildings.map((x) => <button key={x.id} className="chip" aria-pressed={sel === x.id} onClick={() => pick(x.id)}><span aria-hidden className="mr-1.5 inline-block h-3 w-3 rounded-sm border border-black/20" style={{ background: BUILDING_COLORS[x.id]?.r ?? "#999" }} />{x.id === "D" || x.id === "C" ? `${x.short} building` : x.id === "A7" ? "Annex 7" : x.name}</button>)}
          </div>
          {b ? (
            <div className="rounded-2xl border border-line bg-sheet p-4">
              <h2 className="text-2xl font-bold">{b.name}</h2>
              {b.note && <p className="mt-1 text-mute">{b.note}</p>}
              {b.places.length > 0 && <p className="mt-2"><span className="font-semibold">Inside:</span> {b.places.join(", ")}</p>}
              {b.levels === null && <p className="mt-2 text-mute">The number of floors has not been added yet.</p>}
              {b.formats && b.formats.length > 0 && (
                <div className="mt-3 rounded-xl border border-line bg-paper p-3">
                  <p className="font-display font-semibold">Room numbers here</p>
                  <ul className="mt-1 space-y-0.5">{b.formats.map((f) => <li key={f.code}><button className="font-display font-bold text-brand underline" onClick={() => { setQ(f.code); lookup(f.code); }}>{f.code}</button> <span className="text-mute">{f.meaning}</span></li>)}</ul>
                </div>
              )}
              {b.floors.length > 0 && (
                <>
                  <p className="mt-3 font-display font-semibold">{b.levels} floor{b.levels! > 1 ? "s" : ""}</p>
                  <ol className="mt-2 flex flex-col-reverse gap-1.5">
                    {b.floors.map((f) => (
                      <li key={f.n}><button className="chip w-full !justify-start" aria-pressed={floor === f.n} onClick={() => setFloor(floor === f.n ? null : f.n)}>{f.label}</button></li>
                    ))}
                  </ol>
                  <p className="mt-3 text-[15px] text-mute">Room lists per floor will be added with the room formats.</p>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-edge/60 bg-sheet p-4 text-mute">Pick a building to see its floors.</div>
          )}
          <div className="rounded-2xl border border-line bg-sheet p-4">
            <h2 className="text-xl font-bold">How to read a room number</h2>
            <p className="mt-1 text-mute">{rule}</p>
            <p className="mt-2 font-display text-lg"><span className="font-bold text-brand">9</span><span className="font-bold text-go">2</span><span className="font-bold text-warn">04</span> <span className="text-mute">Annex 9, 2nd floor, room 04</span></p>
            <p className="mt-2 font-display text-lg"><span className="font-bold text-brand">DN</span><span className="font-bold text-warn">03</span> <span className="text-mute">D building, North side, room 03</span></p>
            <p className="font-display text-lg"><span className="font-bold text-brand">DS</span><span className="font-bold text-warn">03</span> <span className="text-mute">D building, South side, room 03</span></p>
            <p className="font-display text-lg"><span className="font-bold text-brand">DE</span><span className="font-bold text-go">2</span><span className="font-bold text-warn">04</span> <span className="text-mute">D Extension, 2nd floor, room 04</span></p>
          </div>
        </aside>
      </div>
      <p className="mt-6 text-mute">Looking for a teacher's office? <Link className="font-semibold text-brand underline" href="/faculty">Search the faculty list</Link>.</p>
    </div>
  );
}
