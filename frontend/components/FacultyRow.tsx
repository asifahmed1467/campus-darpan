"use client";
import Link from "next/link";
import { minutesOf } from "@/lib/api";
import { useFavs } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import { TONE_DOT, TONE_TEXT, statusInfo } from "@/lib/status";
import type { Faculty } from "@/lib/types";
import DayStrip from "./DayStrip";

export const initials = (name: string) => {
  const p = name.replace(/\b(dr|prof|mr|ms|mrs|md)\b\.?/gi, "").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};

export function StatusLabel({ f }: { f: Faculty }) {
  const { t } = useLang();
  const info = statusInfo(f.status);
  return (
    <span className={`inline-flex items-center gap-2 font-display font-semibold ${TONE_TEXT[info.tone]}`}>
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[info.tone]}`} />
      {t(info.label)}
    </span>
  );
}

export function FavButton({ id, name }: { id: number; name: string }) {
  const favs = useFavs();
  const on = favs.has(id);
  return (
    <button type="button" onClick={() => favs.toggle(id)} aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      className="grid h-11 w-11 place-items-center rounded-full text-mute hover:text-ink">
      <svg width="22" height="22" viewBox="0 0 24 24" fill={on ? "rgb(var(--c-needle))" : "none"} stroke={on ? "rgb(var(--c-warn))" : "currentColor"} strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5z" />
      </svg>
    </button>
  );
}

export default function FacultyRow({ f, compact = false }: { f: Faculty; compact?: boolean }) {
  const info = statusInfo(f.status);
  const nowMin = minutesOf(f.status.now);
  return (
    <li className="relative border-t border-line first:border-t-0">
      <Link href={`/faculty/${f.id}`} className="block rounded-lg py-4 pl-3 pr-14 hover:bg-sheet focus-visible:bg-sheet sm:pl-4">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-inverse font-display text-sm font-bold text-white">{initials(f.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span className="font-display text-lg font-semibold leading-tight">{f.name}</span>
              <StatusLabel f={f} />
            </div>
            <div className="flex flex-col gap-x-4 text-[15px] text-mute sm:flex-row sm:justify-between">
              <span>{[f.designation, f.department].filter(Boolean).join(", ") || f.faculty_code || " "}</span>
              <span className="sm:text-right">{info.line}</span>
            </div>
            {!compact && info.sub && <div className="text-[15px] text-ink/80">{info.sub}</div>}
          </div>
        </div>
        <div className="mt-3 sm:pl-[52px]"><DayStrip blocks={f.today} nowMin={nowMin} /></div>
      </Link>
      <div className="absolute right-1 top-3"><FavButton id={f.id} name={f.name} /></div>
    </li>
  );
}

export function RowSkeleton({ n = 4 }: { n?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading teachers">
      {Array.from({ length: n }).map((_, i) => (
        <li key={i} className="border-t border-line px-4 py-4 first:border-t-0">
          <div className="flex gap-3"><div className="skeleton h-10 w-10" /><div className="flex-1 space-y-2"><div className="skeleton h-5 w-1/2" /><div className="skeleton h-4 w-2/3" /></div></div>
          <div className="skeleton mt-3 h-3.5 w-full" />
        </li>
      ))}
    </ul>
  );
}
