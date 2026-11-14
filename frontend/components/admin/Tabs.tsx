"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/hooks";

const Row = ({ children }: { children: React.ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
function F({ id, label, ...p }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div><label htmlFor={id} className="mb-1 block font-display font-semibold">{label}</label><input id={id} className="field" {...p} /></div>;
}
const Msg = ({ ok, err }: { ok?: string; err?: string }) => (err ? <p role="alert" className="text-busy">{err}</p> : ok ? <p role="status" className="text-go">{ok}</p> : null);

/** small helper: run an admin call and report success/error text */
function useAction() {
  const [ok, setOk] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string>) => { setBusy(true); setOk(""); setErr(""); try { setOk(await fn()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return { ok, err, busy, run };
}

export function MissingTsf() {
  const { data, error, loading } = useLive(() => api<{ total: number; items: { id: number; name: string; faculty_code: string | null; department: string | null }[] }>("/api/admin/faculty/missing-tsf", { admin: true }), [], 0);
  return (
    <div>
      <h2 className="text-3xl font-bold">Teachers without a TSF</h2>
      <p className="mt-1 text-mute">{data ? `${data.items.length} of ${data.total} teachers still need their schedule uploaded.` : " "}</p>
      {loading && <div className="skeleton mt-4 h-32" />}
      {error && <p role="alert" className="mt-3 text-busy">{error}</p>}
      {data && !data.items.length && <p className="mt-4 rounded-xl border border-line bg-sheet p-5">Every teacher in the directory has a schedule.</p>}
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-sheet">
        {data?.items.map((f) => <li key={f.id} className="flex justify-between gap-4 px-4 py-3"><span className="font-display font-semibold">{f.name}</span><span className="text-mute">{[f.faculty_code, f.department].filter(Boolean).join(", ")}</span></li>)}
      </ul>
    </div>
  );
}

export function Teachers() {
  const imp = useAction(); const add = useAction();
  const [csv, setCsv] = useState("");
  const [t, setT] = useState({ name: "", email: "", faculty_code: "", department: "", designation: "", room: "" });
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-3xl font-bold">Add many teachers from a CSV</h2>
        <p className="mt-1 max-w-[60ch] text-mute">Columns: name, email, faculty_code (FST, FE, FBA, FASS or FHLS), department, designation, room, building. Existing teachers (same email or name) are updated; blank cells never erase data.</p>
        <textarea className="field mt-3 !font-mono text-sm" rows={7} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="Teachers CSV" placeholder={"name,email,faculty_code,department,room\nNyme Ahmed,nyme.ahmed@aiub.edu,FST,Computer Science,D-0510"} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="btn btn-quiet cursor-pointer">Choose CSV file<input type="file" accept=".csv,.txt" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} /></label>
          <button className="btn btn-primary" disabled={imp.busy || !csv.trim()} onClick={() => imp.run(async () => { const r = await api<{ created: number; updated: number; errors: string[] }>("/api/admin/faculty/import", { method: "POST", json: { format: "csv", content: csv }, admin: true }); return `Added ${r.created}, updated ${r.updated}.${r.errors.length ? " Skipped: " + r.errors.join("; ") : ""}`; })}>Import teachers</button>
        </div>
        <div className="mt-2"><Msg ok={imp.ok} err={imp.err} /></div>
      </section>
      <section>
        <h2 className="text-3xl font-bold">Add one teacher</h2>
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); add.run(async () => { await api("/api/admin/faculty", { method: "POST", json: t, admin: true }); setT({ name: "", email: "", faculty_code: "", department: "", designation: "", room: "" }); return `${t.name} was added.`; }); }}>
          <Row><F id="tn" label="Full name" value={t.name} required onChange={(e) => setT({ ...t, name: e.target.value })} /><F id="te" label="AIUB email" type="email" value={t.email} onChange={(e) => setT({ ...t, email: e.target.value })} /></Row>
          <Row>
            <div><label htmlFor="tf" className="mb-1 block font-display font-semibold">Faculty</label>
              <select id="tf" className="field" value={t.faculty_code} onChange={(e) => setT({ ...t, faculty_code: e.target.value })}><option value="">Not set</option>{["FST", "FE", "FBA", "FASS", "FHLS"].map((c) => <option key={c}>{c}</option>)}</select></div>
            <F id="td" label="Department" value={t.department} onChange={(e) => setT({ ...t, department: e.target.value })} />
          </Row>
          <Row><F id="tg" label="Designation" value={t.designation} onChange={(e) => setT({ ...t, designation: e.target.value })} /><F id="tr" label="Office room" value={t.room} onChange={(e) => setT({ ...t, room: e.target.value })} /></Row>
          <button className="btn btn-primary" disabled={add.busy || !t.name.trim()}>Add teacher</button> <Msg ok={add.ok} err={add.err} />
        </form>
      </section>
    </div>
  );
}

export function Calendar({ isSuper }: { isSuper: boolean }) {
  const hol = useLive(() => api<{ id: number; date: string; name: string }[]>("/api/admin/holidays", { admin: true }), [], 0);
  const a = useAction(); const s = useAction();
  const [h, setH] = useState({ date: "", name: "" });
  const [sem, setSem] = useState({ name: "", start_date: "", end_date: "" });
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-3xl font-bold">Holidays and no-class days</h2>
        <p className="mt-1 text-mute">On these days every teacher shows as “Off today”. Fridays and Saturdays are already treated as the weekend.</p>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-sheet">
          {hol.data?.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span><b className="font-display">{new Date(x.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b>, {x.name}</span>
              <button className="chip" onClick={async () => { await api(`/api/admin/holidays/${x.id}`, { method: "DELETE", admin: true }); hol.reload(); }} aria-label={`Remove ${x.name} on ${x.date}`}>Remove</button>
            </li>
          ))}
          {hol.data && !hol.data.length && <li className="px-4 py-4 text-mute">No holidays added.</li>}
        </ul>
        <form className="mt-4 grid items-end gap-3 sm:grid-cols-[auto_1fr_auto]" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api("/api/admin/holidays", { method: "POST", json: h, admin: true }); setH({ date: "", name: "" }); hol.reload(); return "Holiday saved."; }); }}>
          <F id="hd" label="Date" type="date" value={h.date} required onChange={(e) => setH({ ...h, date: e.target.value })} />
          <F id="hn" label="Name" value={h.name} required placeholder="For example Victory Day" onChange={(e) => setH({ ...h, name: e.target.value })} />
          <button className="btn btn-primary" disabled={a.busy}>Add</button>
        </form><div className="mt-2"><Msg ok={a.ok} err={a.err} /></div>
      </section>
      <section>
        <h2 className="text-3xl font-bold">Semester dates</h2>
        <p className="mt-1 max-w-[60ch] text-mute">Schedules only apply between these dates. Setting a new semester makes it the active one.{!isSuper && " Only a super admin can change this."}</p>
        <form className="mt-3 grid items-end gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); s.run(async () => { await api("/api/admin/semester", { method: "PUT", json: sem, admin: true }); return `${sem.name} is now the active semester.`; }); }}>
          <F id="sn" label="Name" value={sem.name} required placeholder="Spring 2026-27" onChange={(e) => setSem({ ...sem, name: e.target.value })} />
          <F id="ss" label="Classes start" type="date" value={sem.start_date} required onChange={(e) => setSem({ ...sem, start_date: e.target.value })} />
          <F id="se" label="Last exam day" type="date" value={sem.end_date} required onChange={(e) => setSem({ ...sem, end_date: e.target.value })} />
          <button className="btn btn-primary" disabled={s.busy || !isSuper}>Set semester</button>
        </form><div className="mt-2"><Msg ok={s.ok} err={s.err} /></div>
      </section>
    </div>
  );
}

export function NoticesAdmin() {
  const d = useAction();
  const [doc, setDoc] = useState({ url: "", title: "", text: "" });
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-3xl font-bold">Teach Ask AIUB a page</h2>
        <p className="mt-1 max-w-[60ch] text-mute">Paste the text of an aiub.edu page (scholarships, fees, rules). Ask AIUB answers from these pages only and always links to the address you enter.</p>
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); d.run(async () => { await api("/api/admin/documents", { method: "POST", json: doc, admin: true }); setDoc({ url: "", title: "", text: "" }); return "Saved. Ask AIUB can use it within about 30 seconds."; }); }}>
          <Row><F id="du" label="Page address" type="url" required value={doc.url} onChange={(e) => setDoc({ ...doc, url: e.target.value })} /><F id="dt" label="Title shown as the source" required value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} /></Row>
          <div><label htmlFor="dx" className="mb-1 block font-display font-semibold">Page text</label><textarea id="dx" className="field" rows={8} required minLength={20} value={doc.text} onChange={(e) => setDoc({ ...doc, text: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={d.busy}>Save page</button> <Msg ok={d.ok} err={d.err} />
        </form>
      </section>
    </div>
  );
}

export function Stats() {
  const { data, error, loading } = useLive(() => api<{ online_now: number; peak_since_restart: number; unique_today: number; unique_7d: number; unique_30d: number; asks_7d: number; unanswered: { q: string; at: string }[]; faculty_total: number; faculty_without_tsf: number; notices_total: number }>("/api/admin/analytics", { admin: true }), [], 15_000);
  const Stat = ({ n, l }: { n: number | string; l: string }) => <div className="rounded-xl border border-line bg-sheet p-4"><div className="font-display text-4xl font-bold">{n}</div><div className="text-mute">{l}</div></div>;
  return (
    <div>
      <h2 className="text-3xl font-bold">Who is using it</h2>
      {loading && !data && <div className="skeleton mt-4 h-32" />}
      {error && <p role="alert" className="mt-3 text-busy">{error}</p>}
      {data && (<>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat n={data.online_now} l="online now" /><Stat n={data.unique_today} l="students today" /><Stat n={data.unique_7d} l="students this week" /><Stat n={data.unique_30d} l="students this month" />
          <Stat n={data.asks_7d} l="questions asked this week" /><Stat n={data.faculty_total - data.faculty_without_tsf + "/" + data.faculty_total} l="teachers with a schedule" /><Stat n={data.notices_total} l="notices stored" /><Stat n={data.peak_since_restart} l="busiest moment since restart" />
        </div>
        <h3 className="mt-8 text-2xl font-bold">Questions Ask AIUB couldn't answer</h3>
        <p className="text-mute">These show what students want that the site doesn't have yet.</p>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-sheet">
          {data.unanswered.map((u, i) => <li key={i} className="px-4 py-2.5">{u.q}</li>)}
          {!data.unanswered.length && <li className="px-4 py-4 text-mute">No unanswered questions yet.</li>}
        </ul>
      </>)}
    </div>
  );
}
