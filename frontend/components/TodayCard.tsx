"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/hooks";

type Line = { text: string; url: string; when?: string };
type Road = { road: string; level: "smooth" | "slow" | "heavy" | "closed"; minutes: number; usual_min: number; delay_min: number; km: number };
type Today = {
  date: string; weekday: string; semester: string | null; week: { week: number; of: number } | null;
  holiday_today: string | null; next_holiday: { name: string; date: string; days: number } | null;
  dated: Line[]; new_notices: Line[]; weekend: boolean;
  weather: { text: string | null; now_temp: number | null; max_temp: number | null; rain: number | null } | null;
  traffic: Road[] | null; traffic_source?: string | null; traffic_at?: string | null;
};

const ROAD_TONE: Record<Road["level"], string> = {
  smooth: "bg-go/15 text-go", slow: "bg-needle/25 text-warn", heavy: "bg-busy/15 text-busy", closed: "bg-busy text-white",
};
const ROAD_WORD: Record<Road["level"], string> = { smooth: "Clear", slow: "Slow", heavy: "Heavy", closed: "Closed" };

function Row({ icon, children, tone = "" }: { icon: React.ReactNode; children: React.ReactNode; tone?: string }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span aria-hidden className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone || "bg-track text-ink"}`}>{icon}</span>
      <div className="min-w-0 flex-1 text-[16px] leading-snug">{children}</div>
    </li>
  );
}
const I = (d: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICON = {
  exam: I("M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2l4-4"),
  rain: I("M7 18a4.6 4.4 0 0 1 0-9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7M11 13v2m0 3v2m4-5v2m0 3v2"),
  sun: I("M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 12h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.1-.7l-.7.7"),
  party: I("M4 5h2M5 4v2M11.5 4l-.5 2M18 5h2M19 4v2M15 9l-1 1M18 13l2-.5M18 19h2M19 18v2M14 16.5l-6.5-6.5l-4.8 10.5a.7.7 0 0 0 .9.9z"),
  bell: I("M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1"),
  road: I("M4 19l4-14M16 5l4 14M12 6v2M12 11v2M12 16v2"),
  calm: I("M5 12l5 5L20 7"),
};

export default function TodayCard() {
  const q = useLive(() => api<Today>("/api/today"), [], 300_000);
  const [shared, setShared] = useState("");
  const t = q.data;
  if (q.loading && !t) return <div className="skeleton h-48 rounded-2xl" aria-label="Loading today's briefing" />;
  if (!t) return null;

  const dateLabel = new Date(t.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const quiet = !t.holiday_today && !t.dated.length && !t.new_notices.length;
  const heavy = (t.traffic ?? []).filter((r) => r.level === "heavy" || r.level === "closed");

  const share = async () => {
    const parts = [`AIUB Today, ${dateLabel}`];
    if (t.holiday_today) parts.push(`Holiday: ${t.holiday_today}`);
    t.dated.forEach((d) => parts.push(d.text));
    if (t.weather?.text) parts.push(t.weather.text);
    if (t.traffic?.length) parts.push(`Drive to AIUB now: ${t.traffic.map((r) => `${r.road.replace(" to AIUB", "")} ${r.minutes} min`).join(", ")}`);
    parts.push(location.origin);
    const text = parts.join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "AIUB Today", text });
      else { await navigator.clipboard.writeText(text); setShared("Copied. Paste it in your group."); setTimeout(() => setShared(""), 3000); }
    } catch { /* closed the share sheet */ }
  };

  return (
    <section aria-labelledby="today-h" className="rounded-2xl border-2 border-edge bg-sheet p-4 shadow-[6px_6px_0_0_rgb(var(--c-shadow))] sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="today-h" className="text-2xl font-bold">AIUB Today</h2>
        <p className="font-display font-semibold text-mute">
          {dateLabel}{t.week ? ` · Week ${t.week.week} of ${t.week.of}` : ""}
        </p>
      </div>

      <ul className="mt-2 divide-y divide-line">
        {t.holiday_today && <Row icon={ICON.party} tone="bg-go/15 text-go"><b className="font-display">Holiday today:</b> {t.holiday_today}. No classes.</Row>}
        {!t.holiday_today && t.weekend && <Row icon={ICON.party} tone="bg-go/15 text-go">It&apos;s the weekend. No regular classes today.</Row>}
        {t.dated.map((d) => (
          <Row key={d.text} icon={ICON.exam} tone={d.when === "today" ? "bg-busy/15 text-busy" : "bg-needle/25 text-warn"}>
            <b className="font-display">{d.text}</b>{" "}
            <a className="whitespace-nowrap font-semibold text-brand underline" href={d.url} target="_blank" rel="noopener noreferrer">Open notice</a>
          </Row>
        ))}
        {t.weather?.text && (
          <Row icon={t.weather.rain ? ICON.rain : ICON.sun} tone={t.weather.rain && t.weather.rain >= 60 ? "bg-brand/15 text-brand" : ""}>
            {t.weather.text}{t.weather.now_temp != null && <span className="text-mute"> Now {t.weather.now_temp}°C.</span>}
          </Row>
        )}
        {t.traffic && t.traffic.length > 0 && (
          <Row icon={ICON.road} tone={heavy.length ? "bg-busy/15 text-busy" : "bg-go/15 text-go"}>
            <p className="font-display font-semibold">{heavy.length ? `Heavy traffic on ${heavy.length} route${heavy.length > 1 ? "s" : ""} to campus` : "Drive times to campus right now"}</p>
            <ul className="mt-1.5 space-y-1">
              {t.traffic.map((r) => (
                <li key={r.road} className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="min-w-0 truncate">{r.road}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <b className="font-display">{r.minutes} min</b>
                    {r.delay_min > 0 && <span className="text-mute">(usually {r.usual_min})</span>}
                    <span className={`rounded-full px-2 py-0.5 font-display text-xs font-bold ${ROAD_TONE[r.level]}`}>{ROAD_WORD[r.level]}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-mute">{t.traffic_at && <b className="font-display text-ink">Live, updated {t.traffic_at}. </b>}
              Drive times by car or CNG from {t.traffic_source ?? "the map service"}, based on road speeds seen in the last 15 minutes. &quot;Usually&quot; is the normal time for this hour; when there is a jam, the live time rises above it.</p>
          </Row>
        )}
        {t.new_notices.length > 0 && (
          <Row icon={ICON.bell}>
            <p className="font-display font-semibold">{t.new_notices.length} new notice{t.new_notices.length > 1 ? "s" : ""} since yesterday</p>
            <ul className="mt-1 space-y-0.5 text-[15px]">
              {t.new_notices.map((n) => <li key={n.url}><a className="hover:underline" href={n.url} target="_blank" rel="noopener noreferrer">{n.text}</a></li>)}
            </ul>
          </Row>
        )}
        {quiet && !t.weekend && <Row icon={ICON.calm} tone="bg-go/15 text-go">Normal class day. No exams or holidays today.</Row>}
        {t.next_holiday && (
          <Row icon={ICON.party}>
            Next holiday: <b className="font-display">{t.next_holiday.name}</b>,{" "}
            {new Date(t.next_holiday.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
            <span className="text-mute"> ({t.next_holiday.days === 1 ? "tomorrow" : `in ${t.next_holiday.days} days`})</span>
          </Row>
        )}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button type="button" className="btn btn-quiet !min-h-[40px] !py-1.5" onClick={share}>Share today</button>
        <span role="status" className="text-sm text-go">{shared}</span>
      </div>
    </section>
  );
}
