"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import DayStrip from "@/components/DayStrip";
import { StatusLabel } from "@/components/FacultyRow";
import { MicButton, SpeakButton } from "@/components/Voice";
import { api, minutesOf } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { statusInfo } from "@/lib/status";
import type { AskResult } from "@/lib/types";

type Msg = { role: "me"; text: string } | { role: "bot"; res: AskResult; speak: boolean } | { role: "err"; text: string };
const SUGGEST = ["Latest notices", "What scholarships does AIUB offer?", "How do I add or drop a course?", "What CGPA do I need to graduate?", "Where is the AIUB campus?"];
interface Samples { topics: { topic: string; questions: string[] }[]; count: number }

function AskInner() {
  const { t } = useLang();
  const sp = useSearchParams();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState("");
  const [auto, setAuto] = useState(false);
  const [samples, setSamples] = useState<Samples | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => { api<Samples>("/api/ask/samples").then(setSamples).catch(() => setSamples(null)); }, []);
  useEffect(() => { try { setAuto(localStorage.getItem("aiub_autospeak") === "1"); } catch { /* ignore */ } }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const ask = useCallback(async (text: string, speak: boolean) => {
    const question = text.trim();
    if (!question || busy) return;
    setMsgs((m) => [...m, { role: "me", text: question }]);
    setQ(""); setBusy(true);
    try {
      const res = await api<AskResult>("/api/ask", { method: "POST", json: { question, at: new URLSearchParams(window.location.search).get("at") || undefined } });
      setMsgs((m) => [...m, { role: "bot", res, speak }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "err", text: (e as Error).message }]);
    } finally { setBusy(false); }
  }, [busy]);

  useEffect(() => {
    const first = sp.get("q");
    if (first && !started.current) { started.current = true; ask(first, sp.get("voice") === "1"); }
  }, [sp, ask]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <h1 className="text-4xl font-bold sm:text-5xl">{t("ask.title")}</h1>
      <p className="mt-2 text-mute">Ask when a teacher is free, where their room is, or what AIUB's pages say. Every answer shows where it came from.</p>

      <div className="mt-6 space-y-5" aria-live="polite">
        {msgs.length === 0 && (
          <div>
            <p className="mb-2 text-mute">For a teacher, just type their name: “When is Nyme sir free?”. Or try:</p>
            <div className="flex flex-wrap gap-2">{SUGGEST.map((s) => <button key={s} className="chip" onClick={() => ask(s, false)}>{s}</button>)}</div>
            {samples && (
              <details className="mt-5 rounded-2xl border border-line bg-sheet p-4">
                <summary className="cursor-pointer font-display text-lg font-semibold">All {samples.count} sample questions, by topic</summary>
                <div className="mt-3 space-y-4">
                  {samples.topics.map((g) => (
                    <div key={g.topic}>
                      <h2 className="font-display text-base font-bold text-brand">{g.topic}</h2>
                      <ul className="mt-1.5 flex flex-wrap gap-2">{g.questions.map((s) => <li key={s}><button className="chip !text-left" onClick={() => ask(s, false)}>{s}</button></li>)}</ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        {msgs.map((m, i) => m.role === "me" ? (
          <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-inverse px-4 py-3 text-white">{m.text}</div>
        ) : m.role === "err" ? (
          <div key={i} role="alert" className="rounded-2xl border-2 border-busy bg-sheet px-4 py-3 text-busy">{m.text}</div>
        ) : (
          <div key={i} className="max-w-[95%] rounded-2xl rounded-bl-sm border-2 border-edge bg-sheet p-4 shadow-[4px_4px_0_0_rgb(var(--c-shadow))]">
            <p className="text-lg">{m.res.answer}</p>
            {m.res.faculty && (
              <Link href={`/faculty/${m.res.faculty.id}`} className="mt-3 block rounded-xl border border-line bg-paper p-3 hover:border-brand">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display text-lg font-semibold">{m.res.faculty.name}</span><StatusLabel f={m.res.faculty} />
                </div>
                <p className="mb-2 text-[15px] text-mute">{statusInfo(m.res.faculty.status).line}</p>
                <DayStrip blocks={m.res.faculty.today} nowMin={minutesOf(m.res.faculty.status.now)} />
              </Link>
            )}
            {m.res.sources.length > 0 && (
              <div className="mt-3">
                <p className="text-[15px] font-semibold text-mute">{t("ask.sources")}</p>
                <ul className="mt-1 space-y-1">
                  {m.res.sources.map((s, j) => (
                    <li key={j}>{s.url.startsWith("/") ? <Link className="text-brand underline" href={s.url}>{s.title}</Link>
                      : <a className="text-brand underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3"><SpeakButton text={m.res.answer} autoPlay={m.speak || (auto && i === msgs.length - 1)} /></div>
          </div>
        ))}
        {busy && <div aria-label="Looking for an answer" className="w-fit rounded-2xl border border-line bg-sheet px-4 py-3"><span className="skeleton inline-block h-4 w-24 align-middle" /></div>}
        <div ref={end} className="scroll-mb-44" />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(q, false); }} className="sticky bottom-[68px] z-20 mt-6 bg-paper pb-3 pt-2 md:bottom-0">
        <div className="flex items-center gap-2 rounded-2xl border-2 border-edge bg-sheet py-1.5 pl-4 pr-1.5 shadow-[4px_4px_0_0_rgb(var(--c-shadow))]">
          <label htmlFor="ask" className="sr-only">{t("ask.placeholder")}</label>
          <input id="ask" className="min-w-0 flex-1 bg-transparent py-2 font-display text-lg outline-none placeholder:text-mute focus-visible:outline-none" value={q} maxLength={300} autoComplete="off"
            onChange={(e) => setQ(e.target.value)} placeholder={t("ask.placeholder")} enterKeyHint="send" />
          <MicButton onText={(text) => { setVoiceMsg(""); ask(text, true); }} onError={setVoiceMsg} />
          <button className="btn btn-primary" type="submit" disabled={busy || !q.trim()}>{t("ask.send")}</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[15px]">
          <p role="status" className="text-busy">{voiceMsg}</p>
          <label className="flex items-center gap-2 text-mute"><input type="checkbox" className="h-5 w-5 accent-brand" checked={auto}
            onChange={(e) => { setAuto(e.target.checked); try { localStorage.setItem("aiub_autospeak", e.target.checked ? "1" : "0"); } catch { /* ignore */ } }} />Read answers aloud</label>
        </div>
      </form>
    </div>
  );
}

export default function AskPage() {
  return <Suspense fallback={<div className="skeleton h-40" />}><AskInner /></Suspense>;
}
