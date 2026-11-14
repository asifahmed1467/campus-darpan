"use client";
import Link from "next/link";
import FacultyRow, { RowSkeleton } from "@/components/FacultyRow";
import { NoticeList } from "@/components/Notices";
import SearchBox from "@/components/SearchBox";
import { Mark, NAME_BN, TAGLINE_BN, TAGLINE_EN } from "@/components/Logo";
import { api, dayName, fmtMin, minutesOf } from "@/lib/api";
import { useFavs, useLive } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import type { Faculty, Meta, Notice } from "@/lib/types";

const RANK: Record<string, number> = { available: 0, in_class: 1, admin: 2, unavailable: 3, off: 4, no_schedule: 5 };

export default function Home() {
  const { t } = useLang();
  const favs = useFavs();
  const fac = useLive(() => api<{ items: Faculty[]; total: number; now: string }>("/api/faculty?limit=100"), []);
  const notices = useLive(() => api<{ items: Notice[] }>("/api/notices?limit=5"), [], 120_000);
  const meta = useLive(() => api<Meta>("/api/meta"), [], 300_000);

  const rows = (fac.data?.items ?? [])
    .filter((f) => f.has_tsf)
    .sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)) || RANK[a.status.status] - RANK[b.status.status] || a.name.localeCompare(b.name))
    .slice(0, 5);
  const now = fac.data?.now;

  return (
    <div className="space-y-14">
      <section className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div className="min-w-0 pt-2 lg:pt-8">
          <h1 className="max-w-[14ch] text-[2.6rem] font-bold sm:text-6xl lg:text-7xl">{t("hero.title")}</h1>
          <p className="mt-5 max-w-[34ch] text-lg text-mute sm:text-xl">{t("hero.sub")}</p>
          <div className="mt-8"><SearchBox big /></div>
          <p className="text-[15px] text-mute">Suggestions appear as you type. The mic works for questions like “When is Nyme sir free?”.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="chip font-display" href="/ask">{t("nav.ask")}</Link>
            <Link className="chip font-display" href="/notices">{t("home.all_notices")}</Link>
            <Link className="chip font-display" href="/rooms">{t("nav.rooms")}</Link>
          </div>
        </div>

        <section aria-labelledby="rn" className="min-w-0 rounded-2xl border-2 border-ink bg-sheet p-2 shadow-[6px_6px_0_0_#0F1B3D] sm:p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pb-2 pt-3 sm:px-4">
            <h2 id="rn" className="text-2xl font-bold">{t("home.right_now")}</h2>
            {now && <p className="font-display text-lg font-semibold">{fmtMin(minutesOf(now))}, {dayName(now)}</p>}
          </div>
          {fac.loading && !fac.data ? <RowSkeleton n={4} /> : fac.error && !fac.data ? (
            <div className="px-4 py-6"><p className="text-busy">{fac.error}</p><button className="btn btn-quiet mt-3" onClick={fac.reload}>Try again</button></div>
          ) : rows.length ? (
            <ul>{rows.map((f) => <FacultyRow key={f.id} f={f} compact />)}</ul>
          ) : <p className="px-4 py-6 text-mute">No schedules have been added yet. An admin can upload the first TSF from the admin page.</p>}
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[15px]">
            <span className="text-mute">{fac.data ? `${fac.data.total} teachers listed` : ""}</span>
            <Link href="/faculty" className="font-display font-semibold text-brand underline">{t("home.all_faculty")}</Link>
          </div>
        </section>
      </section>

      <section className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <h2 className="text-3xl font-bold">{t("home.notices")}</h2>
            <Link href="/notices" className="font-display font-semibold text-brand underline">{t("home.all_notices")}</Link>
          </div>
          {notices.loading && !notices.data ? <div className="space-y-4 py-4"><div className="skeleton h-14" /><div className="skeleton h-14" /><div className="skeleton h-14" /></div>
            : notices.error && !notices.data ? <p className="py-4 text-busy">{notices.error}</p>
            : <NoticeList items={notices.data?.items ?? []} />}
        </div>
        <aside aria-labelledby="up" className="h-fit rounded-2xl border border-line bg-sheet p-5">
          <h2 id="up" className="text-2xl font-bold">{t("home.holidays")}</h2>
          {meta.data?.semester && <p className="mt-1 text-[15px] text-mute">{meta.data.semester} semester, classes {meta.data.semester_start && new Date(meta.data.semester_start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to {meta.data.semester_end && new Date(meta.data.semester_end + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>}
          <ul className="mt-3 divide-y divide-line">
            {(meta.data?.upcoming_holidays ?? []).map((h) => (
              <li key={h.date} className="flex justify-between gap-4 py-2.5">
                <span>{h.name}</span>
                <span className="shrink-0 font-display font-semibold">{new Date(h.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
              </li>
            ))}
            {meta.data && !meta.data.upcoming_holidays.length && <li className="py-2.5 text-mute">No holidays left in this semester's calendar.</li>}
          </ul>
          <p className="mt-3 text-[15px] text-mute">Fridays and Saturdays are the weekend.</p>
        </aside>
      </section>
      <section aria-label="ক্যাম্পাসদর্পণ" className="flex flex-col items-start gap-5 rounded-2xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:gap-8 sm:p-8">
        <Mark size={84} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-bn text-4xl font-bold leading-tight sm:text-5xl">{NAME_BN}</p>
          <p className="mt-1 font-display text-xl font-medium text-white/80">{TAGLINE_EN}</p>
          <p className="mt-2 font-bn text-lg text-white/90">{TAGLINE_BN}</p>
        </div>
      </section>
    </div>
  );
}
