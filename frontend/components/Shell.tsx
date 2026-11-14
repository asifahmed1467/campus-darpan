"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOnline } from "@/lib/hooks";
import { useLang, type Key } from "@/lib/i18n";
import { NoticeAlert } from "./Notices";
import { Mark, NAME_BN, TAGLINE_EN } from "./Logo";

const NAV: { href: string; key: Key; icon: string }[] = [
  { href: "/faculty", key: "nav.faculty", icon: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" },
  { href: "/notices", key: "nav.notices", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" },
  { href: "/ask", key: "nav.ask", icon: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5" },
  { href: "/rooms", key: "nav.rooms", icon: "M4 21V5l8-2 8 2v16M9 21v-5h6v5M8 9h2M14 9h2" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { lang, setLang, t } = useLang();
  const online = useOnline();
  const isAdmin = path.startsWith("/admin");
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
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
            <button className="chip font-display" onClick={() => setLang(lang === "en" ? "bn" : "en")} aria-label={lang === "en" ? "বাংলায় দেখুন" : "Switch to English"}>
              {lang === "en" ? "বাংলা" : "English"}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl overflow-x-clip px-4 pb-6 pt-6 md:pb-12 md:pt-10">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-24 text-sm text-mute md:pb-10">
        <b className="font-bn text-ink">ক্যাম্পাসদর্পণ</b> · 
        A student project, not an official AIUB service. Schedules come from teachers' TSFs; check the door or the portal for last-minute changes.
      </footer>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => {
          const on = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[13px] font-semibold ${on ? "text-brand" : "text-mute"}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              {t(n.key)}
            </Link>
          );
        })}
      </nav>
      <NoticeAlert />
    </>
  );
}
