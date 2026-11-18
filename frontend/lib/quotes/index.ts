import { QURAN, SURAH } from "./quran";
import { PEOPLE } from "./people";

export type Quote = { id: number; en: string; bn: string; refEn: string; refBn: string; quran: boolean };

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bnNum = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[+d]);

export const QUOTES: Quote[] = [
  ...QURAN.map(([s, a, en, bn]) => {
    const [sn, sb] = SURAH[s] ?? [`Surah ${s}`, `সূরা ${bnNum(String(s))}`];
    return { en, bn, refEn: `Quran, Surah ${sn} ${s}:${a}`, refBn: `কুরআন, সূরা ${sb} ${bnNum(`${s}:${a}`)}`, quran: true };
  }),
  ...PEOPLE.map(([t, who]) => ({ en: t, bn: t, refEn: who, refBn: who, quran: false })),
].map((q, id) => ({ ...q, id }));
