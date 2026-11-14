"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Calendar, MissingTsf, NoticesAdmin, Stats, Teachers } from "@/components/admin/Tabs";
import TsfManager from "@/components/admin/TsfManager";
import { adminToken, api, ApiError } from "@/lib/api";

const TABS = [
  { id: "tsf", label: "Upload TSF" }, { id: "missing", label: "Missing TSFs" }, { id: "teachers", label: "Teachers" },
  { id: "calendar", label: "Calendar" }, { id: "notices", label: "Notices and answers" }, { id: "stats", label: "Usage" },
] as const;

export default function Admin() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("tsf");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!adminToken.get()) { router.replace("/admin/login"); return; }
    api<{ name: string; role: string }>("/api/admin/me", { admin: true }).then(setMe)
      .catch((e: ApiError) => { if (e.status === 401) { adminToken.clear(); router.replace("/admin/login"); } else setErr(e.message); });
  }, [router]);

  if (err) return <p role="alert" className="text-busy">{err}</p>;
  if (!me) return <div className="skeleton h-40" />;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">Admin</h1>
        <div className="flex items-center gap-3"><span className="text-mute">{me.name}{me.role === "super_admin" ? " (super admin)" : ""}</span>
          <button className="chip" onClick={() => { adminToken.clear(); router.replace("/admin/login"); }}>Log out</button></div>
      </div>
      <div role="tablist" aria-label="Admin sections" className="mt-5 flex gap-1 overflow-x-auto border-b-2 border-ink">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}
            className={`-mb-0.5 shrink-0 rounded-t-lg border-2 border-b-0 px-4 py-2.5 font-display font-semibold ${tab === t.id ? "border-ink bg-sheet" : "border-transparent text-mute hover:text-ink"}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === "tsf" && <TsfManager />}
        {tab === "missing" && <MissingTsf />}
        {tab === "teachers" && <Teachers />}
        {tab === "calendar" && <Calendar isSuper={me.role === "super_admin"} />}
        {tab === "notices" && <NoticesAdmin />}
        {tab === "stats" && <Stats />}
      </div>
    </div>
  );
}
