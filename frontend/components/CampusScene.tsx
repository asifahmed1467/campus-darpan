"use client";
import CountUp from "./CountUp";

/** A small original campus skyline. Windows light up and dim at their own pace, clouds drift, and live numbers sit on top. */
const BLOCKS = [
  { x: 10, w: 92, h: 70, cols: 4, rows: 4 },
  { x: 112, w: 70, h: 104, cols: 3, rows: 6 },
  { x: 192, w: 120, h: 80, cols: 5, rows: 4 },
  { x: 322, w: 84, h: 128, cols: 4, rows: 7 },
  { x: 416, w: 112, h: 92, cols: 5, rows: 5 },
  { x: 538, w: 72, h: 66, cols: 3, rows: 3 },
  { x: 620, w: 96, h: 112, cols: 4, rows: 6 },
  { x: 726, w: 64, h: 76, cols: 3, rows: 4 },
];
const GROUND = 168;

function Windows() {
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const out: React.ReactNode[] = [];
  BLOCKS.forEach((b, bi) => {
    const top = GROUND - b.h;
    const cw = (b.w - 12) / b.cols, rh = (b.h - 14) / b.rows;
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
      const lit = rnd() > 0.45;
      out.push(
        <rect key={`${bi}-${r}-${c}`} x={b.x + 6 + c * cw + 2} y={top + 8 + r * rh + 2} width={cw - 5} height={rh - 5} rx="1.5"
          className={lit ? "win win-on" : "win"} style={{ animationDelay: `${(rnd() * 9).toFixed(2)}s`, animationDuration: `${(5 + rnd() * 6).toFixed(1)}s` }} />,
      );
    }
  });
  return <>{out}</>;
}

export default function CampusScene({ free, total, notices }: { free: number; total: number; notices: number }) {
  const stats = [
    { n: free, label: "teachers free now", live: true },
    { n: total, label: "teachers listed" },
    { n: notices, label: "recent notices" },
  ];
  return (
    <section aria-label="Campus at a glance" className="scene relative overflow-hidden rounded-2xl border-2 border-edge bg-sheet">
      <div className="relative z-10 grid grid-cols-3 divide-x divide-line border-b border-line bg-sheet/80 backdrop-blur-sm">
        {stats.map((s) => (
          <div key={s.label} className="px-3 py-3 text-center sm:px-6 sm:py-4">
            <div className="flex items-center justify-center gap-2 font-display text-3xl font-bold sm:text-4xl">
              {s.live && s.n > 0 && <span aria-hidden className="dot-live h-2.5 w-2.5 rounded-full bg-go" />}
              <CountUp to={s.n} ms={1100} />
            </div>
            <div className="mt-0.5 text-[13px] text-mute sm:text-[15px]">{s.label}</div>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 800 190" preserveAspectRatio="xMidYMax slice" className="block h-36 w-full sm:h-44" role="img" aria-label="Illustration of campus buildings with their windows lighting up">
        <g className="cloud cloud-a"><ellipse cx="120" cy="34" rx="34" ry="9" /><ellipse cx="146" cy="28" rx="22" ry="8" /></g>
        <g className="cloud cloud-b"><ellipse cx="520" cy="50" rx="40" ry="10" /><ellipse cx="548" cy="43" rx="24" ry="8" /></g>
        {BLOCKS.map((b, i) => <rect key={i} x={b.x} y={GROUND - b.h} width={b.w} height={b.h} rx="3" className="bldg" style={{ ["--i" as string]: i }} />)}
        <Windows />
        <rect x="0" y={GROUND} width="800" height="22" className="ground" />
        <g className="walker"><circle cx="0" cy={GROUND - 9} r="3.4" /><rect x="-2.6" y={GROUND - 6} width="5.2" height="8" rx="2" /></g>
        <g className="here"><path d="M368 24c-7 0-12 5-12 12 0 9 12 22 12 22s12-13 12-22c0-7-5-12-12-12z" /><circle cx="368" cy="36" r="4.2" className="here-dot" /></g>
      </svg>
    </section>
  );
}
