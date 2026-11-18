"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Looping campus video behind the home hero. It only loads and plays when it is cheap and welcome:
 * not with reduced motion or data saver, not on slow connections, and only while on screen.
 * Otherwise the still frame stays.
 */
export default function HeroVideo() {
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
    const c = nav.connection;
    const slow = !!c?.saveData || (c?.effectiveType ? /(^|-)2g$/.test(c.effectiveType) : false);
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => setAllowed(!slow && !calm.matches);
    decide();
    calm.addEventListener("change", decide);
    return () => calm.removeEventListener("change", decide);
  }, []);

  useEffect(() => {
    const v = vid.current, el = box.current;
    if (!allowed || !v || !el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !document.hidden) v.play().catch(() => {}); else v.pause(); });
    io.observe(el);
    const vis = () => { if (document.hidden) v.pause(); };
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [allowed]);

  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute -inset-x-4 -inset-y-6 -z-10 overflow-hidden rounded-3xl sm:-inset-x-6">
      <div className="absolute inset-0 bg-cover bg-[position:50%_40%]" style={{ backgroundImage: "url(/hero/dome.jpg)" }} />
      {allowed && (
        <video ref={vid} muted loop playsInline preload="metadata" tabIndex={-1} onCanPlay={() => setReady(true)}
          className={`absolute inset-0 h-full w-full object-cover object-[50%_40%] transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}>
          <source src="/hero/dome.mp4" type="video/mp4" />
        </video>
      )}
      <div className="hero-veil absolute inset-0" />
    </div>
  );
}
