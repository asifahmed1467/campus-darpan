import { fmtMin } from "@/lib/api";
import type { WeekDay } from "@/lib/types";

const HOUR_PX = 52;
const DAY_NAME: Record<string, string> = { SUN: "Sun", MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat" };
const STYLE: Record<string, string> = {
  CLASS: "bg-brand text-white", CONSULTATION: "bg-go text-white", ADMIN: "bg-violet text-white",
};
const mm = (s: string) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3, 5), 10);

export interface GridSlot { start: string; end: string; type: string; course?: string | null; section?: string | null; room?: string | null; label?: string | null }

/** Weekly timetable like the one printed on a teacher's door. Today's column is tinted and carries the "now" line. */
export default function WeekGrid({ week, todayKey, nowMin }: { week: { day: string; slots: GridSlot[] }[] | WeekDay[]; todayKey?: string; nowMin?: number | null }) {
  const days = week.filter((d) => ["SUN", "MON", "TUE", "WED", "THU"].includes(d.day) || d.slots.length);
  const all = days.flatMap((d) => d.slots);
  const start = 480;
  const end = Math.max(1020, Math.ceil(Math.max(0, ...all.map((s) => mm(s.end))) / 60) * 60);
  const hours: number[] = [];
  for (let h = start / 60; h < end / 60; h++) hours.push(h);
  const height = hours.length * HOUR_PX;
  const y = (m: number) => ((m - start) / 60) * HOUR_PX;

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-sheet">
      <div className="min-w-[560px]">
        <div className="grid" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => (
            <div key={d.day} className={`border-l border-line py-2 text-center font-display font-semibold ${d.day === todayKey ? "bg-needle/25" : ""}`}>
              {DAY_NAME[d.day]}{d.day === todayKey && <span className="sr-only"> (today)</span>}
            </div>
          ))}
          <div className="relative border-t border-line" style={{ height }}>
            {hours.map((h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-xs text-mute" style={{ top: y(h * 60) + (h === hours[0] ? 8 : 0) }}>{h % 12 || 12} {h < 12 ? "AM" : "PM"}</span>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.day} className={`relative border-l border-t border-line ${d.day === todayKey ? "bg-needle/10" : ""}`} style={{ height }}>
              {hours.map((h) => <span key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: y(h * 60) }} />)}
              {d.slots.map((s, i) => {
                const a = mm(s.start), b = mm(s.end);
                const title = s.type === "CONSULTATION" ? "Consultation" : s.type === "ADMIN" ? (s.label ?? "Admin duty") : [s.course, s.section && `[${s.section}]`].filter(Boolean).join(" ") || "Class";
                return (
                  <div key={i} className={`absolute inset-x-[3px] overflow-hidden rounded-md px-1.5 py-1 text-[12px] leading-tight shadow-[0_0_0_1.5px_rgb(var(--c-sheet))] ${STYLE[s.type] ?? "bg-mute text-white"}`}
                    style={{ top: y(a), height: Math.max(20, ((b - a) / 60) * HOUR_PX - 1.5) }}
                    title={`${title}, ${fmtMin(a)} to ${fmtMin(b)}${s.room ? `, room ${s.room}` : ""}`}>
                    <div className="font-semibold">{title}</div>
                    <div className="opacity-90">{fmtMin(a).replace(" AM", "").replace(" PM", "")}–{fmtMin(b)}</div>
                    {s.room && <div className="opacity-90">Room {s.room}</div>}
                  </div>
                );
              })}
              {d.day === todayKey && nowMin != null && nowMin >= start && nowMin <= end && (
                <span aria-hidden className="absolute inset-x-0 z-10 h-[3px] bg-needle shadow-[0_0_0_1px_rgb(var(--c-shadow))]" style={{ top: y(nowMin) - 1 }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-mute">
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded bg-brand" />Class</li>
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded bg-go" />Consultation hour</li>
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded bg-violet" />Admin duty</li>
      <li className="flex items-center gap-2"><span className="h-3 w-1 rounded bg-needle ring-1 ring-ink" />Now</li>
    </ul>
  );
}
