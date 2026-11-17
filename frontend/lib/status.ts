import type { Key, TFn } from "./i18n";
import type { Status } from "./types";

export type Tone = "go" | "busy" | "violet" | "mute";
export interface StatusInfo { label: Key; tone: Tone; line: string; sub: string; main: string; extra: string }

export const TONE_TEXT: Record<Tone, string> = { go: "text-go", busy: "text-busy", violet: "text-violet", mute: "text-mute" };
export const TONE_DOT: Record<Tone, string> = { go: "bg-go", busy: "bg-busy", violet: "bg-violet", mute: "bg-mute" };

/** Without a translator (admin pages) the lines stay English. */
const EN: Record<string, string> = {
  "unit.min": "{n} min", "unit.h": "{n} h", "unit.h_min": "{h} h {m} min",
  "st.until_left": "Until {until} ({left} left)", "st.until": "Until {until}", "st.left": "{left} left", "st.room": "Room {room}",
  "st.free_at": "Free {when}", "st.free_at_room": "Free {when}, room {room}", "st.no_schedule_yet": "Schedule not available yet",
};
const plain: TFn = (k, v) => (EN[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(v?.[n] ?? ""));

export function statusInfo(st: Status, t: TFn = plain): StatusInfo {
  const mins = (m: number) => (m < 60 ? t("unit.min", { n: m }) : m % 60 ? t("unit.h_min", { h: Math.floor(m / 60), m: m % 60 }) : t("unit.h", { n: Math.floor(m / 60) }));
  const until = (u: string | null | undefined) => t("st.until", { until: u ?? "" });
  const nxt = st.next ? (st.next.room ? t("st.free_at_room", { when: st.next.when, room: st.next.room }) : t("st.free_at", { when: st.next.when })) : "";
  switch (st.status) {
    case "available":
      return { label: st.basis === "gap" ? "status.gap" : "status.available", tone: "go",
        line: t("st.until_left", { until: st.until ?? "", left: mins(st.minutes_left ?? 0) }), main: until(st.until),
        extra: t("st.left", { left: mins(st.minutes_left ?? 0) }), sub: st.room ? t("st.room", { room: st.room }) : "" };
    case "in_class": {
      const c = st.current;
      const what = c?.course ? `${c.course}${c.section ? ` ${c.section}` : ""}` : "";
      return { label: "status.in_class", tone: "busy", line: `${until(st.until)}${what ? `, ${what}` : ""}`, main: until(st.until), extra: what, sub: nxt };
    }
    case "admin":
      return { label: "status.admin", tone: "violet", line: until(st.until), main: until(st.until), extra: "", sub: nxt };
    case "unavailable":
      return { label: "status.unavailable", tone: "mute", line: st.reason ?? "", main: st.reason ?? "", extra: "", sub: nxt };
    case "off":
      return { label: "status.off", tone: "mute", line: st.reason ?? "", main: st.reason ?? "", extra: "", sub: nxt };
    default:
      return { label: "status.no_schedule", tone: "mute", line: st.reason ?? t("st.no_schedule_yet"), main: st.reason ?? t("st.no_schedule_yet"), extra: "", sub: "" };
  }
}
