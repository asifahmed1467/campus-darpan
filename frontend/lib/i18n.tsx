"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "bn";

const dict = {
  en: {
    "nav.faculty": "Faculty", "nav.notices": "Notices", "nav.ask": "Ask AIUB", "nav.rooms": "Rooms",
    "hero.title": "Is your teacher free right now?",
    "hero.sub": "Search a name, speak a question, or check the latest notices.",
    "search.placeholder": "Type a teacher's name, course or room",
    "search.mic": "Speak your question", "search.listening": "Listening…",
    "home.right_now": "Right now", "home.notices": "Latest notices", "home.all_notices": "All notices",
    "home.all_faculty": "All faculty", "home.holidays": "Coming up",
    "online": "online now", "listen": "Listen", "stop": "Stop",
    "status.available": "Free now", "status.gap": "No class now", "status.in_class": "In class",
    "status.admin": "Admin duty", "status.unavailable": "Not in office", "status.off": "Off today",
    "status.no_schedule": "No schedule yet",
    "ask.title": "Ask AIUB", "ask.placeholder": "Ask about a teacher, a notice or AIUB rules",
    "ask.send": "Ask", "ask.sources": "Sources",
    "rooms.title": "Find a room", "faculty.title": "Faculty", "notices.title": "Notices",
    "free_only": "Free now only", "all": "All",
  },
  bn: {
    "nav.faculty": "শিক্ষক", "nav.notices": "নোটিশ", "nav.ask": "জিজ্ঞাসা করুন", "nav.rooms": "রুম",
    "hero.title": "আপনার স্যার কি এখন ফ্রি?",
    "hero.sub": "নাম লিখুন, কথা বলে প্রশ্ন করুন, অথবা সর্বশেষ নোটিশ দেখুন।",
    "search.placeholder": "শিক্ষকের নাম, কোর্স বা রুম লিখুন",
    "search.mic": "কথা বলে প্রশ্ন করুন", "search.listening": "শুনছি…",
    "home.right_now": "এই মুহূর্তে", "home.notices": "সর্বশেষ নোটিশ", "home.all_notices": "সব নোটিশ",
    "home.all_faculty": "সব শিক্ষক", "home.holidays": "আসছে",
    "online": "জন এখন অনলাইনে", "listen": "শুনুন", "stop": "থামুন",
    "status.available": "এখন ফ্রি", "status.gap": "এখন ক্লাস নেই", "status.in_class": "ক্লাসে আছেন",
    "status.admin": "প্রশাসনিক কাজ", "status.unavailable": "অফিসে নেই", "status.off": "আজ ছুটি",
    "status.no_schedule": "রুটিন এখনো নেই",
    "ask.title": "AIUB-কে জিজ্ঞাসা করুন", "ask.placeholder": "শিক্ষক, নোটিশ বা AIUB-এর নিয়ম নিয়ে প্রশ্ন করুন",
    "ask.send": "জিজ্ঞাসা", "ask.sources": "সূত্র",
    "rooms.title": "রুম খুঁজুন", "faculty.title": "শিক্ষক", "notices.title": "নোটিশ",
    "free_only": "শুধু এখন ফ্রি", "all": "সব",
  },
} as const;

export type Key = keyof (typeof dict)["en"];
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "en", setLang: () => {}, t: (k) => dict.en[k],
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setL] = useState<Lang>("en");
  useEffect(() => {
    try { const s = localStorage.getItem("aiub_lang"); if (s === "bn" || s === "en") setL(s); } catch { /* ignore */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => { setL(l); try { localStorage.setItem("aiub_lang", l); } catch { /* ignore */ } }, []);
  const t = useCallback((k: Key) => dict[lang][k] ?? dict.en[k], [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
