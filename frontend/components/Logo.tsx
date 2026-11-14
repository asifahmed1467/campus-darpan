import type { CSSProperties } from "react";

/** ক্যাম্পাসদর্পণ mark: a hand mirror whose glass shows the day strip and the amber "now" needle. */
export function Mark({ size = 36, tile = true, className, style }: { size?: number; tile?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className} style={style}>
      {tile && <rect width="64" height="64" rx="14" fill="#0B2A6F" />}
      <g transform="translate(2.56 1.5) scale(0.92)"><path d="M29.6 44 L34.4 44 L35.2 54.5 a3.6 3.6 0 1 1 -6.4 0 Z" fill="#F4C95D"/>
<circle cx="32" cy="26" r="19.5" fill="#EEF2F8" stroke="#fff" strokeWidth="5"/>
<circle cx="32" cy="26" r="22.4" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1"/>
<rect x="18" y="19" width="13" height="6" rx="2" fill="#0B2A6F"/><rect x="33" y="19" width="13" height="6" rx="2" fill="#0F9D58"/>
<rect x="18" y="29" width="9" height="6" rx="2" fill="#0F9D58"/><rect x="29" y="29" width="17" height="6" rx="2" fill="#0B2A6F"/>
<rect x="36" y="13.5" width="3.4" height="25" rx="1.7" fill="#F2B01E" stroke="#0B2A6F" strokeWidth=".8"/>
<path d="M17.8 17.5a14.5 14.5 0 0 1 5.5-5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/></g>
    </svg>
  );
}

export const NAME_BN = "ক্যাম্পাসদর্পণ";
export const TAGLINE_EN = "Your Campus, Connected.";
export const TAGLINE_BN = "AIUB-এর সকল একাডেমিক তথ্য, এক ঠিকানায়।";

export function Lockup({ dark = false, size = 40 }: { dark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Mark size={size} />
      <span className="leading-none">
        <span className={`block font-bn text-[1.6em] font-bold ${dark ? "text-white" : "text-ink"}`} style={{ fontSize: size * 0.62 }}>{NAME_BN}</span>
        <span className={`mt-1 block font-display text-sm font-medium ${dark ? "text-white/70" : "text-mute"}`}>{TAGLINE_EN}</span>
      </span>
    </span>
  );
}
