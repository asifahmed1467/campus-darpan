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
    if (p.length <= 160) { out.push(p); continue; }
    let cur = "";
    for (const w of p.split(/(?<=,)\s+|\s+/)) {
      if ((cur + " " + w).length > 160 && cur) { out.push(cur.trim()); cur = w; } else cur += " " + w;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

let token = 0;

export function speak(text: string, onEnd?: () => void) {
  if (!canSpeak()) { onEnd?.(); return; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const my = ++token;
  const lang: "en" | "bn" = hasBangla(text) ? "bn" : "en";
  const chunks = sentences(normalizeForSpeech(text, lang));
  if (!chunks.length) { onEnd?.(); return; }

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

export function stopSpeaking() { token++; if (canSpeak()) window.speechSynthesis.cancel(); }
