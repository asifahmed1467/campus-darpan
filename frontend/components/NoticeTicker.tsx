"use client";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import type { Notice } from "@/lib/types";

/** The latest notice titles gliding past in a loop. Hover or touch to pause. Each one opens the Notices page. */
export default function NoticeTicker({ items }: { items: Notice[] }) {
  const { t } = useLang();
  if (!items.length) return null;
  const row = (suffix: string) => items.map((n) => (
    <Link key={n.id + suffix} href={`/notices#n${n.id}`} className="flex shrink-0 items-center gap-2.5 px-5 font-display text-base font-medium hover:text-brand">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-needle" />{n.title}
    </Link>
  ));
  return (
    <section aria-label={t("home.notices")} className="ticker flex items-stretch overflow-hidden neu-raised-sm rounded-xl">
      <span className="z-10 flex shrink-0 items-center gap-2 bg-inverse px-4 font-display text-sm font-bold text-white">
        <span aria-hidden className="dot-live h-2 w-2 rounded-full bg-go" />{t("notice.new")}
      </span>
      <div className="ticker-mask relative min-w-0 flex-1 overflow-hidden py-2.5">
        <div className="ticker-track flex w-max">
          <div className="flex">{row("a")}</div>
          <div className="flex" aria-hidden>{row("b")}</div>
        </div>
      </div>
    </section>
  );
}
