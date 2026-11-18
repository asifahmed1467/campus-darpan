"use client";
import { useCallback, useEffect, useState } from "react";
import { QUOTES } from "@/lib/quotes";
import { useLang } from "@/lib/i18n";

const KEY = "cd-last-quote";

function pick(avoid: number | null) {
  let i = Math.floor(Math.random() * QUOTES.length);
  if (QUOTES.length > 1 && i === avoid) i = (i + 1) % QUOTES.length;
  return i;
}

export default function QuoteBanner() {
  const { lang } = useLang();
  const [idx, setIdx] = useState<number | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    let last: number | null = null;
    try { const v = sessionStorage.getItem(KEY); if (v) last = +v; } catch {}
    const i = pick(last);
    setIdx(i);
    try { sessionStorage.setItem(KEY, String(i)); } catch {}
  }, []);

  const next = useCallback(() => {
    setIdx((cur) => {
      const i = pick(cur);
      try { sessionStorage.setItem(KEY, String(i)); } catch {}
      return i;
    });
    setN((x) => x + 1);
  }, []);

  if (idx === null) return <div className="quote-slot" aria-hidden />;
  const q = QUOTES[idx];
  const bn = lang === "bn";
  const text = bn ? q.bn : q.en;
  const ref = bn ? q.refBn : q.refEn;
  const words = text.split(" ");

  return (
    <figure key={`${idx}-${n}-${lang}`} className="quote-banner" aria-live="polite">
      <blockquote className="quote-text" aria-label={text}>
        {words.map((w, i) => (
          <span key={i} aria-hidden className="qw" style={{ ["--q" as string]: i }}>{w}</span>
        ))}
      </blockquote>
      <figcaption className="quote-ref" style={{ ["--q" as string]: words.length + 2 }}>
        <span className="quote-dash" aria-hidden />
        <span>{ref}</span>
        <button type="button" onClick={next} className="quote-next" aria-label={bn ? "আরেকটি উক্তি" : "Show another quote"}>
          <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
        </button>
      </figcaption>
    </figure>
  );
}
