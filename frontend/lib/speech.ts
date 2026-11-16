"use client";
import { API } from "./api";
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

// ---- Server voice typing (works in every browser, Brave and Messenger included) --------------
// The phone records a short clip; the server turns it into text with Whisper. Used whenever the server has it set up.
let serverVoice: Promise<boolean> | null = null;
export function serverVoiceReady(): Promise<boolean> {
  serverVoice ??= fetch(`${API}/api/voice/status`).then((r) => r.json()).then((j) => !!j.server).catch(() => false);
  return serverVoice;
}

function pickMime(): string {
  const M = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!M) return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (M.isTypeSupported?.(t)) return t;
  return "";
}

/** Record until the student stops talking (or 12 s), then send to the server. Returns a function that stops early. */
export function recordAndTranscribe(lang: "en" | "bn", onText: (t: string) => void, onEnd: () => void, onError: (msg: string) => void): () => void {
  let stopped = false, rec: MediaRecorder | null = null, stream: MediaStream | null = null, ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined, raf = 0;
  const cleanup = () => { clearTimeout(timer); cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => {}); };
  const stop = () => { if (stopped) return; stopped = true; try { if (rec && rec.state !== "inactive") rec.stop(); else { cleanup(); onEnd(); } } catch { cleanup(); onEnd(); } };

  (async () => {
    if (!navigator.mediaDevices?.getUserMedia || !(window as unknown as { MediaRecorder?: unknown }).MediaRecorder) {
      onError("This browser can't record sound. Open the page in Chrome, or type your question."); onEnd(); return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as { name?: string }).name;
      onError(name === "NotAllowedError" ? "Microphone access is blocked. Allow the microphone for this site in your browser settings."
        : name === "NotFoundError" ? "No microphone was found." : "Couldn't open the microphone. Try again.");
      onEnd(); return;
    }
    if (stopped) { cleanup(); onEnd(); return; }
    const mime = pickMime();
    rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      cleanup();
      const type = rec?.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size < 1500) { onError("I didn't hear anything. Tap the mic and try again."); onEnd(); return; }
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData(); form.append("audio", blob, `speech.${ext}`); form.append("lang", lang);
      try {
        const r = await fetch(`${API}/api/voice/transcribe`, { method: "POST", body: form });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) onError(j.detail || "Voice typing didn't work. Try again or type your question.");
        else if (j.text) onText(String(j.text).trim());
        else onError("I couldn't make out the words. Try again a little closer to the mic.");
      } catch { onError("Voice typing needs an internet connection."); }
      onEnd();
    };
    rec.start();
    timer = setTimeout(stop, 12000);
    // stop by itself after about 1.5 s of quiet once the student has started speaking
    try {
      ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let spoke = false, quietSince = 0;
      const t0 = performance.now();
      const tick = () => {
        if (stopped) return;
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += (v - 128) * (v - 128);
        const level = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (level > 6) { spoke = true; quietSince = 0; } else if (spoke) { quietSince ||= now; if (now - quietSince > 1500) { stop(); return; } }
        if (!spoke && now - t0 > 6000) { stop(); return; }   // nothing said at all
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch { /* no silence detection: the 12 s limit or a second tap stops it */ }
  })();
  return stop;
}

/** Browsers where voice typing cannot work, with a plain reason the student can act on. */
export function voiceBlocker(): string | null {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|WhatsApp/i.test(ua))
    return "Voice doesn't work inside Messenger or Facebook. Tap ⋯ and choose Open in Chrome (or your browser), then try the mic.";
  if ((navigator as unknown as { brave?: unknown }).brave)
    return "Brave blocks voice typing. Open this page in Chrome or Edge to use the mic, or type your question.";
  if (!ctor()) return /iPhone|iPad/i.test(ua)
    ? "Voice typing needs Safari with Siri turned on (Settings → Siri). Or type your question."
    : "Voice typing isn't supported in this browser. Open this page in Chrome or Edge, or type your question.";
  return null;
}

export function listen(lang: "en" | "bn", onText: (t: string) => void, onEnd: () => void, onError: (msg: string) => void): () => void {
  const C = ctor();
  const blocked = voiceBlocker();
  if (!C || blocked) { onError(blocked ?? "Voice typing isn't supported in this browser. Try Chrome."); onEnd(); return () => {}; }
  const r = new C();
  r.lang = lang === "bn" ? "bn-BD" : "en-US";
  r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
  r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) onText(t.trim()); };
  r.onerror = (e) => {
    onError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access is blocked. Allow it in the browser's site settings."
      : e.error === "no-speech" ? "I didn't hear anything. Tap the mic and try again."
      : e.error === "network" ? "Voice typing couldn't reach the speech service. This happens in Brave and some other browsers; open the page in Chrome or Edge, or type your question."
      : e.error === "audio-capture" ? "No microphone was found. Check that your mic is connected and allowed."
      : e.error === "language-not-supported" ? "This browser can't listen in Bangla. Switch the site to English, or open it in Chrome."
      : "Voice input stopped. Try again.");
  };
  r.onend = onEnd;
  try { r.start(); } catch { onEnd(); }
  return () => { try { r.abort(); } catch { /* ignore */ } };
}

const hasBangla = (s: string) => /[ঀ-৿]/.test(s);

// ---- Female voice choice -------------------------------------------------
// A browser can only use the voices installed on the student's device, so we pick the
// best female voice available: neural/"natural" ones first, then good standard ones.
const FEMALE = /(aria|jenny|sonia|libby|natasha|clara|michelle|ana|emma|nabanita|tanishaa|samantha|ava|allison|susan|serena|karen|moira|tessa|zira|hazel|female|google (us|uk) english|google \u09ac\u09be\u0982\u09b2\u09be|google bengali)/i;
const MALE = /(guy|ryan|davis|david|mark|george|james|daniel|alex|fred|thomas|oliver|male|pradeep|bashkar|prabhat)/i;

function score(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`;
  let sc = 0;
  if (/natural|neural|online|enhanced|premium/i.test(n)) sc += 100;
  if (/microsoft/i.test(n) && /online/i.test(n)) sc += 20;
  if (/google/i.test(n)) sc += 30;
  if (FEMALE.test(n)) sc += 60;
  if (MALE.test(n) && !/female/i.test(n)) sc -= 200;
  if (!v.localService) sc += 5;
  return sc;
}

function pickVoice(lang: "en" | "bn"): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  const want = lang === "bn" ? /^bn/i : /^en/i;
  let list = all.filter((v) => want.test(v.lang));
  if (lang === "en") {
    const pref = list.filter((v) => /^en[-_](US|GB|IN|AU)/i.test(v.lang));
    if (pref.length) list = pref;
  }
  if (!list.length) return null;
  return list.map((v) => [v, score(v)] as const).sort((a, b) => b[1] - a[1])[0][0];
}

// ---- Say every word clearly ----------------------------------------------
// Voices mumble abbreviations and codes, so spell them out before speaking.
const spell = (t: string) => t.split("").join(" ");
const WORDS: Record<string, string> = {
  AIUB: "A I U B", CGPA: "C G P A", GPA: "G P A", TSF: "T S F", ID: "I D", BDT: "taka", Tk: "taka",
  CSE: "C S E", EEE: "E E E", BBA: "B B A", SSC: "S S C", HSC: "H S C", UGC: "U G C", FAQ: "F A Q",
  vs: "versus", "e.g.": "for example", "i.e.": "that is", Dr: "Doctor", Prof: "Professor",
};

export function normalizeForSpeech(text: string, lang: "en" | "bn"): string {
  let t = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_`#>]+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/&/g, lang === "en" ? " and " : " ")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/[()]/g, ", ");
  if (lang === "en") {
    // Room codes such as DS101, DN107, DE204 -> "D S 1 0 1"
    t = t.replace(/\b(D[NSE])\s?(\d{3})\b/g, (_m, a: string, b: string) => `${spell(a)} ${spell(b)}`);
    t = t.replace(/\b([A-Z]{2,5})\b/g, (m) => WORDS[m] ?? m);
    t = t.replace(/\b(Dr|Prof|Tk|vs)\.?(?=\s)/g, (_m, w: string) => WORDS[w] ?? w);
    // Decimals: 2.50 -> "2 point 5 0"
    t = t.replace(/\b(\d+)\.(\d+)\b/g, (_m, a: string, b: string) => `${a} point ${spell(b)}`);
    // Percent and ranges
    t = t.replace(/(\d)\s?%/g, "$1 percent").replace(/(\d)\s?[-\u2013]\s?(\d)/g, "$1 to $2");
    // 9204 style room numbers and long IDs are read digit by digit
    t = t.replace(/\b(\d{4,})\b/g, (m) => spell(m));
  }
  return t.replace(/\s+/g, " ").trim();
}

function sentences(t: string): string[] {
  const parts = t.match(/[^.!?\u0964;:\n]+[.!?\u0964;:]*/g) ?? [t];
  const out: string[] = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    // keep chunks short so no browser cuts a long utterance off
    if (p.length <= 180) { out.push(p); continue; }
    let cur = "";
    for (const w of p.split(/(?<=,)\s+|\s+/)) {
      if ((cur + " " + w).length > 180 && cur) { out.push(cur.trim()); cur = w; } else cur += " " + w;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

let token = 0;

let audio: HTMLAudioElement | null = null;

/** English: the natural Orpheus voice from our server, one short sentence group at a time (the next one loads while
 *  this one plays). If the server voice fails at any point, the rest is read by the phone's own voice. */
async function speakNatural(chunks: string[], my: number, onEnd?: () => void, fallback?: (from: number) => void) {
  const fetchClip = (t: string) => fetch(`${API}/api/voice/speak`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t.slice(0, 200) }) })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
  let next: Promise<Blob> | null = fetchClip(chunks[0]);
  for (let i = 0; i < chunks.length; i++) {
    if (my !== token) return;
    let blob: Blob;
    try { blob = await next!; } catch { if (my === token) fallback?.(i); return; }
    next = i + 1 < chunks.length ? fetchClip(chunks[i + 1]) : null;
    next?.catch(() => {});
    if (my !== token) return;
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        audio = new Audio(url);
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("play"));
        audio.play().catch(reject);
      });
    } catch { URL.revokeObjectURL(url); if (my === token) fallback?.(i); return; }
    URL.revokeObjectURL(url);
  }
  if (my === token) onEnd?.();
}

export function speak(text: string, onEnd?: () => void) {
  const my = ++token;
  if (audio) { audio.pause(); audio = null; }
  if (canSpeak()) window.speechSynthesis.cancel();
  const lang: "en" | "bn" = hasBangla(text) ? "bn" : "en";
  const chunks = sentences(normalizeForSpeech(text, lang));
  if (!chunks.length) { onEnd?.(); return; }
  if (lang === "en") {
    serverVoiceReady().then((ok) => {
      if (my !== token) return;
      if (ok) speakNatural(chunks, my, onEnd, (from) => speakBrowser(chunks.slice(from), my, lang, onEnd));
      else speakBrowser(chunks, my, lang, onEnd);
    });
    return;
  }
  speakBrowser(chunks, my, lang, onEnd);
}

function speakBrowser(chunks: string[], my: number, lang: "en" | "bn", onEnd?: () => void) {
  if (!canSpeak() || !chunks.length) { onEnd?.(); return; }
  const synth = window.speechSynthesis;

  const run = () => {
    if (my !== token) return;
    const voice = pickVoice(lang);
    let i = 0;
    const next = () => {
      if (my !== token) return;
      if (i >= chunks.length) { onEnd?.(); return; }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = lang === "bn" ? "bn-BD" : "en-US";
      u.rate = 0.88;   // a little slower so each word is clear
      u.pitch = 1.05;  // slightly higher, a softer female tone
      u.volume = 1;
      u.onend = () => setTimeout(next, 120);
      u.onerror = (e) => { if (e.error === "canceled" || e.error === "interrupted") return; setTimeout(next, 0); };
      synth.speak(u);
    };
    next();
  };

  // Voices load late on some browsers; wait for them once.
  if (synth.getVoices().length) run();
  else {
    let done = false;
    const go = () => { if (done) return; done = true; synth.removeEventListener("voiceschanged", go); run(); };
    synth.addEventListener("voiceschanged", go);
    setTimeout(go, 600);
  }
}

export function stopSpeaking() { token++; if (audio) { audio.pause(); audio = null; } if (canSpeak()) window.speechSynthesis.cancel(); }
