"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import type { Notice } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function NoticeList({ items, freshIds = [] }: { items: Notice[]; freshIds?: number[] }) {
  if (!items.length) return <p className="py-6 text-mute">No notices to show yet. New AIUB notices appear here within minutes of being posted.</p>;
  return (
    <ul>
      {items.map((n) => {
        const d = n.date ? new Date(n.date + "T12:00:00") : null;
        const external = /^https?:/.test(n.url) && !n.url.includes("example.invalid");
        const fresh = freshIds.includes(n.id);
        return (
          <li key={n.id} className="grid grid-cols-[3.5rem_1fr] gap-x-4 border-t border-line py-4 first:border-t-0">
            <div className="text-center leading-none">
              <div className="font-display text-3xl font-bold">{d ? d.getDate() : "–"}</div>
              <div className="mt-1 text-sm text-mute">{d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ""}</div>
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-semibold leading-snug">
                {external ? <a className="hover:underline focus-visible:underline" href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a> : n.title}
                {fresh && <span className="ml-2 rounded bg-needle px-1.5 py-0.5 align-middle text-xs font-bold text-ink">New</span>}
                {n.source === "demo" && <span className="ml-2 rounded border border-line px-1.5 py-0.5 align-middle text-xs font-medium text-mute">Sample</span>}
              </h3>
              {n.summary && <p className="mt-1 text-[15px] text-mute">{n.summary}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">{n.tags.map((t) => <span key={t} className="rounded-full bg-track px-2.5 py-0.5 text-sm">{t}</span>)}</div>
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
    const es = new EventSource(API + "/api/notices/stream");
    let timer: ReturnType<typeof setTimeout>;
    es.addEventListener("notice", (e) => {
      try {
        const n: Notice = JSON.parse((e as MessageEvent).data).notice;
        window.dispatchEvent(new CustomEvent("aiub:notice", { detail: n }));
        setToast(n);
        clearTimeout(timer);
        timer = setTimeout(() => setToast(null), 9000);
        if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification("New AIUB notice", { body: n.title, icon: "/icon.svg" });
      } catch { /* ignore malformed event */ }
    });
    return () => { es.close(); clearTimeout(timer); };
  }, []);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="toast fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-xl border-2 border-edge bg-sheet p-4 shadow-[4px_4px_0_0_rgb(var(--c-shadow))] md:bottom-6 md:left-auto md:right-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-full bg-needle ring-2 ring-ink" />
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold">New notice</p>
          <p className="text-[15px]">{toast.title}</p>
          <a className="mt-1 inline-block font-semibold text-brand underline" href="/notices">Read it</a>
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper" aria-label="Dismiss" onClick={() => setToast(null)}>✕</button>
      </div>
    </div>
  );
}
