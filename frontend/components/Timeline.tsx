import { fmtMin } from "@/lib/api";
import type { WeekSlot } from "@/lib/types";

export const mm = (s: string) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3, 5), 10);

const KIND: Record<string, { bar: string; short: string; long: string; dot: string }> = {
  CONSULTATION: { bar: "bg-go text-white", short: "Meet", long: "Consultation hour (you can meet them)", dot: "bg-go" },
  CLASS: { bar: "bg-brand text-white", short: "Class", long: "In class", dot: "bg-brand" },
  ADMIN: { bar: "bg-violet text-white", short: "Admin", long: "Admin duty", dot: "bg-violet" },
};
export const kindOf = (t: string) => KIND[t] ?? { bar: "bg-mute text-white", short: t, long: t, dot: "bg-mute" };

export function windowOf(slots: WeekSlot[][]): { start: number; end: number } {
  const all = slots.flat();
  const latest = Math.max(0, ...all.map((s) => mm(s.end)));
  const earliest = Math.min(480, ...all.map((s) => mm(s.start)));
  return { start: Math.floor(earliest / 60) * 60, end: Math.max(1020, Math.ceil(latest / 60) * 60) };
}

/** One day as a labelled bar. Green "Meet" blocks are the times to visit. Empty space means no class and no consultation. */
export function Bar({ slots, start, end, nowMin, big = false }: { slots: WeekSlot[]; start: number; end: number; nowMin: number | null; big?: boolean }) {
  const span = end - start;
  const pct = (m: number) => Math.min(100, Math.max(0, ((m - start) / span) * 100));
  const showNow = nowMin !== null && nowMin >= start && nowMin <= end;
  const hours: number[] = [];
  for (let h = start / 60; h <= end / 60; h++) hours.push(h);
  const nowLeft = showNow ? pct(nowMin!) : 0;
  const anchor = nowLeft < 12 ? "translate-x-[-6px]" : nowLeft > 88 ? "-translate-x-[calc(100%-6px)]" : "-translate-x-1/2";
  return (
    <div className={showNow && big ? "pt-8" : ""}>
      <div className="relative">
        <div className={`relative w-full overflow-hidden rounded-lg border border-line bg-track/60 ${big ? "h-14" : "h-8"}`}
          role="img" aria-label={slots.length ? slots.map((s) => `${kindOf(s.type).long} ${fmtMin(mm(s.start))} to ${fmtMin(mm(s.end))}`).join(", ") : "Nothing scheduled"}>
          {hours.slice(1, -1).map((h) => <span key={h} aria-hidden className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${pct(h * 60)}%` }} />)}
          {slots.map((s, i) => {
            const a = mm(s.start), b = mm(s.end), w = pct(b) - pct(a), k = kindOf(s.type);
            return (
              <span key={i} className={`absolute inset-y-0 flex flex-col items-center justify-center overflow-hidden text-center leading-tight ${k.bar} ${big ? "text-[13px]" : "text-[11px]"}`}
                style={{ left: `${pct(a)}%`, width: `${Math.max(0.8, w)}%`, boxShadow: "inset 2px 0 0 rgb(var(--c-sheet)), inset -2px 0 0 rgb(var(--c-sheet))" }}>
                {w >= 8 && <span className="font-display font-bold">{k.short}</span>}
                {big && w >= 12 && <span className="hidden text-[11px] opacity-95 sm:block">{fmtMin(a).replace(" AM", "").replace(" PM", "")}-{fmtMin(b)}</span>}
              </span>
            );
          })}
        </div>
        {showNow && (
          <>
            <span aria-hidden className="absolute -inset-y-1 z-10 w-[3px] -translate-x-1/2 rounded-full bg-needle" style={{ left: `${nowLeft}%`, boxShadow: "0 0 0 1.5px rgb(var(--c-shadow) / .6)" }} />
            {big && <span aria-hidden className={`absolute -top-8 z-10 whitespace-nowrap rounded-md bg-needle px-2 py-0.5 text-[13px] font-bold text-ink ${anchor}`} style={{ left: `${nowLeft}%`, boxShadow: "0 0 0 1.5px rgb(var(--c-shadow) / .6)" }}>Now {fmtMin(nowMin!)}</span>}
          </>
        )}
      </div>
      {big && (
        <div aria-hidden className="relative mt-1 h-5 text-[12px] text-mute">
          {hours.map((h, i) => (
            <span key={h} className={`absolute whitespace-nowrap ${i === hours.length - 1 ? "-translate-x-full" : i === 0 ? "" : "-translate-x-1/2"} ${i % 2 ? "hidden sm:block" : ""}`} style={{ left: `${pct(h * 60)}%` }}>{h % 12 || 12}{h < 12 ? " AM" : " PM"}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function KeyRow() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[15px]">
      <li className="flex items-center gap-2"><span className="h-4 w-7 rounded bg-go" /><span><b>Meet</b> = consultation hour, you can visit</span></li>
      <li className="flex items-center gap-2"><span className="h-4 w-7 rounded bg-brand" /><span><b>Class</b> = teaching</span></li>
      <li className="flex items-center gap-2"><span className="h-4 w-7 rounded bg-violet" /><span><b>Admin</b> = admin duty</span></li>
      <li className="flex items-center gap-2"><span className="h-4 w-7 rounded border border-line bg-track/60" /><span>Empty = nothing scheduled</span></li>
    </ul>
  );
}
