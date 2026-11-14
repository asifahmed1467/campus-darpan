import type { Metadata } from "next";
import { Lockup, Mark, NAME_BN, TAGLINE_BN, TAGLINE_EN } from "@/components/Logo";

export const metadata: Metadata = { title: "Brand" };

const DOWNLOADS = [
  ["icon.svg", "Mark (SVG)"], ["icon-512.png", "App icon 512"], ["icon-192.png", "App icon 192"],
  ["icon-maskable-512.png", "Maskable 512"], ["apple-touch-icon.png", "Apple touch 180"],
];

export default function Brand() {
  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-4xl font-bold sm:text-5xl">Brand</h1>
        <p className="mt-3 max-w-[52ch] text-lg text-mute">The name means “campus mirror”. The mark is a hand mirror, and in its glass you see a day’s schedule with the amber needle marking now.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-line bg-sheet p-8"><Lockup size={56} /></div>
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl bg-ink p-8"><Lockup size={56} dark /></div>
      </section>

      <section aria-labelledby="sz">
        <h2 id="sz" className="text-2xl font-bold">Sizes</h2>
        <div className="mt-4 flex flex-wrap items-end gap-6 rounded-2xl border border-line bg-sheet p-6">
          {[128, 64, 40, 24, 16].map((s) => <div key={s} className="text-center text-sm text-mute"><Mark size={s} /><div className="mt-2">{s}px</div></div>)}
        </div>
      </section>

      <section aria-labelledby="wd" className="rounded-2xl border border-line bg-sheet p-6">
        <h2 id="wd" className="text-2xl font-bold">Words</h2>
        <p className="mt-3 font-bn text-4xl font-bold">{NAME_BN}</p>
        <p className="mt-1 font-display text-xl font-medium">{TAGLINE_EN}</p>
        <p className="mt-1 font-bn text-lg text-mute">{TAGLINE_BN}</p>
        <p className="mt-4 text-[15px] text-mute">Colours: navy #0B2A6F, free green #0F9D58, now amber #F2B01E, paper #EEF2F8. Type: Hind Siliguri for Bangla, Bricolage Grotesque for English headings.</p>
      </section>

      <section aria-labelledby="dl">
        <h2 id="dl" className="text-2xl font-bold">Downloads</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {DOWNLOADS.map(([f, label]) => <li key={f}><a className="chip font-display" href={`/${f}`} download>{label}</a></li>)}
        </ul>
      </section>
    </div>
  );
}
