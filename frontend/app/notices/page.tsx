"use client";
import { useEffect, useState } from "react";
import { NoticeList } from "@/components/Notices";
import { api } from "@/lib/api";
import { useDebounced, useLive } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import type { Notice } from "@/lib/types";

const TAGS = ["Exam", "Registration", "Holiday", "Scholarship", "Convocation", "Admission", "Probation", "Result", "Event"];

export default function NoticesPage() {
  const { t } = useLang();
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [older, setOlder] = useState<Notice[]>([]);
  const [fresh, setFresh] = useState<Notice[]>([]);
  const [more, setMore] = useState(true);
  const [perm, setPerm] = useState<string>("unsupported");

  const { data, error, loading, reload } = useLive(() => {
    const p = new URLSearchParams({ limit: "20" });
    if (tag) p.set("tag", tag);
    if (dq.trim()) p.set("q", dq.trim());
    return api<{ items: Notice[] }>(`/api/notices?${p}`);
  }, [tag, dq], 120_000);

  useEffect(() => { setOlder([]); setMore(true); }, [tag, dq]);
  useEffect(() => { if ("Notification" in window) setPerm(Notification.permission); }, []);
  useEffect(() => {
    const on = (e: Event) => { const n = (e as CustomEvent<Notice>).detail; setFresh((f) => (f.some((x) => x.id === n.id) ? f : [n, ...f])); reload(); };
    window.addEventListener("aiub:notice", on);
    return () => window.removeEventListener("aiub:notice", on);
  }, [reload]);

  const base = data?.items ?? [];
  const shown = [...fresh.filter((n) => !base.some((b) => b.id === n.id) && (!tag || n.tags.includes(tag))), ...base, ...older];
  const lastId = shown.length ? Math.min(...shown.map((n) => n.id)) : 0;

  const loadOlder = async () => {
    const p = new URLSearchParams({ limit: "20", before_id: String(lastId) });
    if (tag) p.set("tag", tag);
    if (dq.trim()) p.set("q", dq.trim());
    const r = await api<{ items: Notice[] }>(`/api/notices?${p}`);
    setOlder((o) => [...o, ...r.items]);
    if (r.items.length < 20) setMore(false);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold sm:text-5xl">{t("notices.title")}</h1>
      <p className="mt-2 text-mute">New notices from AIUB appear here and pop up on screen within minutes of being posted.</p>
      {perm === "default" && (
        <button className="btn btn-quiet mt-4" onClick={async () => setPerm(await Notification.requestPermission())}>Get alerts when this tab is in the background</button>
      )}
      <div className="mt-6"><label htmlFor="nq" className="sr-only">Search notices</label>
        <input id="nq" type="search" className="field font-display !text-lg" placeholder="Search notice titles" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Notice categories">
        <button className="chip" aria-pressed={!tag} onClick={() => setTag("")}>{t("all")}</button>
        {TAGS.map((x) => <button key={x} className="chip" aria-pressed={tag === x} onClick={() => setTag(x)}>{x}</button>)}
      </div>
      <div className="mt-4 rounded-2xl border border-line bg-sheet px-4 py-1 sm:px-6">
        {loading && !data ? <div className="space-y-4 py-5"><div className="skeleton h-14" /><div className="skeleton h-14" /><div className="skeleton h-14" /></div>
          : error && !data ? <div className="py-6"><p className="text-busy">{error}</p><button className="btn btn-quiet mt-3" onClick={reload}>Try again</button></div>
          : shown.length ? <NoticeList items={shown} freshIds={fresh.map((n) => n.id)} />
          : <p className="py-6 text-mute">{tag || dq ? "No notices match. Clear the filter or search to see everything." : "No notices have been loaded yet."}</p>}
      </div>
      {shown.length >= 20 && more && <div className="mt-5 text-center"><button className="btn btn-quiet" onClick={loadOlder}>Load older notices</button></div>}
    </div>
  );
}
