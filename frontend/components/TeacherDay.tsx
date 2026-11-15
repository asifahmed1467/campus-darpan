import { fmtMin } from "@/lib/api";
import type { WeekDay, WeekSlot } from "@/lib/types";
import { Bar, KeyRow, kindOf, mm, windowOf } from "./Timeline";

const FULL: Record<string, string> = { SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday" };
const SHORT: Record<string, string> = { SUN: "Sun", MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat" };

function title(s: WeekSlot) {
  if (s.type === "CONSULTATION") return "Consultation hour";
  if (s.type === "ADMIN") return s.label ?? "Admin duty";
  return [s.course, s.section && `[${s.section}]`].filter(Boolean).join(" ") || "Class";
}

/** Today in one look: a labelled bar, then every block in plain words. */
export function TodayPanel({ week, todayKey, nowMin, officeRoom }: { week: WeekDay[]; todayKey: string; nowMin: number | null; officeRoom: string | null }) {
  const slots = (week.find((d) => d.day === todayKey)?.slots ?? []).slice().sort((a, b) => mm(a.start) - mm(b.start));
  const { start, end } = windowOf([slots]);
  const meets = slots.filter((s) => s.type === "CONSULTATION");
  return (
    <div>
      <h3 className="font-display text-xl font-bold">Today, {FULL[todayKey] ?? todayKey}</h3>
      {meets.length > 0 && (
        <p className="mt-1 text-lg">
          <span className="font-semibold text-go">You can meet them: </span>
          {meets.map((s) => `${fmtMin(mm(s.start))} to ${fmtMin(mm(s.end))}`).join(" and ")}
          {(meets[0].room || officeRoom) && <span className="text-mute"> in room {meets[0].room || officeRoom}</span>}
        </p>
      )}
      <div className="mt-3"><Bar slots={slots} start={start} end={end} nowMin={nowMin} big /></div>
      {slots.length === 0 ? <p className="mt-3 text-mute">Nothing is scheduled today.</p> : (
        <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-paper">
          {slots.map((s, i) => {
            const a = mm(s.start), b = mm(s.end), k = kindOf(s.type);
            const now = nowMin !== null && nowMin >= a && nowMin < b, past = nowMin !== null && nowMin >= b;
            return (
              <li key={i} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 ${now ? "bg-needle/25" : ""} ${past ? "opacity-55" : ""}`}>
                <span className={`h-3 w-3 shrink-0 rounded-sm ${k.dot}`} aria-hidden />
                <span className="font-display font-semibold tabular-nums">{fmtMin(a)} to {fmtMin(b)}</span>
                <span className={s.type === "CONSULTATION" ? "font-semibold text-go" : ""}>{title(s)}</span>
                {s.room && <span className="text-mute">Room {s.room}</span>}
                {now && <span className="ml-auto rounded-md bg-needle px-2 py-0.5 text-[13px] font-bold text-ink">Now</span>}
                {past && <span className="ml-auto text-[13px] text-mute">Done</span>}
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-3"><KeyRow /></div>
    </div>
  );
}

/** The whole week as one row per day, with the meeting times written out on the right. */
export function WeekGlance({ week, todayKey, nowMin }: { week: WeekDay[]; todayKey: string; nowMin: number | null }) {
  const days = week.filter((d) => ["SUN", "MON", "TUE", "WED", "THU"].includes(d.day) || d.slots.length);
  const { start, end } = windowOf(days.map((d) => d.slots));
  const hours: number[] = [];
  for (let h = start / 60; h <= end / 60; h += 1) hours.push(h);
  const span = end - start;
  return (
    <div className="rounded-2xl border border-line bg-sheet p-3 sm:p-4">
      <div className="hidden grid-cols-[5.5rem_1fr_15.5rem] gap-3 sm:grid" aria-hidden>
        <span />
        <div className="relative h-4 text-[12px] text-mute">{hours.filter((_, i) => i % 2 === 0).map((h) => <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h * 60 - start) / span) * 100}%` }}>{h % 12 || 12}{h < 12 ? " AM" : " PM"}</span>)}</div>
        <span className="text-[13px] font-semibold text-mute">When to meet</span>
      </div>
      <ul className="mt-1 space-y-2">
        {days.map((d) => {
          const slots = d.slots.slice().sort((a, b) => mm(a.start) - mm(b.start));
          const meets = slots.filter((s) => s.type === "CONSULTATION");
          const today = d.day === todayKey;
          return (
            <li key={d.day} className={`grid items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2 sm:grid-cols-[5.5rem_1fr_15.5rem] ${today ? "bg-needle/20 ring-2 ring-needle" : ""}`}>
              <div className="font-display font-bold">{SHORT[d.day]}{today && <span className="ml-1.5 rounded bg-needle px-1.5 py-0.5 text-[11px] text-ink">Today</span>}</div>
              <Bar slots={slots} start={start} end={end} nowMin={today ? nowMin : null} />
              <div className="text-[15px] leading-snug">
                {meets.length ? meets.map((s, i) => <div key={i} className="font-semibold text-go">Meet {fmtMin(mm(s.start))} to {fmtMin(mm(s.end))}{s.room ? <span className="whitespace-nowrap font-normal text-mute"> · {s.room}</span> : ""}</div>)
                  : slots.length ? <span className="text-mute">No consultation hour</span> : <span className="text-mute">Nothing scheduled</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3"><KeyRow /></div>
    </div>
  );
}
