"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useOnline } from "@/lib/hooks";
import { useLang, type Key } from "@/lib/i18n";
import { NoticeAlert } from "./Notices";
import { Mark, NAME_BN, TAGLINE_EN } from "./Logo";
import { playChime, setSoundOn, soundOn, unlockAudio } from "@/lib/sound";

const NAV: { href: string; key: Key; icon: string }[] = [
  { href: "/faculty", key: "nav.faculty", icon: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" },
  { href: "/notices", key: "nav.notices", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" },
  { href: "/ask", key: "nav.ask", icon: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5" },
  { href: "/rooms", key: "nav.rooms", icon: "M4 21V5l8-2 8 2v16M9 21v-5h6v5M8 9h2M14 9h2" },
];

function SoundToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { setOn(soundOn()); }, []);
  const flip = () => {
    unlockAudio();
    const next = !soundOn();
    setSoundOn(next); setOn(next);
    if (next) playChime();
  };
  return (
    <button type="button" onClick={flip} className="chip !px-2.5" aria-pressed={on ?? undefined}
      aria-label={on ? "Turn notice sound off" : "Turn notice sound on"} title={on ? "Notice sound on" : "Notice sound off"}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3a6 6 0 00-6 6c0 5-2 6-2 7h16c0-1-2-2-2-7a6 6 0 00-6-6zM10 19a2 2 0 004 0" />
        {on === false && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  const flip = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("cd-theme", next); } catch { /* private mode */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0B1120" : "#0B2A6F");
    setDark(next === "dark");
  };
  return (
    <button type="button" onClick={flip} className="chip !px-2.5" aria-pressed={dark ?? undefined}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
      <svg className="dark:hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
      <svg className="hidden dark:block" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    </button>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { lang, setLang, t } = useLang();
  const online = useOnline();
  const isAdmin = path.startsWith("/admin");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 6);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-inverse focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
      <header className={`sticky top-0 z-40 border-b bg-paper/95 backdrop-blur transition-shadow duration-300 ${scrolled ? "border-line shadow-[0_6px_18px_-12px_rgb(var(--c-shadow)/.35)]" : "border-transparent"}`}>
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="ক্যাম্পাসদর্পণ, home">
            <Mark size={36} />
            <span className="hidden leading-none sm:block"><span className="block font-bn text-[22px] font-bold">{NAME_BN}</span><span className="mt-0.5 block font-display text-[12px] font-medium text-mute">{TAGLINE_EN}</span></span>
          </Link>
          <nav aria-label="Main" className="ml-4 hidden gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 font-display font-semibold hover:bg-sheet ${path.startsWith(n.href) ? "bg-sheet underline decoration-needle decoration-[3px] underline-offset-[6px]" : ""}`}>{t(n.key)}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {online !== null && !isAdmin && (
              <span className="flex items-center gap-2 rounded-full border border-line bg-sheet px-3 py-1 text-sm" aria-live="off">
                <span aria-hidden className="h-2 w-2 rounded-full bg-go" /><b className="font-display">{online.toLocaleString()}</b> <span className="hidden sm:inline">{t("online")}</span>
              </span>
            )}
            <SoundToggle />
            <ThemeToggle />
            <button className="chip font-display" onClick={() => setLang(lang === "en" ? "bn" : "en")} aria-label={lang === "en" ? "বাংলায় দেখুন" : "Switch to English"}>
              {lang === "en" ? "বাংলা" : "English"}
            </button>
          </div>
        </div>
      </header>
      <main id="main" key={path} className="page-in mx-auto max-w-6xl overflow-x-clip px-4 pb-6 pt-6 md:pb-12 md:pt-10">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-24 text-sm text-mute md:pb-10">
        <div className="border-t border-line pt-5">
          <b className="font-bn text-ink">ক্যাম্পাসদর্পণ</b> · 
          A student project, not an official AIUB service. Schedules come from teachers' TSFs; check the door or the portal for last-minute changes.
          <p className="mt-3 font-display font-medium text-ink">© {new Date().getFullYear()} Asif Ahmed and Mahfuz Ahmed. All rights reserved.</p>
        </div>
      </footer>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => {
          const on = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`group relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[13px] font-semibold transition-colors ${on ? "text-brand" : "text-mute"}`}>
              <span aria-hidden className={`absolute top-0 h-[3px] w-10 rounded-b bg-brand transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`} />
              <svg className="transition-transform duration-200 group-active:scale-90" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              {t(n.key)}
            </Link>
          );
        })}
      </nav>
      <NoticeAlert />
    </>
  );
}
