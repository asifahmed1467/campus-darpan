import type { Key } from "./i18n";
import type { Status } from "./types";

export type Tone = "go" | "busy" | "violet" | "mute";
export interface StatusInfo { label: Key; tone: Tone; line: string; sub: string; main: string; extra: string }

export const TONE_TEXT: Record<Tone, string> = { go: "text-go", busy: "text-busy", violet: "text-violet", mute: "text-mute" };
export const TONE_DOT: Record<Tone, string> = { go: "bg-go", busy: "bg-busy", violet: "bg-violet", mute: "bg-mute" };

const mins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

export function statusInfo(st: Status): StatusInfo {
  const nxt = st.next ? `Free ${st.next.when}${st.next.room ? `, room ${st.next.room}` : ""}` : "";
  switch (st.status) {
    case "available":
      return { label: st.basis === "gap" ? "status.gap" : "status.available", tone: "go",
        line: `Until ${st.until} (${mins(st.minutes_left ?? 0)} left)`, main: `Until ${st.until}`,
        extra: `${mins(st.minutes_left ?? 0)} left`, sub: st.room ? `Room ${st.room}` : "" };
    case "in_class": {
      const c = st.current;
      const what = c?.course ? `${c.course}${c.section ? ` ${c.section}` : ""}` : "";
      return { label: "status.in_class", tone: "busy", line: `Until ${st.until}${what ? `, ${what}` : ""}`, main: `Until ${st.until}`, extra: what, sub: nxt };
    }
    case "admin":
      return { label: "status.admin", tone: "violet", line: `Until ${st.until}`, main: `Until ${st.until}`, extra: "", sub: nxt };
    case "unavailable":
      return { label: "status.unavailable", tone: "mute", line: st.reason ?? "", main: st.reason ?? "", extra: "", sub: nxt };
    case "off":
      return { label: "status.off", tone: "mute", line: st.reason ?? "", main: st.reason ?? "", extra: "", sub: nxt };
    default:
      return { label: "status.no_schedule", tone: "mute", line: st.reason ?? "Schedule not available yet", main: st.reason ?? "Schedule not available yet", extra: "", sub: "" };
  }
}
