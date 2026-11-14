"use client";
// Voice runs in the student's own browser (free, and no load on our server).

type Rec = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function ctor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => ctor() !== null;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function listen(lang: "en" | "bn", onText: (t: string) => void, onEnd: () => void, onError: (msg: string) => void): () => void {
  const C = ctor();
  if (!C) { onError("Voice input isn't supported in this browser. Try Chrome."); onEnd(); return () => {}; }
  const r = new C();
  r.lang = lang === "bn" ? "bn-BD" : "en-US";
  r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
  r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) onText(t.trim()); };
  r.onerror = (e) => {
    onError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access is blocked. Allow it in the browser's site settings."
      : e.error === "no-speech" ? "I didn't hear anything. Tap the mic and try again."
      : e.error === "network" ? "Voice input needs an internet connection." : "Voice input stopped. Try again.");
  };
  r.onend = onEnd;
  try { r.start(); } catch { onEnd(); }
  return () => { try { r.abort(); } catch { /* ignore */ } };
}

const hasBangla = (s: string) => /[ঀ-৿]/.test(s);

export function speak(text: string, onEnd?: () => void) {
  if (!canSpeak()) { onEnd?.(); return; }
  const s = window.speechSynthesis;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = hasBangla(text) ? "bn-BD" : "en-US";
  u.rate = 0.95;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  s.speak(u);
}

export function stopSpeaking() { if (canSpeak()) window.speechSynthesis.cancel(); }
