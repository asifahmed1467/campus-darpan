"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Full-page campus video behind the whole home page (fixed, so it stays while the page scrolls).
 * Wide screens get the 16:9 cut, tall screens the 9:16 cut. It only loads and plays when it is
 * welcome: not with reduced motion, data saver or 2G, and it pauses in a background tab.
 * Otherwise the still frame stays.
 */
export default function HeroVideo() {
  const vid = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [wide, setWide] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
    const c = nav.connection;
    const slow = !!c?.saveData || (c?.effectiveType ? /(^|-)2g$/.test(c.effectiveType) : false);
    const calm = matchMedia("(prefers-reduced-motion: reduce)"), shape = matchMedia("(min-aspect-ratio: 4/5)");
    const decide = () => { setAllowed(!slow && !calm.matches); setWide(shape.matches); };
    decide();
    calm.addEventListener("change", decide); shape.addEventListener("change", decide);
    return () => { calm.removeEventListener("change", decide); shape.removeEventListener("change", decide); };
  }, []);

  useEffect(() => {
    const v = vid.current;
    if (!allowed || !v) return;
    setReady(false); v.load();
    const go = () => { if (document.hidden) v.pause(); else v.play().catch(() => {}); };
    go();
    document.addEventListener("visibilitychange", go);
    return () => document.removeEventListener("visibilitychange", go);
  }, [allowed, wide]);

  if (!mounted) return null;
  const cut = wide ? "pc" : "phone";
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#1b2a44]">
      <div className="absolute inset-0 bg-cover" style={{ backgroundImage: `url(/hero/dome-${cut}.jpg)`, backgroundPosition: wide ? "60% 50%" : "50% 60%" }} />
      {allowed && (
        <video ref={vid} key={cut} muted loop playsInline autoPlay preload="auto" tabIndex={-1} poster={`/hero/dome-${cut}.jpg`}
          onCanPlay={() => setReady(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
          style={{ objectPosition: wide ? "60% 50%" : "50% 60%" }}>
          <source src={`/hero/dome-${cut}.mp4`} type="video/mp4" />
        </video>
      )}
      <div className="hero-veil absolute inset-0" />
    </div>,
    document.body,
  );
}
