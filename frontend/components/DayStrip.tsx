"use client";
import { fmtMin } from "@/lib/api";
import { useLang } from "@/lib/i18n";

export interface Block { start: number; end: number; type: string }

const COLOR: Record<string, string> = { CLASS: "bg-brand", CONSULTATION: "bg-go", ADMIN: "bg-violet" };
const NAME = { CLASS: "day.class", CONSULTATION: "day.consultation", ADMIN: "day.admin" } as const;

/** A teacher's day drawn as a strip from 8 AM: blue = class, green = consultation, violet = admin, amber needle = now. */
export default function DayStrip({ blocks, nowMin, tall = false, hours = false }: {
  blocks: Block[]; nowMin: number | null; tall?: boolean; hours?: boolean;
}) {
  const { t, lang } = useLang();
  const start = 480;
  const latest = blocks.reduce((m, b) => Math.max(m, b.end), 0);
  const end = Math.max(1020, Math.ceil(latest / 60) * 60);
  const span = end - start;
  const pct = (m: number) => Math.min(100, Math.max(0, ((m - start) / span) * 100));
  const showNeedle = nowMin !== null && nowMin >= start && nowMin <= end;
  const label = blocks.length
    ? t("day.today") + " " + blocks.map((b) => t("day.range", { what: b.type in NAME ? t(NAME[b.type as keyof typeof NAME]) : b.type, from: fmtMin(b.start, lang), to: fmtMin(b.end, lang) })).join(", ")
    : t("day.none");
  const ticks: number[] = [];
  for (let h = start / 60; h <= end / 60; h++) ticks.push(h);

  return (
    <div>
      <div role="img" aria-label={label}
        className={`relative w-full overflow-hidden rounded-[5px] bg-track neu-inset-sm ${tall ? "h-9" : "h-3.5"}`}>
        {ticks.slice(1, -1).map((h) => (
          <span key={h} className="absolute inset-y-0 w-px bg-sheet/70" style={{ left: `${pct(h * 60)}%` }} />
        ))}
        {blocks.map((b, i) => (
          <span key={i} className={`absolute inset-y-0 ${COLOR[b.type] ?? "bg-mute"}`}
            style={{ left: `${pct(b.start)}%`, width: `${Math.max(0.8, pct(b.end) - pct(b.start))}%`, boxShadow: "inset 1px 0 0 rgb(var(--c-sheet) / .55), inset -1px 0 0 rgb(var(--c-sheet) / .55)" }} />
        ))}
        {showNeedle && (
          <span aria-hidden className="needle absolute inset-y-0 z-10 w-[3px] -translate-x-1/2 rounded-full bg-needle"
            style={{ ["--x" as string]: `${pct(nowMin!)}%`, boxShadow: "0 0 0 1.5px rgb(var(--c-shadow) / .55)" }} />
        )}
      </div>
      {hours && (
        <div aria-hidden className="relative mt-1 h-4 text-xs text-mute">
          {ticks.filter((h) => h % 2 === 0).map((h) => (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>{h % 12 || 12}{h < 12 ? "a" : "p"}</span>
          ))}
        </div>
      )}
    </div>
  );
}
