"use client";
import { useState } from "react";
import WeekGrid from "@/components/WeekGrid";
import { api, ApiError } from "@/lib/api";

interface PSlot { day: number; start: number; end: number; type: string; course: string | null; section: string | null; room: string | null; label: string | null }
interface PTeacher {
  name: string; email: string | null; match: { id: number; name: string } | null; will_create: boolean; slot_count: number;
  hours: Record<string, number>; errors: string[]; warnings: string[]; slots: PSlot[];
}
interface Report { semester: string | null; teachers: PTeacher[]; errors: string[]; ok: boolean; applied?: { id: number; name: string; slots: number }[] }

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const JSON_EXAMPLE = `{
  "semester": "Fall 2026-27",
  "faculty": [
    {
      "name": "Nyme Ahmed",
      "email": "nyme.ahmed@aiub.edu",
      "slots": [
        { "day": "SUN", "start": "08:00", "end": "10:20", "type": "CLASS", "course": "OOP1", "section": "K", "room": "D-0302" },
        { "day": "SUN", "start": "10:20", "end": "12:40", "type": "CONSULTATION", "room": "D-0510" },
        { "day": "THU", "start": "12:00", "end": "17:00", "type": "ADMIN", "label": "Administrative Hour" }
      ]
    }
  ]
}`;
const CSV_EXAMPLE = `faculty_name,faculty_email,day,start,end,type,course,section,room
Nyme Ahmed,nyme.ahmed@aiub.edu,SUN,08:00,10:20,CLASS,OOP1,K,D-0302
Nyme Ahmed,nyme.ahmed@aiub.edu,SUN,10:20,12:40,CONSULTATION,,,D-0510`;

export default function TsfManager() {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [content, setContent] = useState("");
  const [semester, setSemester] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [saved, setSaved] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const body = () => ({ format, content, semester: semester.trim() || null, create_missing: true });
  const edited = (fn: () => void) => { fn(); setReport(null); setSaved(null); setErr(""); };

  const check = async () => {
    setBusy(true); setErr(""); setSaved(null);
    try { setReport(await api<Report>("/api/admin/tsf/preview", { method: "POST", json: body(), admin: true })); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setErr("");
    try { const r = await api<Report>("/api/admin/tsf/confirm", { method: "POST", json: body(), admin: true }); setSaved(r); setReport(null); setContent(""); }
    catch (e) { setErr((e as Error).message); if (e instanceof ApiError && e.detail && typeof e.detail === "object") setReport((e.detail as { report: Report }).report); }
    finally { setBusy(false); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    edited(() => { setContent(text); setFormat(f.name.toLowerCase().endsWith(".csv") ? "csv" : "json"); });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Add or update a TSF</h2>
        <p className="mt-1 max-w-[60ch] text-mute">Upload one teacher at a time as they arrive, or many together. Only the teachers in the file change; everyone else keeps their schedule. Free time is worked out from Consultation blocks, so you don't need to enter “free”.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto]">
        <fieldset className="flex gap-2" aria-label="File format">
          {(["json", "csv"] as const).map((f) => <button key={f} type="button" className="chip uppercase" aria-pressed={format === f} onClick={() => edited(() => setFormat(f))}>{f}</button>)}
        </fieldset>
        <div><label htmlFor="sem" className="sr-only">Semester (optional if it's inside the file)</label>
          <input id="sem" className="field" placeholder="Semester, for example Fall 2026-27 (optional)" value={semester} onChange={(e) => edited(() => setSemester(e.target.value))} /></div>
        <label className="btn btn-quiet cursor-pointer">Choose file<input type="file" accept=".json,.csv,.txt" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /></label>
      </div>

      <div>
        <label htmlFor="tsf" className="mb-1 block font-display font-semibold">Paste the {format.toUpperCase()} here</label>
        <textarea id="tsf" rows={12} spellCheck={false} className="field !font-mono text-sm leading-relaxed" value={content}
          onChange={(e) => edited(() => setContent(e.target.value))} placeholder={format === "json" ? JSON_EXAMPLE : CSV_EXAMPLE} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="chip" onClick={() => edited(() => setContent(format === "json" ? JSON_EXAMPLE : CSV_EXAMPLE))}>Fill with an example</button>
          <span className="self-center text-[15px] text-mute">Slot types: CLASS, CONSULTATION, ADMIN. Times look like 08:00. Days: SUN to SAT.</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-quiet" onClick={check} disabled={busy || !content.trim()}>{busy ? "Working…" : "Check and preview"}</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !report?.ok}>Save schedules</button>
        {report && !report.ok && <span role="alert" className="text-busy">Fix the problems below, then check again.</span>}
      </div>
      {err && <p role="alert" className="text-busy">{err}</p>}

      {saved && (
        <div role="status" className="rounded-xl border-2 border-go bg-sheet p-4">
          <p className="font-display text-lg font-semibold text-go">Saved {saved.applied?.length} schedule{saved.applied?.length === 1 ? "" : "s"}</p>
          <ul className="mt-1 text-[15px]">{saved.applied?.map((a) => <li key={a.id}>{a.name}: {a.slots} time blocks</li>)}</ul>
          <p className="mt-1 text-[15px] text-mute">Students see the change within about 30 seconds.</p>
        </div>
      )}

      {report?.errors.map((e, i) => <p key={i} role="alert" className="rounded-lg border-2 border-busy bg-sheet p-3 text-busy">{e}</p>)}
      {report?.teachers.map((t, i) => (
        <section key={i} className={`rounded-xl border-2 bg-sheet p-4 ${t.errors.length ? "border-busy" : "border-ink"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xl font-bold">{t.name}</h3>
            <span className="text-[15px] text-mute">{t.match ? `Updates the existing teacher “${t.match.name}”` : "Not in the directory yet, will be added"}</span>
          </div>
          <p className="text-[15px] text-mute">{t.slot_count} blocks. Classes {t.hours.CLASS} h, consultation {t.hours.CONSULTATION} h, admin {t.hours.ADMIN} h per week.</p>
          {t.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-busy">{t.errors.map((e, j) => <li key={j}>{e}</li>)}</ul>}
          {t.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-[15px] text-[#8a5a00]">{t.warnings.map((e, j) => <li key={j}>{e}</li>)}</ul>}
          {t.slots.length > 0 && (
            <details className="mt-3" open={!t.errors.length}>
              <summary className="cursor-pointer font-display font-semibold">Weekly timetable preview</summary>
              <div className="mt-2"><WeekGrid week={DAYS.map((d, di) => ({ day: d, slots: t.slots.filter((s) => s.day === di).map((s) => ({ ...s, start: hhmm(s.start), end: hhmm(s.end) })) }))} /></div>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}
