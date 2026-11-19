"use client";
import Link from "next/link";
import FacultyRow, { RowSkeleton } from "@/components/FacultyRow";
import { NoticeList } from "@/components/Notices";
import NoticeTicker from "@/components/NoticeTicker";
import TodayCard from "@/components/TodayCard";
import Reveal from "@/components/Reveal";
import TopBand from "@/components/TopBand";
import SearchBox from "@/components/SearchBox";
import { Mark, NAME_BN, TAGLINE_BN, TAGLINE_EN } from "@/components/Logo";
import { api, dayName, fmtMin, minutesOf } from "@/lib/api";
import { useRef, useState } from "react";
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

  // phone: one panel at a time behind three tabs; laptop: all three side by side
  const TABS = ["now", "today", "notices"] as const;
  const [tab, setTab] = useState<(typeof TABS)[number]>("now");
  const touch = useRef<[number, number] | null>(null);
  const show = (k: (typeof TABS)[number]) => (tab === k ? "" : "hidden lg:block");
  const nNotices = notices.data?.items.length ?? 0;
  const onTouchEnd = (e: React.TouchEvent) => {
    const t0 = touch.current; touch.current = null; if (!t0) return;
    const dx = e.changedTouches[0].clientX - t0[0], dy = e.changedTouches[0].clientY - t0[1];
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
    const i = TABS.indexOf(tab) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < TABS.length) setTab(TABS[i]);
  };

  return (
    <div className="flex flex-col gap-6 lg:gap-7">
      <div className="order-1"><NoticeTicker items={notices.data?.items ?? []} /></div>
      <div className="order-3 lg:order-2"><TopBand meta={meta.data} /></div>
      {/* hero: title, search and the day's quote side by side, so everything below is visible without long scrolling */}
      <section className="hero-glow relative z-20 order-2 grid lg:order-3 items-center gap-4 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl lg:text-[2.6rem] lg:leading-tight" aria-label={t("hero.title")}>
            {t("hero.title").split(" ").map((w, i, all) => <span key={i} aria-hidden className={`word mr-[.25em] ${i >= all.length - 2 ? "mark-word" : ""}`} style={{ ["--w" as string]: i }}>{w}</span>)}
          </h1>
          <p className="mt-1 hidden text-base text-mute sm:block sm:text-lg">{t("hero.sub")}</p>
        </div>
        <div className="min-w-0">
          <SearchBox big />
          <div className="mt-3 hidden flex-wrap items-center gap-2 sm:flex">
            <Link className="chip font-display" href="/ask">{t("nav.ask")}</Link>
            <Link className="chip font-display" href="/notices">{t("home.all_notices")}</Link>
            <Link className="chip font-display" href="/rooms">{t("nav.rooms")}</Link>
          </div>
        </div>
      </section>

      {/* everything students check, in one view: who is free, today, the latest notices */}
      <div className="order-4 space-y-4 lg:order-4">
      <div role="tablist" aria-label={t("tab.label")} className="sticky top-2 z-30 grid grid-cols-3 gap-1 rounded-2xl bg-sheet/95 p-1 shadow-md ring-1 ring-line backdrop-blur lg:hidden">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} id={`tab-${k}`} aria-controls={`panel-${k}`} type="button" onClick={() => setTab(k)}
            className={`tab-btn ${tab === k ? "is-on tab-" + k : ""}`}>
            {k === "now" ? t("tab.now") : k === "today" ? t("tab.today") : t("tab.notices")}
            {k === "now" && freeNow > 0 && <span className="tab-badge">{freeNow}</span>}
            {k === "notices" && nNotices > 0 && <span className="tab-badge">{nNotices}</span>}
          </button>
        ))}
      </div>
      <section onTouchStart={(e) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY]; }} onTouchEnd={onTouchEnd} className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr_1fr] lg:gap-6">
        <section id="panel-now" role="tabpanel" aria-labelledby="tab-now" aria-label={t("home.right_now")} style={{ ["--i" as string]: 2 }} className={`pal-green rise neu-raised relative z-10 min-w-0 rounded-3xl p-2 sm:p-3 ${show("now")}`}>
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

        <div id="panel-today" role="tabpanel" aria-labelledby="tab-today" className={`pal-blue min-w-0 ${show("today")}`}><TodayCard /></div>

        <div id="panel-notices" role="tabpanel" aria-labelledby="tab-notices" className={`min-w-0 space-y-6 ${show("notices")}`}>
          <section className="pal-amber neu-raised rounded-3xl p-4 sm:p-5">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <h2 className="draw-line text-2xl font-bold">{t("home.notices")}</h2>
              <Link href="/notices" className="font-display font-semibold text-brand underline">{t("home.all_notices")}</Link>
            </div>
            {notices.loading && !notices.data ? <div className="space-y-4 py-4"><div className="skeleton h-14" /><div className="skeleton h-14" /><div className="skeleton h-14" /></div>
              : notices.error && !notices.data ? <div className="py-4"><p className="text-busy">{t("home.notices_failed")}</p><button className="btn btn-quiet mt-3" onClick={notices.reload}>{t("home.retry")}</button></div>
              : <NoticeList items={(notices.data?.items ?? []).slice(0, 3)} />}
          </section>
          <aside aria-labelledby="up" className="neu-raised h-fit rounded-2xl p-4">
            <h2 id="up" className="text-xl font-bold">{t("home.holidays")}</h2>
            {meta.data?.semester && meta.data.semester_start && meta.data.semester_end && <p className="mt-1 text-sm text-mute">{t("home.semester", { name: meta.data.semester, from: date(meta.data.semester_start, { day: "numeric", month: "short" }), to: date(meta.data.semester_end, { day: "numeric", month: "short", year: "numeric" }) })}</p>}
            <ul className="mt-2 divide-y divide-line">
              {(meta.data?.upcoming_holidays ?? []).slice(0, 3).map((h) => (
                <li key={h.date} className="flex justify-between gap-4 py-2">
                  <span>{h.name}</span>
                  <span className="shrink-0 font-display font-semibold">{date(h.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                </li>
              ))}
              {meta.data && !meta.data.upcoming_holidays.length && <li className="py-2 text-mute">{t("home.no_holidays")}</li>}
            </ul>
          </aside>
        </div>
      </section>
      </div>

      <div className="order-5"><Reveal><section aria-label="ক্যাম্পাসদর্পণ" className="flex flex-col items-start gap-5 rounded-2xl bg-inverse p-6 text-white sm:flex-row sm:items-center sm:gap-8 sm:p-8">
        <Mark size={84} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-bn text-4xl font-bold leading-tight sm:text-5xl">{NAME_BN}</p>
          <p className="mt-1 font-display text-xl font-medium text-white/80">{TAGLINE_EN}</p>
          <p className="mt-2 font-bn text-lg text-white/90">{TAGLINE_BN}</p>
        </div>
      </section></Reveal></div>
    </div>
  );
}
