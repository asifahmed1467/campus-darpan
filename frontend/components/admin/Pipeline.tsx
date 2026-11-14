"use client";
import { useState } from "react";
import { currentEndpoint } from "@/components/PushButton";
import { api } from "@/lib/api";
import { useLive } from "@/lib/hooks";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "–");
const Msg = ({ ok, err }: { ok?: string; err?: string }) => (err ? <p role="alert" className="text-busy">{err}</p> : ok ? <p role="status" className="text-go">{ok}</p> : null);
const Pill = ({ tone, children }: { tone: "go" | "busy" | "mute"; children: React.ReactNode }) => (
  <span className={`rounded-full border px-2 py-0.5 text-sm font-semibold ${tone === "go" ? "border-go text-go" : tone === "busy" ? "border-busy text-busy" : "border-line text-mute"}`}>{children}</span>
);

interface Pipeline {
  sources: { name: string; type: string; url?: string; robots_check?: boolean; authorized_by?: string | null }[];
  link_domains: string[]; scheduler_in_api: boolean; interval_sec: number; cron_endpoint_enabled: boolean; push_enabled: boolean;
  email: { webhook_enabled: boolean; auto_publish: boolean; allowlist: string[] };
  subscribers: number; last_run: Run | null;
}
interface Run { id: number; source: string; status: string; found: number; new: number; error: string | null; started_at: string | null; finished_at: string | null }
interface Dry { ok: boolean; error?: string; count?: number; new?: number; items?: { title: string; url: string; date: string | null; official_link: boolean; already_saved: boolean }[] }

export function Sources() {
  const p = useLive(() => api<Pipeline>("/api/admin/pipeline", { admin: true }), [], 0);
  const runs = useLive(() => api<{ items: Run[] }>("/api/admin/runs?limit=20", { admin: true }), [], 30_000);
  const [dry, setDry] = useState<Record<string, Dry>>({});
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const test = async (name: string) => {
    setBusy(name);
    try { setDry({ ...dry, [name]: await api<Dry>(`/api/admin/sources/${encodeURIComponent(name)}/test`, { method: "POST", admin: true }) }); }
    catch (e) { setDry({ ...dry, [name]: { ok: false, error: (e as Error).message } }); }
    finally { setBusy(""); }
  };
  const runNow = async () => {
    setBusy("run"); setNote("");
    try { const r = await api<{ ran: boolean; reason: string | null; runs: Run[] }>("/api/admin/run-now", { method: "POST", admin: true });
      setNote(r.reason ?? `Checked ${r.runs.length} source(s); ${r.runs.reduce((a, x) => a + x.new, 0)} new notice(s).`); runs.reload(); p.reload(); }
    catch (e) { setNote((e as Error).message); } finally { setBusy(""); }
  };

  const d = p.data;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-3xl font-bold">Notice sources</h2>
        <p className="mt-1 max-w-[62ch] text-mute">Where new notices come from. Nothing here reads aiub.edu pages. Connect an official feed, an API, or forwarded email when AIUB provides one.</p>
        {p.error && <p role="alert" className="mt-3 text-busy">{p.error}</p>}
        {d && (
          <>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              <li className="rounded-xl border border-line bg-sheet p-3"><span className="text-mute">Automatic check</span><div className="mt-1 flex gap-2">{d.scheduler_in_api ? <Pill tone="go">Every {Math.round(d.interval_sec / 60)} min</Pill> : <Pill tone="mute">Not running in the API</Pill>}{d.cron_endpoint_enabled && <Pill tone="go">Pinger endpoint on</Pill>}</div></li>
              <li className="rounded-xl border border-line bg-sheet p-3"><span className="text-mute">Browser alerts</span><div className="mt-1">{d.push_enabled ? <Pill tone="go">On, {d.subscribers} device(s)</Pill> : <Pill tone="busy">Off: add VAPID keys</Pill>}</div></li>
              <li className="rounded-xl border border-line bg-sheet p-3"><span className="text-mute">Forwarded email</span><div className="mt-1">{d.email.webhook_enabled ? <Pill tone="go">{d.email.auto_publish ? "Auto-publish from allowed senders" : "Every email waits for review"}</Pill> : <Pill tone="mute">Webhook secret not set</Pill>}</div></li>
              <li className="rounded-xl border border-line bg-sheet p-3"><span className="text-mute">Accepted links</span><div className="mt-1 font-display font-semibold">{d.link_domains.join(", ")}</div></li>
            </ul>
            <h3 className="mt-6 text-2xl font-bold">Connected sources</h3>
            {!d.sources.length && <p className="mt-2 rounded-xl border border-line bg-sheet p-4">No source is connected yet, so the site checks nothing. This is expected until AIUB provides a feed, an API or an email forward. Set <code>NOTICE_SOURCES</code> on the server when you have one.</p>}
            <ul className="mt-2 space-y-3">
              {d.sources.map((s) => (
                <li key={s.name} className="rounded-xl border border-line bg-sheet p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-display text-lg font-semibold">{s.name}</span> <Pill tone="mute">{s.type}</Pill>{s.url && <div className="break-all text-[15px] text-mute">{s.url}</div>}
                      {s.authorized_by && <div className="text-[15px] text-mute">Permission: {s.authorized_by}</div>}</div>
                    <button className="btn btn-quiet !min-h-[40px]" disabled={busy === s.name} onClick={() => test(s.name)}>{busy === s.name ? "Reading…" : "Test (saves nothing)"}</button>
                  </div>
                  {dry[s.name] && (dry[s.name].ok ? (
                    <div className="mt-3">
                      <p role="status" className="text-go">Read {dry[s.name].count} item(s); {dry[s.name].new} would be new.</p>
                      <ul className="mt-2 divide-y divide-line text-[15px]">{dry[s.name].items?.map((i) => (
                        <li key={i.url} className="py-2"><div className="font-semibold">{i.title}</div><div className="break-all text-mute">{i.url}</div>
                          <div className="mt-1 flex gap-2">{!i.official_link && <Pill tone="busy">Unofficial link: will be skipped</Pill>}{i.already_saved && <Pill tone="mute">Already saved</Pill>}{i.date && <Pill tone="mute">{i.date}</Pill>}</div></li>))}</ul>
                    </div>) : <p role="alert" className="mt-3 text-busy">{dry[s.name].error}</p>)}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3"><button className="btn btn-primary" disabled={busy === "run"} onClick={runNow}>Check all sources now</button>{note && <span role="status" className="text-mute">{note}</span>}</div>
          </>
        )}
      </section>
      <section>
        <h2 className="text-3xl font-bold">Recent checks</h2>
        {runs.data && !runs.data.items.length && <p className="mt-2 text-mute">Nothing has been checked yet.</p>}
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-sheet">
          {runs.data?.items.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-display font-semibold">{r.source}</span><span className="text-[15px] text-mute">{when(r.started_at)}</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[15px]"><Pill tone={r.status === "ok" ? "go" : r.status === "error" ? "busy" : "mute"}>{r.status}</Pill><span>found {r.found}, new {r.new}</span>{r.error && <span className="text-mute">{r.error}</span>}</div>
            </li>))}
        </ul>
      </section>
    </div>
  );
}

interface Mail { id: number; received_at: string; sender: string; subject: string; status: string; reason: string | null; title: string | null; url: string | null; attachment_url: string | null; date: string | null; excerpt: string | null; notice_id: number | null }

export function Inbox() {
  const [filter, setFilter] = useState("");
  const box = useLive(() => api<{ items: Mail[] }>(`/api/admin/inbox${filter ? `?status=${filter}` : ""}`, { admin: true }), [filter], 30_000);
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const [t, setT] = useState({ from: "", subject: "", text: "" });
  const [prev, setPrev] = useState<{ status: string; reason: string | null; title: string | null; url: string | null; attachment_url: string | null } | null>(null);

  const act = async (id: number, what: "approve" | "reject") => {
    setMsg({ ok: "", err: "" });
    try { await api(`/api/admin/inbox/${id}/${what}`, { method: "POST", admin: true }); setMsg({ ok: what === "approve" ? "Published." : "Rejected.", err: "" }); box.reload(); }
    catch (e) { setMsg({ ok: "", err: (e as Error).message }); }
  };
  const preview = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg({ ok: "", err: "" });
    try { setPrev(await api("/api/admin/inbound/preview", { method: "POST", admin: true, json: t })); } catch (er) { setMsg({ ok: "", err: (er as Error).message }); }
  };
  const tone = (s: string) => (s === "published" ? "go" : s === "rejected" ? "busy" : "mute") as "go" | "busy" | "mute";

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-3xl font-bold">Forwarded emails</h2>
        <p className="mt-1 max-w-[62ch] text-mute">Notice emails that AIUB forwards to this site. Emails from allowed senders with an official link publish by themselves. Others wait here. You can approve or reject; you cannot change what a notice says.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter emails">
          {["", "quarantined", "published", "rejected"].map((s) => <button key={s} className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s || "All"}</button>)}
        </div>
        <div className="mt-2"><Msg {...msg} /></div>
        {box.data && !box.data.items.length && <p className="mt-3 rounded-xl border border-line bg-sheet p-4">No emails yet. When the forward is set up, they show up here.</p>}
        <ul className="mt-3 space-y-3">
          {box.data?.items.map((m) => (
            <li key={m.id} className="rounded-xl border border-line bg-sheet p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-display text-lg font-semibold">{m.title ?? m.subject}</span><Pill tone={tone(m.status)}>{m.status}</Pill></div>
              <p className="text-[15px] text-mute">From {m.sender} · {when(m.received_at)}</p>
              {m.reason && <p className="mt-1 text-[15px]">{m.reason}</p>}
              {m.url && <p className="mt-1 break-all text-[15px]">Link: <a className="text-brand underline" href={m.url} target="_blank" rel="noopener noreferrer">{m.url}</a></p>}
              {m.excerpt && <p className="mt-1 text-[15px] text-mute">{m.excerpt}</p>}
              {m.status === "quarantined" && <div className="mt-3 flex gap-2"><button className="btn btn-primary !min-h-[40px]" disabled={!m.url} onClick={() => act(m.id, "approve")}>Publish</button><button className="btn btn-quiet !min-h-[40px]" onClick={() => act(m.id, "reject")}>Reject</button></div>}
            </li>))}
        </ul>
      </section>
      <section>
        <h2 className="text-3xl font-bold">Test an email</h2>
        <p className="mt-1 max-w-[62ch] text-mute">Paste a sample forwarded email to see how it would be handled. Nothing is saved or sent.</p>
        <form className="mt-3 space-y-3" onSubmit={preview}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="pf" className="mb-1 block font-display font-semibold">From</label><input id="pf" className="field" required value={t.from} onChange={(e) => setT({ ...t, from: e.target.value })} placeholder="registrar@aiub.edu" /></div>
            <div><label htmlFor="ps" className="mb-1 block font-display font-semibold">Subject</label><input id="ps" className="field" required value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} /></div>
          </div>
          <div><label htmlFor="pt" className="mb-1 block font-display font-semibold">Body</label><textarea id="pt" className="field" rows={4} value={t.text} onChange={(e) => setT({ ...t, text: e.target.value })} placeholder="Text of the email, including the link to the notice" /></div>
          <button className="btn btn-primary">Check this email</button>
        </form>
        {prev && <div className="mt-3 rounded-xl border border-line bg-sheet p-4" role="status"><Pill tone={prev.status === "accepted" ? "go" : "busy"}>{prev.status === "accepted" ? "Would publish" : "Would be held for review"}</Pill>
          {prev.reason && <p className="mt-2">{prev.reason}</p>}{prev.title && <p className="mt-2 font-display font-semibold">{prev.title}</p>}{prev.url && <p className="break-all text-[15px] text-mute">{prev.url}</p>}</div>}
      </section>
    </div>
  );
}

export function Alerts() {
  const stats = useLive(() => api<{ total: number; active: number; all_notices: number; by_topic: Record<string, number> }>("/api/admin/subscriptions", { admin: true }), [], 60_000);
  const hist = useLive(() => api<{ items: { notice_id: number; title: string; sent_at: string; recipients: number; delivered: number; failed: number; removed: number; note: string | null }[] }>("/api/admin/notifications", { admin: true }), [], 60_000);
  const [test, setTest] = useState({ ok: "", err: "" });

  const sendTest = async () => {
    setTest({ ok: "", err: "" });
    const ep = await currentEndpoint();
    if (!ep) { setTest({ ok: "", err: "This browser is not subscribed. Open the Notices page, turn notifications on, then come back." }); return; }
    try { const r = await api<{ ok: boolean; message: string }>("/api/admin/push/test", { method: "POST", admin: true, json: { endpoint: ep } }); setTest(r.ok ? { ok: r.message, err: "" } : { ok: "", err: r.message }); }
    catch (e) { setTest({ ok: "", err: (e as Error).message }); }
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-3xl font-bold">Subscribers</h2>
        {stats.data && (
          <>
            <p className="mt-2"><span className="font-display text-4xl font-bold">{stats.data.active}</span> active device(s), {stats.data.total - stats.data.active} dropped. {stats.data.all_notices} get every notice.</p>
            {!!Object.keys(stats.data.by_topic).length && <div className="mt-2 flex flex-wrap gap-2">{Object.entries(stats.data.by_topic).map(([k, v]) => <span key={k} className="chip">{k}: {v}</span>)}</div>}
          </>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3"><button className="btn btn-quiet" onClick={sendTest}>Send a test alert to this browser</button><Msg {...test} /></div>
      </section>
      <section>
        <h2 className="text-3xl font-bold">Alert history</h2>
        {hist.data && !hist.data.items.length && <p className="mt-2 text-mute">No alerts have been sent yet.</p>}
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-sheet">
          {hist.data?.items.map((h) => (
            <li key={h.notice_id} className="px-4 py-3"><div className="font-display font-semibold">{h.title}</div>
              <div className="text-[15px] text-mute">{when(h.sent_at)} · sent to {h.recipients}, delivered {h.delivered}, failed {h.failed}, removed {h.removed}{h.note ? ` · ${h.note}` : ""}</div></li>))}
        </ul>
      </section>
    </div>
  );
}
