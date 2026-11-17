"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { playChime, unlockAudio } from "@/lib/sound";
import { useLang } from "@/lib/i18n";
import type { Notice } from "@/lib/types";

export function NoticeList({ items, freshIds = [] }: { items: Notice[]; freshIds?: number[] }) {
  const { t, num, date } = useLang();
  if (!items.length) return <p className="py-6 text-mute">{t("notice.empty")}</p>;
  return (
    <ul>
      {items.map((n) => {
        const d = n.date ? new Date(n.date + "T12:00:00") : null;
        const external = /^https?:/.test(n.url) && !n.url.includes("example.invalid");
        const fresh = freshIds.includes(n.id);
        return (
          <li key={n.id} id={`n${n.id}`} className="scroll-mt-24 grid grid-cols-[3.5rem_1fr] gap-x-4 border-t border-line py-4 first:border-t-0">
            <div className="text-center leading-none">
              <div className="font-display text-3xl font-bold">{d ? num(d.getDate()) : "–"}</div>
              <div className="mt-1 text-sm text-mute">{n.date ? date(n.date, { month: "short", year: "numeric" }) : ""}</div>
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-semibold leading-snug">
                {external ? <a className="hover:underline focus-visible:underline" href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a> : n.title}
                {fresh && <span className="ml-2 rounded bg-needle px-1.5 py-0.5 align-middle text-xs font-bold text-ink">{t("notice.new")}</span>}
                {n.source === "demo" && <span className="ml-2 rounded border border-line px-1.5 py-0.5 align-middle text-xs font-medium text-mute">{t("notice.sample")}</span>}
              </h3>
              {n.summary && <p className="mt-1 text-base text-mute">{n.summary}</p>}
              {external && (
                <p className="mt-1 flex flex-wrap gap-x-4 text-base">
                  <a className="font-semibold text-brand underline" href={n.url} target="_blank" rel="noopener noreferrer">{t("notice.read")}</a>
                  {n.attachment_url && <a className="font-semibold text-brand underline" href={n.attachment_url} target="_blank" rel="noopener noreferrer">{t("notice.pdf")}</a>}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">{n.tags.map((tag) => <span key={tag} className="rounded-full bg-track px-2.5 py-0.5 text-base">{tag}</span>)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Listens for new notices pushed by the server and shows a toast (plus a system notification if allowed). */
export function NoticeAlert() {
  const [toast, setToast] = useState<Notice | null>(null);
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    const es = new EventSource(API + "/api/notices/stream");
    let timer: ReturnType<typeof setTimeout>;
    es.addEventListener("notice", (e) => {
      try {
        const n: Notice = JSON.parse((e as MessageEvent).data).notice;
        window.dispatchEvent(new CustomEvent("aiub:notice", { detail: n }));
        setToast(n);
        playChime();
        clearTimeout(timer);
        timer = setTimeout(() => setToast(null), 9000);
        if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification("New AIUB notice", { body: n.title, icon: "/icon.svg" });
      } catch { /* ignore malformed event */ }
    });
    return () => { es.close(); clearTimeout(timer); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  if (!toast) return null;
  return (
    <div key={toast.id} role="status" aria-live="polite" className="toast relative overflow-hidden fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-xl neu-raised p-4 md:bottom-6 md:left-auto md:right-6">
      <div className="flex items-start gap-3">
        <svg aria-hidden className="bell mt-0.5 shrink-0 text-needle" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="rgb(var(--c-ink))" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3a6 6 0 00-6 6c0 5-2 6-2 7h16c0-1-2-2-2-7a6 6 0 00-6-6z" /><path d="M10 19a2 2 0 004 0" fill="none" strokeLinecap="round" /></svg>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold">New notice</p>
          <p className="text-[15px]">{toast.title}</p>
          <a className="mt-1 inline-block font-semibold text-brand underline" href="/notices">Read it</a>
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper" aria-label="Dismiss" onClick={() => setToast(null)}>✕</button>
      </div>
      <span aria-hidden className="toast-timer absolute inset-x-0 bottom-0 h-1 bg-needle" />
    </div>
  );
}
