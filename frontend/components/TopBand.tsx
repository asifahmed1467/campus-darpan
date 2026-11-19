"use client";
import { useEffect, useState } from "react";
import QuoteBanner from "@/components/QuoteBanner";
import { useLang } from "@/lib/i18n";
import type { Meta } from "@/lib/types";

const DAY = 86_400_000;
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
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" role="img" aria-label={label}>
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
  let progress: React.ReactNode = null;
  if (meta?.semester_start && meta.semester_end) {
    const now = at(meta.now), a = at(meta.semester_start), b = at(meta.semester_end);
    const total = Math.max(1, b - a), pct = Math.max(0, Math.min(100, Math.round(((now - a) / total) * 100)));
    const left = Math.max(0, Math.round((b - now) / DAY));
    const weeks = Math.max(1, Math.ceil(total / (7 * DAY))), w = Math.max(1, Math.min(weeks, Math.floor((now - a) / (7 * DAY)) + 1));
    const nh = meta.upcoming_holidays?.[0];
    const nd = nh ? Math.round((at(nh.date) - now) / DAY) : null;
    progress = (
      <div className="top-progress flex items-center gap-4 sm:border-l sm:border-line sm:pl-6">
        <Ring pct={pct} label={t("top.progress")} />
        <div className="min-w-0 font-display">
          <p className="text-base font-semibold">{t("top.progress")}</p>
          <p className="text-2xl font-bold leading-tight">{left > 0 ? t("top.days_left", { n: num(left) }) : t("top.done")}</p>
          <p className="text-sm text-mute">{t("top.week", { w: num(w), of: num(weeks) })}</p>
          {nh && nd !== null && nd >= 0 && <p className="mt-1 text-sm text-mute">{t("top.next", { name: nh.name, n: num(nd) })}</p>}
        </div>
      </div>
    );
  }
  return (
    <section aria-label={t("top.heading")} className="top-band relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <span aria-hidden className="top-aurora" />
      <div className={`relative grid items-center gap-6 ${progress ? "md:grid-cols-[1fr_auto]" : ""}`}>
        <div className="min-w-0">
          <p className="top-heading inline-flex items-center gap-2 font-display text-lg font-bold">
            <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="top-spark"><path d="M12 2l2.4 7.1L22 12l-7.6 2.9L12 22l-2.4-7.1L2 12l7.6-2.9z" /></svg>
            {t("top.heading")}
          </p>
          <QuoteBanner />
        </div>
        {progress}
      </div>
    </section>
  );
}
