"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import { TONE_DOT, TONE_TEXT, statusInfo } from "@/lib/status";
import type { Status, Suggestion } from "@/lib/types";
import { MicButton } from "./Voice";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bold the part of the name that matches what was typed: "Ny" -> **Ny**me Ahmed */
function Highlight({ text, q }: { text: string; q: string }) {
  const toks = q.trim().split(/\s+/).filter(Boolean).map(esc);
  if (!toks.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(\\b(?:${toks.join("|")}))`, "ig"));
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} className="text-brand">{p}</b> : <span key={i}>{p}</span>))}</>;
}

function suggestionLine(s: Suggestion) {
  const fake = { status: s.status, basis: s.basis, until: s.until, minutes_left: null, current: null, next: s.next_when ? { when: s.next_when, room: null } : null, reason: null, room: s.room, now: "" } as unknown as Status;
  return statusInfo(fake);
}

const TYPED = ["Nyme Ahmed", "When is Zasmin sir free?", "Where is room DN0921?", "Which notice is new?"];
/** Types example searches into the empty box, one after another. Stops when the person focuses or types. */
function useTyped(on: boolean) {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    if (!on || matchMedia("(prefers-reduced-motion: reduce)").matches) { setTxt(""); return; }
    let i = 0, n = 0, dir = 1, timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const w = TYPED[i];
      n += dir;
      setTxt(w.slice(0, n));
      if (dir === 1 && n === w.length) { dir = -1; timer = setTimeout(step, 1500); return; }
      if (dir === -1 && n === 0) { dir = 1; i = (i + 1) % TYPED.length; timer = setTimeout(step, 350); return; }
      timer = setTimeout(step, dir === 1 ? 70 : 28);
    };
    timer = setTimeout(step, 900);
    return () => clearTimeout(timer);
  }, [on]);
  return txt;
}

export default function SearchBox({ big = false, autoFocus = false }: { big?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const { t } = useLang();
  const id = useId();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const typed = useTyped(big && !focused && q === "");
  const dq = useDebounced(q, 120);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState("");
  const [voiceMsg, setVoiceMsg] = useState("");
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = dq.trim();
    if (!term) { setItems([]); setSearched(""); return; }
    const my = ++seq.current;
    api<{ items: Suggestion[] }>(`/api/search/suggest?q=${encodeURIComponent(term)}`)
      .then((r) => { if (my === seq.current) { setItems(r.items); setSearched(term); setActive(-1); } })
      .catch(() => { if (my === seq.current) { setItems([]); setSearched(term); } });
  }, [dq]);

  useEffect(() => {
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);

  const go = (i: number) => {
    if (i >= 0 && items[i]) { router.push(`/faculty/${items[i].id}`); setOpen(false); return; }
    const term = q.trim();
    if (!term) return;
    const isQuestion = /\?$/.test(term) || term.split(/\s+/).length >= 4;
    router.push(isQuestion ? `/ask?q=${encodeURIComponent(term)}` : `/faculty?q=${encodeURIComponent(term)}`);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(active); }
    else if (e.key === "Escape") setOpen(false);
  };

  const showList = open && q.trim().length > 0 && searched !== "";
  return (
    <div ref={box} className="relative min-w-0">
      <div className={`flex items-center gap-2 rounded-2xl border-2 border-edge bg-sheet pl-4 pr-1.5 shadow-[4px_4px_0_0_rgb(var(--c-shadow))] ${big ? "py-2" : "py-1"}`}>
        <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input id={id} role="combobox" aria-expanded={showList} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined} aria-label={t("search.placeholder")}
          autoFocus={autoFocus} autoComplete="off" spellCheck={false} enterKeyHint="search"
          value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setOpen(true); setFocused(true); }} onBlur={() => setFocused(false)} onKeyDown={onKey}
          placeholder={typed ? typed + "|" : t("search.placeholder")}
          className={`min-w-0 flex-1 bg-transparent font-display outline-none placeholder:text-mute focus-visible:outline-none ${big ? "py-2.5 text-xl" : "py-2 text-lg"}`} />
        <MicButton onText={(text) => {
          setVoiceMsg("");
          if (text.split(/\s+/).length >= 3) router.push(`/ask?q=${encodeURIComponent(text)}&voice=1`);
          else { setQ(text); setOpen(true); }
        }} onError={setVoiceMsg} />
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-[1.5rem] text-[15px] text-busy">{voiceMsg}</p>

      {showList && (
        <ul id={`${id}-list`} role="listbox" aria-label="Matching teachers"
          className="suggest-in absolute left-0 right-0 top-[calc(100%-1.25rem)] z-50 max-h-[70vh] overflow-auto rounded-xl border-2 border-edge bg-sheet shadow-[4px_4px_0_0_rgb(var(--c-shadow))]">
          {items.map((s, i) => {
            const info = suggestionLine(s);
            return (
              <li key={s.id} id={`${id}-o${i}`} role="option" aria-selected={i === active}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(i); }}
                style={{ ["--s" as string]: Math.min(i, 8) }}
                className={`suggest-row flex cursor-pointer items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0 ${i === active ? "bg-paper" : ""}`}>
                <div className="min-w-0">
                  <div className="truncate font-display text-lg font-semibold"><Highlight text={s.name} q={q} /></div>
                  <div className="truncate text-[15px] text-mute">{[s.faculty_code, s.department, s.room && `Room ${s.room}`].filter(Boolean).join(", ")}</div>
                </div>
                <div className="shrink-0 text-right text-[15px]">
                  <div className={`inline-flex items-center gap-1.5 font-display font-semibold ${TONE_TEXT[info.tone]}`}>
                    <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[info.tone]}`} />{t(info.label)}
                  </div>
                  <div className="text-mute">{s.status === "available" && s.until ? `until ${s.until}` : s.next_when ? `free ${s.next_when}` : ""}</div>
                </div>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-4 py-4 text-[15px]">
              No teacher matches “{searched}”. Check the spelling, or{" "}
              <a className="font-semibold text-brand underline" href={`/ask?q=${encodeURIComponent(searched)}`}>ask AIUB instead</a>.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
