"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

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

    "home.hint": "Suggestions appear as you type. The mic works for questions like “When is Nyme sir free?”.",
    "home.free_count": "{n} free",
    "home.retry": "Try again",
    "home.load_failed": "Couldn't load teachers. Check your connection and try again.",
    "home.notices_failed": "Couldn't load notices. Check your connection and try again.",
    "home.no_schedules": "No schedules have been added yet. An admin can upload the first TSF from the admin page.",
    "home.teachers_listed": "{n} teachers listed",
    "home.semester": "{name} semester, classes {from} to {to}",
    "home.no_holidays": "No holidays left in this semester's calendar.",
    "home.weekend_note": "Fridays and Saturdays are the weekend.",

    "search.ex1": "Nyme Ahmed", "search.ex2": "When is Zasmin sir free?", "search.ex3": "Where is room DN0921?", "search.ex4": "Which notice is new?",
    "search.room": "Room {room}", "search.until": "until {t}", "search.free_at": "free {when}",
    "search.matches": "Matching teachers",
    "search.no_match": "No teacher matches “{q}”. Check the spelling, or",
    "search.ask_instead": "ask AIUB instead",

    "st.until_left": "Until {until} ({left} left)", "st.until": "Until {until}", "st.left": "{left} left",
    "st.room": "Room {room}", "st.free_at": "Free {when}", "st.free_at_room": "Free {when}, room {room}",
    "st.no_schedule_yet": "Schedule not available yet",
    "unit.min": "{n} min", "unit.h": "{n} h", "unit.h_min": "{h} h {m} min",

    "today.title": "AIUB Today", "today.week": "Week {w} of {of}",
    "today.holiday_label": "Holiday today:", "today.no_classes": "No classes.",
    "today.weekend": "It's the weekend. No regular classes today.",
    "today.open_notice": "Open notice", "today.now_temp": "Now {n}°C.",
    "today.heavy_one": "Heavy traffic on 1 route to campus", "today.heavy_many": "Heavy traffic on {n} routes to campus",
    "today.drive_times": "Drive times to campus right now",
    "today.live_updated": "Live, updated {at}.",
    "today.traffic_note": "Drive times by car or CNG from {src}, based on road speeds seen in the last 15 minutes. “Usually” is the normal time for this hour; when there is a jam, the live time rises above it.",
    "today.map_service": "the map service",
    "today.usually": "(usually {n})",
    "today.road_clear": "Clear", "today.road_slow": "Slow", "today.road_heavy": "Heavy", "today.road_closed": "Closed",
    "today.new_one": "1 new notice since yesterday", "today.new_many": "{n} new notices since yesterday",
    "today.normal_day": "Normal class day. No exams or holidays today.",
    "today.next_holiday": "Next holiday:", "today.tomorrow": "tomorrow", "today.in_days": "in {n} days",
    "today.share": "Share today", "today.copied": "Copied. Paste it in your group.",
    "today.loading": "Loading today's briefing", "today.holiday_short": "Holiday:", "today.drive_now": "Drive to AIUB now:",

    "notice.empty": "No notices to show yet. They will appear here, each with a link to the official page on aiub.edu, once the notice feed is connected.",
    "notice.new": "New", "notice.sample": "Sample", "notice.read": "Read on aiub.edu", "notice.pdf": "Open the PDF",

    "day.today": "Today:", "day.none": "Nothing scheduled today", "day.range": "{what} {from} to {to}",
    "day.class": "class", "day.consultation": "consultation", "day.admin": "admin duty",

    "fav.add": "Add {name} to favourites", "fav.remove": "Remove {name} from favourites",
    "faculty.loading": "Loading teachers",

    "shell.skip": "Skip to content",
    "footer.note": "A student project, not an official AIUB service. Schedules come from teachers' TSFs; check the door or the portal for last-minute changes.",
    "sound.off": "Turn notice sound off", "sound.on": "Turn notice sound on",
    "theme.to_light": "Switch to light mode", "theme.to_dark": "Switch to dark mode",
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

    "home.hint": "টাইপ করলে নামের পরামর্শ আসবে। মাইক্রোফোনে প্রশ্নও করতে পারেন, যেমন “Nyme স্যার কখন ফ্রি?”।",
    "home.free_count": "{n} জন ফ্রি",
    "home.retry": "আবার চেষ্টা করুন",
    "home.load_failed": "শিক্ষকদের তালিকা আনা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
    "home.notices_failed": "নোটিশ আনা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
    "home.no_schedules": "এখনো কোনো রুটিন যোগ করা হয়নি। অ্যাডমিন পেজ থেকে প্রথম TSF আপলোড করা যাবে।",
    "home.teachers_listed": "মোট {n} জন শিক্ষক",
    "home.semester": "{name} সেমিস্টার, ক্লাস {from} থেকে {to} পর্যন্ত",
    "home.no_holidays": "এই সেমিস্টারের ক্যালেন্ডারে আর কোনো ছুটি নেই।",
    "home.weekend_note": "শুক্রবার ও শনিবার সাপ্তাহিক ছুটি।",

    "search.ex1": "Nyme Ahmed", "search.ex2": "Zasmin স্যার কখন ফ্রি?", "search.ex3": "DN0921 রুমটি কোথায়?", "search.ex4": "নতুন নোটিশ কোনটি?",
    "search.room": "রুম {room}", "search.until": "{t} পর্যন্ত", "search.free_at": "ফ্রি {when}",
    "search.matches": "মিলে যাওয়া শিক্ষক",
    "search.no_match": "“{q}” নামে কোনো শিক্ষক পাওয়া যায়নি। বানান দেখুন, অথবা",
    "search.ask_instead": "AIUB-কে জিজ্ঞাসা করুন",

    "st.until_left": "{until} পর্যন্ত ({left} বাকি)", "st.until": "{until} পর্যন্ত", "st.left": "{left} বাকি",
    "st.room": "রুম {room}", "st.free_at": "ফ্রি {when}", "st.free_at_room": "ফ্রি {when}, রুম {room}",
    "st.no_schedule_yet": "রুটিন এখনো পাওয়া যায়নি",
    "unit.min": "{n} মিনিট", "unit.h": "{n} ঘণ্টা", "unit.h_min": "{h} ঘণ্টা {m} মিনিট",

    "today.title": "আজ AIUB-তে", "today.week": "সপ্তাহ {w}/{of}",
    "today.holiday_label": "আজ ছুটি:", "today.no_classes": "ক্লাস নেই।",
    "today.weekend": "আজ সাপ্তাহিক ছুটি। নিয়মিত ক্লাস নেই।",
    "today.open_notice": "নোটিশ খুলুন", "today.now_temp": "এখন {n}°C।",
    "today.heavy_one": "ক্যাম্পাসের ১টি রাস্তায় তীব্র যানজট", "today.heavy_many": "ক্যাম্পাসের {n}টি রাস্তায় তীব্র যানজট",
    "today.drive_times": "এখন ক্যাম্পাসে যেতে গাড়িতে সময়",
    "today.live_updated": "লাইভ, হালনাগাদ {at}।",
    "today.traffic_note": "গাড়ি বা সিএনজিতে যাওয়ার সময়, {src}-এর তথ্য থেকে, গত ১৫ মিনিটে দেখা সড়কের গতির ভিত্তিতে। “সাধারণত” মানে এই সময়ের স্বাভাবিক সময়; জ্যাম থাকলে লাইভ সময় তার চেয়ে বেশি দেখায়।",
    "today.map_service": "ম্যাপ সার্ভিস",
    "today.usually": "(সাধারণত {n})",
    "today.road_clear": "ফাঁকা", "today.road_slow": "ধীর", "today.road_heavy": "যানজট", "today.road_closed": "বন্ধ",
    "today.new_one": "গতকাল থেকে ১টি নতুন নোটিশ", "today.new_many": "গতকাল থেকে {n}টি নতুন নোটিশ",
    "today.normal_day": "স্বাভাবিক ক্লাসের দিন। আজ কোনো পরীক্ষা বা ছুটি নেই।",
    "today.next_holiday": "পরের ছুটি:", "today.tomorrow": "আগামীকাল", "today.in_days": "{n} দিন পরে",
    "today.share": "আজকের খবর শেয়ার করুন", "today.copied": "কপি হয়েছে। আপনার গ্রুপে পেস্ট করুন।",
    "today.loading": "আজকের খবর আসছে", "today.holiday_short": "ছুটি:", "today.drive_now": "এখন AIUB-তে যেতে:",

    "notice.empty": "দেখানোর মতো নোটিশ এখনো নেই। নোটিশ ফিড যুক্ত হলে এখানে আসবে, প্রতিটির সঙ্গে aiub.edu-র অফিসিয়াল পেজের লিংক থাকবে।",
    "notice.new": "নতুন", "notice.sample": "নমুনা", "notice.read": "aiub.edu-তে পড়ুন", "notice.pdf": "PDF খুলুন",

    "day.today": "আজ:", "day.none": "আজ কিছু নির্ধারিত নেই", "day.range": "{what} {from} থেকে {to}",
    "day.class": "ক্লাস", "day.consultation": "পরামর্শের সময়", "day.admin": "প্রশাসনিক কাজ",

    "fav.add": "{name}-কে প্রিয় তালিকায় যোগ করুন", "fav.remove": "{name}-কে প্রিয় তালিকা থেকে সরান",
    "faculty.loading": "শিক্ষকদের তালিকা আসছে",

    "shell.skip": "মূল অংশে যান",
    "footer.note": "এটি একটি শিক্ষার্থীদের প্রকল্প, AIUB-এর অফিসিয়াল সেবা নয়। রুটিন শিক্ষকদের TSF থেকে নেওয়া; শেষ মুহূর্তের পরিবর্তনের জন্য দরজা বা পোর্টাল দেখুন।",
    "sound.off": "নোটিশের শব্দ বন্ধ করুন", "sound.on": "নোটিশের শব্দ চালু করুন",
    "theme.to_light": "লাইট মোডে যান", "theme.to_dark": "ডার্ক মোডে যান",
  },
} as const;

export type Key = keyof (typeof dict)["en"];
export type Vars = Record<string, string | number>;
export type TFn = (k: Key, v?: Vars) => string;

const localeOf = (l: Lang) => (l === "bn" ? "bn-BD" : "en-GB");
const fill = (s: string, l: Lang, v?: Vars) =>
  v ? s.replace(/\{(\w+)\}/g, (_, n) => { const x = v[n]; return x === undefined ? "" : typeof x === "number" ? new Intl.NumberFormat(localeOf(l), { useGrouping: false }).format(x) : x; }) : s;

const Ctx = createContext<{
  lang: Lang; setLang: (l: Lang) => void; t: TFn;
  /** localized number and date, so Bangla gets Bangla digits and month names */
  num: (n: number) => string; date: (iso: string, o: Intl.DateTimeFormatOptions) => string;
}>({
  lang: "en", setLang: () => {}, t: (k, v) => fill(dict.en[k], "en", v),
  num: (n) => n.toLocaleString("en-GB"), date: (iso, o) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", o),
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setL] = useState<Lang>("en");
  // Runs before the first paint on the client: a saved choice wins, otherwise a Bangla browser gets Bangla.
  useLayoutEffect(() => {
    try {
      const s = localStorage.getItem("aiub_lang");
      if (s === "bn" || s === "en") setL(s);
      else if (navigator.language?.toLowerCase().startsWith("bn")) setL("bn");
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => { setL(l); try { localStorage.setItem("aiub_lang", l); } catch { /* ignore */ } }, []);
  const t = useCallback<TFn>((k, v) => fill(dict[lang][k] ?? dict.en[k], lang, v), [lang]);
  const num = useCallback((n: number) => new Intl.NumberFormat(localeOf(lang)).format(n), [lang]);
  const date = useCallback((iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00").toLocaleDateString(localeOf(lang), o), [lang]);
  return <Ctx.Provider value={{ lang, setLang, t, num, date }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
