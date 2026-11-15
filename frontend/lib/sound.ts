"use client";
/** A short two-note chime made with the browser's own audio (no sound file). Browsers only allow sound after the person has
 *  touched the page once, so the first tap or key press unlocks it. The on/off choice is remembered on this device. */
let ctx: AudioContext | null = null;
const KEY = "cd-sound";

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent("aiub:sound", { detail: on }));
}
function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}
/** Call from a tap or key press so later notices are allowed to make sound. */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}
export function playChime() {
  const c = audio();
  if (!c || !soundOn()) return;
  if (c.state === "suspended") { void c.resume(); if (c.state === "suspended") return; }
  const t0 = c.currentTime;
  [[880, 0], [1318.5, 0.16]].forEach(([f, d]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.6);
    o.connect(g).connect(c.destination);
    o.start(t0 + d); o.stop(t0 + d + 0.65);
  });
}
