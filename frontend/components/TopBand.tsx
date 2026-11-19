"use client";
import { useEffect, useState } from "react";
import QuoteBanner from "@/components/QuoteBanner";
import { useLang } from "@/lib/i18n";
import type { Meta } from "@/lib/types";

const DAY = 86_400_000;
const SONG_URL = "https://soundcloud.com/khudro-manob/shopno-jabe-bari-amar-gp-song";   // SoundCloud: audio-only, full track
const SONG_SRC = `https://w.soundcloud.com/player/?url=${encodeURIComponent(SONG_URL)}&auto_play=true&visual=false&show_comments=false&show_user=true&show_reposts=false&hide_related=true&color=%23f5a623`;
const at = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").getTime();

/** Counts up to `to` once, so the number feels alive. */
function useCount(to: number, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (n: number) => { const k = Math.min(1, (n - t0) / ms); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

function Ring({ pct, label }: { pct: number; label: string }) {
  const R = 38, C = 2 * Math.PI * R;
  const shown = useCount(pct);
  return (
    <svg viewBox="0 0 100 100" className="h-14 w-14 shrink-0 -rotate-90 sm:h-16 sm:w-16" role="img" aria-label={label}>
      <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(var(--c-line))" strokeWidth="9" />
      <circle cx="50" cy="50" r={R} fill="none" stroke="url(#sg)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C}
        className="top-ring" style={{ ["--c" as string]: C, ["--to" as string]: C * (1 - pct / 100) }} />
      <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="rgb(var(--c-needle))" /><stop offset="1" stopColor="rgb(var(--c-go))" /></linearGradient></defs>
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-current font-display" style={{ transformOrigin: "50% 50%", fontSize: 24, fontWeight: 700 }}>{shown}%</text>
    </svg>
  );
}

export default function TopBand({ meta }: { meta?: Meta | null }) {
  const { t, num } = useLang();
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);          // closing removes the iframe, which stops the song
  let progress: React.ReactNode = null;
  if (meta?.semester_start && meta.semester_end) {
    const now = at(meta.now), a = at(meta.semester_start), b = at(meta.semester_end);
    const total = Math.max(1, b - a), pct = Math.max(0, Math.min(100, Math.round(((now - a) / total) * 100)));
    const left = Math.max(0, Math.round((b - now) / DAY));
    const weeks = Math.max(1, Math.ceil(total / (7 * DAY))), w = Math.max(1, Math.min(weeks, Math.floor((now - a) / (7 * DAY)) + 1));
    const nh = meta.upcoming_holidays?.[0];
    const nd = nh ? Math.round((at(nh.date) - now) / DAY) : null;
    progress = (
      <div className="top-progress flex items-center gap-3 sm:border-l sm:border-line sm:pl-5">
        <Ring pct={pct} label={t("top.progress")} />
        <div className="min-w-0 font-display">
          <p className="hidden text-xs font-semibold text-mute sm:block">{t("top.progress")}</p>
          <p className="text-sm font-bold leading-tight sm:hidden">{left > 0 ? t("top.days_left", { n: num(left) }) : t("top.done")} <span className="font-medium text-mute">· {t("top.week", { w: num(w), of: num(weeks) })}</span></p>
          <p className="hidden text-lg font-bold leading-tight sm:block">{left > 0 ? t("top.days_left", { n: num(left) }) : t("top.done")}</p>
          <p className="hidden text-xs text-mute sm:block">{t("top.week", { w: num(w), of: num(weeks) })}</p>
          {nh && nd !== null && nd >= 0 && <p className="hidden text-xs text-mute sm:block">{t("top.next", { name: nh.name, n: num(nd) })}</p>}
          <button type="button" onClick={toggle} aria-expanded={open} className={`break-btn mt-1.5 ${open ? "is-on" : ""}`}>
            <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6" /></svg>
            <span>{left > 0 ? t("top.break", { n: num(left + 1) }) : t("top.break_now")}</span>
            <span className="break-tap">{open ? t("top.stop") : t("top.break_tap")}</span>
          </button>
        </div>
      </div>
    );
  }
  return (
    <section aria-label={t("top.heading")} className="top-band relative overflow-hidden rounded-2xl p-3 sm:p-4">
      <span aria-hidden className="top-aurora" />
      <div className={`relative grid items-center gap-3 sm:gap-5 ${progress ? (open ? "md:grid-cols-[1fr_auto_auto]" : "md:grid-cols-[1fr_auto]") : ""}`}>
        <div className="min-w-0">
          <p className="top-heading hidden items-center gap-1.5 font-display text-sm font-bold sm:inline-flex">
            <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className="top-spark"><path d="M12 2l2.4 7.1L22 12l-7.6 2.9L12 22l-2.4-7.1L2 12l7.6-2.9z" /></svg>
            {t("top.heading")}
          </p>
          <QuoteBanner />
        </div>
        {progress}
        {open && (
          <div className="song-pop relative w-full overflow-hidden rounded-2xl bg-sheet shadow-xl ring-1 ring-line md:w-72">
            <button type="button" onClick={toggle} aria-label={t("top.close")} className="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <iframe title={t("top.playing")} src={SONG_SRC} allow="autoplay" className="block h-[116px] w-full border-0" />
          </div>
        )}
      </div>
    </section>
  );
}
