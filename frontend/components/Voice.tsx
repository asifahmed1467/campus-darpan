"use client";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "@/lib/speech";

export function MicButton({ onText, onError, className = "" }: { onText: (t: string) => void; onError?: (m: string) => void; className?: string }) {
  const { lang, t } = useLang();
  const [on, setOn] = useState(false);
  const stop = useRef<() => void>(() => {});
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk(canListen()); return () => stop.current(); }, []);

  if (!ok) return null; // browsers without speech recognition simply don't get the button
  return (
    <button type="button" aria-pressed={on} aria-label={on ? t("search.listening") : t("search.mic")} title={t("search.mic")}
      onClick={() => {
        if (on) { stop.current(); setOn(false); return; }
        setOn(true);
        stop.current = listen(lang, onText, () => setOn(false), (m) => onError?.(m));
      }}
      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? "bg-busy text-white" : "bg-brand text-white hover:bg-ink"} ${className}`}>
      {on && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-busy/40 motion-reduce:hidden" />}
      <svg className="relative" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" />
      </svg>
    </button>
  );
}

export function SpeakButton({ text, autoPlay = false }: { text: string; autoPlay?: boolean }) {
  const { t } = useLang();
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    setOk(canSpeak());
    if (autoPlay && canSpeak()) { setOn(true); speak(text, () => setOn(false)); }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (!ok) return null;
  return (
    <button type="button" className="btn btn-quiet !min-h-[40px] !px-3 !py-1.5 text-[15px]" aria-pressed={on}
      onClick={() => { if (on) { stopSpeaking(); setOn(false); } else { setOn(true); speak(text, () => setOn(false)); } }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />{on ? <path d="M17 8l4 8M21 8l-4 8" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
      </svg>
      {on ? t("stop") : t("listen")}
    </button>
  );
}
