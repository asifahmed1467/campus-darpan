"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import DayStrip from "@/components/DayStrip";
import { FavButton, StatusLabel, initials } from "@/components/FacultyRow";
import { SpeakButton } from "@/components/Voice";
import WeekGrid, { Legend } from "@/components/WeekGrid";
import { api, minutesOf } from "@/lib/api";
import { useLive } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import { TONE_TEXT, statusInfo } from "@/lib/status";
import type { Profile } from "@/lib/types";

const KEYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default function FacultyProfile() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const { data: p, error, loading, reload } = useLive(() => api<Profile>(`/api/faculty/${id}`), [id]);

  if (loading && !p) return <div className="mx-auto max-w-3xl space-y-4"><div className="skeleton h-10 w-2/3" /><div className="skeleton h-44" /><div className="skeleton h-72" /></div>;
  if (error && !p) return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="text-3xl font-bold">{/not found/i.test(error) ? "We couldn't find this teacher" : "Couldn't load this profile"}</h1>
      <p className="mt-2 text-mute">{error}</p>
      <div className="mt-5 flex gap-3"><button className="btn btn-primary" onClick={reload}>Try again</button><Link className="btn btn-quiet" href="/faculty">Back to faculty</Link></div>
    </div>
  );
  if (!p) return null;

  const info = statusInfo(p.status);
  const now = minutesOf(p.status.now);
  const todayKey = KEYS[new Date(p.status.now.slice(0, 10) + "T12:00:00").getDay()];
  const share = async () => {
    const url = window.location.href.split("?")[0];
    try { if (navigator.share) { await navigator.share({ title: p.name, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/faculty" className="inline-block py-2 font-display font-semibold text-brand underline">All faculty</Link>
      <div className="mt-2 flex items-start gap-4">
        <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-ink font-display text-2xl font-bold text-white">{initials(p.name)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-4xl font-bold sm:text-5xl">{p.name}</h1>
          <p className="mt-1 text-lg text-mute">{[p.designation, p.department, p.faculty_code].filter(Boolean).join(", ")}</p>
        </div>
        <FavButton id={p.id} name={p.name} />
      </div>

      <section aria-labelledby="st" className="mt-8 rounded-2xl border-2 border-ink bg-sheet p-5 shadow-[6px_6px_0_0_#0F1B3D] sm:p-7">
        <h2 id="st" className="sr-only">Availability now</h2>
        <StatusLabel f={p} />
        <p className={`mt-2 font-display text-4xl font-bold leading-tight sm:text-5xl ${TONE_TEXT[info.tone]}`}>{info.main || t(info.label)}</p>
        {info.extra && <p className="mt-1 text-2xl font-semibold">{info.extra}</p>}
        {info.sub && <p className="mt-2 text-xl">{info.sub}</p>}
        {p.status.status === "no_schedule" && p.email && <p className="mt-2 text-mute">Email {p.name.split(" ")[0]} to ask when they are in.</p>}
        {p.status.basis === "gap" && p.status.status !== "no_schedule" && <p className="mt-3 text-[15px] text-mute">This teacher's TSF lists no consultation hours, so free time is shown as gaps between classes.</p>}
        <div className="mt-6"><DayStrip blocks={p.today} nowMin={now} tall hours /></div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <SpeakButton text={p.message} />
          {p.email && <a className="btn btn-quiet !min-h-[40px] !px-3 !py-1.5 text-[15px]" href={`mailto:${p.email}`}>Email</a>}
          <button className="btn btn-quiet !min-h-[40px] !px-3 !py-1.5 text-[15px]" onClick={share}>{copied ? "Link copied" : "Share"}</button>
          {(p.room || p.building) && <span className="ml-auto rounded-lg bg-paper px-3 py-1.5 font-display font-semibold">Office {[p.building, p.room].filter(Boolean).join(" ")}</span>}
        </div>
      </section>

      <section aria-labelledby="wk" className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="wk" className="text-3xl font-bold">Weekly schedule</h2>
          {p.semester && <span className="text-mute">{p.semester}</span>}
        </div>
        {p.has_tsf ? <><WeekGrid week={p.week} todayKey={todayKey} nowMin={now} /><div className="mt-3"><Legend /></div></>
          : <p className="rounded-xl border border-line bg-sheet p-5 text-mute">This teacher's TSF hasn't been added yet. It appears here as soon as an admin uploads it.</p>}
      </section>
    </div>
  );
}
