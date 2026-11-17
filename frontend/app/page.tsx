"use client";
import Link from "next/link";
import FacultyRow, { RowSkeleton } from "@/components/FacultyRow";
import { NoticeList } from "@/components/Notices";
import NoticeTicker from "@/components/NoticeTicker";
import TodayCard from "@/components/TodayCard";
import Reveal from "@/components/Reveal";
import SearchBox from "@/components/SearchBox";
import { Mark, NAME_BN, TAGLINE_BN, TAGLINE_EN } from "@/components/Logo";
import { api, dayName, fmtMin, minutesOf } from "@/lib/api";
import { useFavs, useLive } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import type { Faculty, Meta, Notice } from "@/lib/types";

const RANK: Record<string, number> = { available: 0, in_class: 1, admin: 2, unavailable: 3, off: 4, no_schedule: 5 };

export default function Home() {
  const { t, lang, date } = useLang();
  const favs = useFavs();
  const fac = useLive(() => api<{ items: Faculty[]; total: number; now: string }>("/api/faculty?limit=100"), []);
  const notices = useLive(() => api<{ items: Notice[] }>("/api/notices?limit=5"), [], 120_000);
  const meta = useLive(() => api<Meta>("/api/meta"), [], 300_000);

  const rows = (fac.data?.items ?? [])
    .filter((f) => f.has_tsf)
    .sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)) || RANK[a.status.status] - RANK[b.status.status] || a.name.localeCompare(b.name))
    .slice(0, 5);
  const now = fac.data?.now;
  const freeNow = (fac.data?.items ?? []).filter((f) => f.has_tsf && f.status.status === "available").length;

  return (
    <div className="space-y-14">
      <section className="relative z-20 grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div className="hero-glow relative z-20 min-w-0 pt-2 lg:pt-8">
          <h1 className="max-w-[14ch] text-[2.6rem] font-bold sm:text-6xl lg:text-7xl" aria-label={t("hero.title")}>
            {t("hero.title").split(" ").map((w, i, all) => <span key={i} aria-hidden className={`word mr-[.25em] ${i >= all.length - 2 ? "mark-word" : ""}`} style={{ ["--w" as string]: i }}>{w}</span>)}
          </h1>
          <p className="mt-5 max-w-[34ch] text-lg text-mute sm:text-xl">{t("hero.sub")}</p>
          <div className="mt-8"><SearchBox big /></div>
          <p className="text-base text-mute">{t("home.hint")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="chip font-display" href="/ask">{t("nav.ask")}</Link>
            <Link className="chip font-display" href="/notices">{t("home.all_notices")}</Link>
            <Link className="chip font-display" href="/rooms">{t("nav.rooms")}</Link>
          </div>
        </div>

        <section aria-labelledby="rn" style={{ ["--i" as string]: 2 }} className="rise neu-raised relative z-10 min-w-0 rounded-3xl p-2 sm:p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pb-2 pt-3 sm:px-4">
            <h2 id="rn" className="flex items-center gap-3 text-2xl font-bold">{t("home.right_now")}
              {freeNow > 0 && <span className="flex items-center gap-1.5 rounded-full bg-go/10 px-2.5 py-0.5 font-display text-sm font-semibold text-go"><span aria-hidden className="dot-live h-2 w-2 rounded-full bg-go" />{t("home.free_count", { n: freeNow })}</span>}
            </h2>
            {now && <p className="font-display text-lg font-semibold">{fmtMin(minutesOf(now), lang)}, {dayName(now, lang)}</p>}
          </div>
          {fac.loading && !fac.data ? <RowSkeleton n={4} /> : fac.error && !fac.data ? (
            <div className="px-4 py-6"><p className="text-busy">{t("home.load_failed")}</p><button className="btn btn-quiet mt-3" onClick={fac.reload}>{t("home.retry")}</button></div>
          ) : rows.length ? (
            <ul>{rows.map((f, i) => <FacultyRow key={f.id} f={f} compact idx={i} />)}</ul>
          ) : <p className="px-4 py-6 text-mute">{t("home.no_schedules")}</p>}
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-base">
            <span className="text-mute">{fac.data ? t("home.teachers_listed", { n: fac.data.total }) : ""}</span>
            <Link href="/faculty" className="font-display font-semibold text-brand underline">{t("home.all_faculty")}</Link>
          </div>
        </section>
      </section>

      <Reveal><TodayCard /></Reveal>

      <NoticeTicker items={notices.data?.items ?? []} />

      <Reveal><section className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <h2 className="draw-line text-3xl font-bold">{t("home.notices")}</h2>
            <Link href="/notices" className="font-display font-semibold text-brand underline">{t("home.all_notices")}</Link>
          </div>
          {notices.loading && !notices.data ? <div className="space-y-4 py-4"><div className="skeleton h-14" /><div className="skeleton h-14" /><div className="skeleton h-14" /></div>
            : notices.error && !notices.data ? <div className="py-4"><p className="text-busy">{t("home.notices_failed")}</p><button className="btn btn-quiet mt-3" onClick={notices.reload}>{t("home.retry")}</button></div>
            : <NoticeList items={notices.data?.items ?? []} />}
        </div>
        <aside aria-labelledby="up" className="card-hover neu-raised h-fit rounded-2xl p-5">
          <h2 id="up" className="draw-line text-2xl font-bold">{t("home.holidays")}</h2>
          {meta.data?.semester && meta.data.semester_start && meta.data.semester_end && <p className="mt-1 text-base text-mute">{t("home.semester", { name: meta.data.semester, from: date(meta.data.semester_start, { day: "numeric", month: "short" }), to: date(meta.data.semester_end, { day: "numeric", month: "short", year: "numeric" }) })}</p>}
          <ul className="mt-3 divide-y divide-line">
            {(meta.data?.upcoming_holidays ?? []).map((h) => (
              <li key={h.date} className="flex justify-between gap-4 py-2.5">
                <span>{h.name}</span>
                <span className="shrink-0 font-display font-semibold">{date(h.date, { weekday: "short", day: "numeric", month: "short" })}</span>
              </li>
            ))}
            {meta.data && !meta.data.upcoming_holidays.length && <li className="py-2.5 text-mute">{t("home.no_holidays")}</li>}
          </ul>
          <p className="mt-3 text-base text-mute">{t("home.weekend_note")}</p>
        </aside>
      </section></Reveal>
      <Reveal><section aria-label="ক্যাম্পাসদর্পণ" className="flex flex-col items-start gap-5 rounded-2xl bg-inverse p-6 text-white sm:flex-row sm:items-center sm:gap-8 sm:p-8">
        <Mark size={84} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-bn text-4xl font-bold leading-tight sm:text-5xl">{NAME_BN}</p>
          <p className="mt-1 font-display text-xl font-medium text-white/80">{TAGLINE_EN}</p>
          <p className="mt-2 font-bn text-lg text-white/90">{TAGLINE_BN}</p>
        </div>
      </section></Reveal>
    </div>
  );
}
