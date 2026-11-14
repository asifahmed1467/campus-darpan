"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

export default function RoomsPage() {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try { const r = await api<{ message: string }>(`/api/rooms?q=${encodeURIComponent(q.trim())}`); setMsg(r.message); }
    catch (x) { setErr((x as Error).message); }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold sm:text-5xl">{t("rooms.title")}</h1>
      <p className="mt-2 max-w-[48ch] text-lg text-mute">New to campus? Type a room number like “D-0302” and see which building and floor it is on, and how to get there.</p>
      <form onSubmit={search} className="mt-6 flex gap-2">
        <label htmlFor="rq" className="sr-only">Room number</label>
        <input id="rq" className="field font-display !text-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Room number, for example D-0302" autoComplete="off" />
        <button className="btn btn-primary" type="submit" disabled={!q.trim()}>Find room</button>
      </form>
      {err && <p role="alert" className="mt-3 text-busy">{err}</p>}
      <section className="mt-8 rounded-2xl border-2 border-dashed border-edge/60 bg-sheet p-6 sm:p-8">
        <h2 className="text-2xl font-bold">Room maps are being added</h2>
        <p className="mt-2 text-mute">{msg ?? "The floor plans are on their way. Until then, every teacher's profile already shows their office room."}</p>
        <svg className="mt-6 w-full max-w-md" viewBox="0 0 400 150" role="img" aria-label="Sketch of a floor plan with a route to a room">
          <rect x="6" y="6" width="388" height="138" rx="8" style={{ fill: "rgb(var(--c-paper))", stroke: "rgb(var(--c-edge))" }} strokeWidth="2" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={20 + i * 74} y="16" width="64" height="44" rx="4" style={{ fill: "rgb(var(--c-sheet))", stroke: "rgb(var(--c-line))" }} strokeWidth="2" />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={20 + i * 74} y="92" width="64" height="44" rx="4" style={{ fill: i === 3 ? "rgb(var(--c-go))" : "rgb(var(--c-sheet))", stroke: i === 3 ? "rgb(var(--c-go))" : "rgb(var(--c-line))" }} strokeWidth="2" />)}
          <path d="M20 76 H270 V92" fill="none" style={{ stroke: "rgb(var(--c-needle))" }} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 10" />
          <circle cx="20" cy="76" r="7" style={{ fill: "rgb(var(--c-brand))" }} />
        </svg>
      </section>
      <p className="mt-6 text-mute">Looking for a teacher's office? <Link className="font-semibold text-brand underline" href="/faculty">Search the faculty list</Link>.</p>
    </div>
  );
}
