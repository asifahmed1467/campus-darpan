"use client";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { canSpeak, listen, recordAndTranscribe, serverVoiceReady, speak, stopSpeaking, voiceBlocker } from "@/lib/speech";

export function MicButton({ onText, onError, className = "" }: { onText: (t: string) => void; onError?: (m: string) => void; className?: string }) {
  const { lang, t } = useLang();
  const [on, setOn] = useState(false);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  // The button always shows. Where voice typing can't work (Brave, Messenger, Firefox), tapping it explains what to do instead.
  return (
    <button type="button" aria-pressed={on} aria-label={on ? t("search.listening") : t("search.mic")} title={t("search.mic")}
      onClick={() => {
        if (on) { stop.current(); return; }    // second tap: stop and send what was recorded
        setOn(true); onError?.("");
        const done = () => setOn(false), err = (m: string) => onError?.(m);
        // Server voice typing first (works in every browser); the browser's own recognition if the server can't.
        let cancelled = false;
        stop.current = () => { cancelled = true; setOn(false); };
        serverVoiceReady().then((server) => {
          if (cancelled) return;
          if (server) { stop.current = recordAndTranscribe(lang, onText, done, err); return; }
          const blocked = voiceBlocker();
          if (blocked) { err(blocked); done(); return; }
          stop.current = listen(lang, onText, done, err);
        });
      }}
      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? "bg-busy text-white" : "bg-brand text-white hover:bg-inverse"} ${className}`}>
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
