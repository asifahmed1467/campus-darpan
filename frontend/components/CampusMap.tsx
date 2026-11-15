"use client";
import type { CSSProperties, KeyboardEvent } from "react";

export interface CampusBuilding {
  id: string; name: string; short: string; kind: string; levels: number | null; note: string; places: string[];
  floors: { n: number; label: string }[];
}

/* ---------------------------------------------------------------------------------------------
   Campus layout. Positions follow the campus reference map: s runs along the football field
   (left to right), t runs across it (t = 0 is the field's back edge, t = 1 its front edge).
   A building is { s0, s1, t0, t1 }. This is a schematic of how the buildings sit next to each
   other, not a surveyed plan. To move something, change the numbers here.
   --------------------------------------------------------------------------------------------- */
type Box = { s0: number; s1: number; t0: number; t1: number };
const PLAN: Record<string, Box & { round?: boolean }> = {
  D:  { s0: 1.55, s1: 1.80, t0: -0.45, t1: 0.55 },            // tall slab behind the courts, right end
  A9: { s0: 1.25, s1: 1.75, t0: -2.00, t1: -1.55 },           // new building, behind the parking lot
  C:  { s0: 0.89, s1: 1.13, t0: -1.58, t1: -1.08, round: true }, // the round administrative building
  A6: { s0: 0.60, s1: 0.76, t0: -2.42, t1: -1.62 },
  A5: { s0: 0.38, s1: 0.54, t0: -2.38, t1: -1.56 },
  A2: { s0: -0.06, s1: 0.49, t0: -0.40, t1: -0.12 },          // low strips along the field's back edge
  A1: { s0: 0.63, s1: 1.20, t0: -0.42, t1: -0.14 },
  A4: { s0: -0.75, s1: -0.10, t0: -1.55, t1: -1.25 },         // the two long buildings at the left end
  A3: { s0: -0.80, s1: -0.05, t0: -0.85, t1: -0.55 },
};
const OTHER: Box[] = [                                          // buildings on the reference map without a name yet
  { s0: -0.06, s1: 0.22, t0: -2.05, t1: -1.40 },
  { s0: -1.00, s1: -0.78, t0: -1.65, t1: -0.35 },
];
const FIELD: Box = { s0: 0, s1: 1, t0: 0, t1: 1 };
const COURTS: Box = { s0: 1.12, s1: 1.52, t0: 0.06, t1: 0.97 };
const PARKING: Box = { s0: 0.80, s1: 1.45, t0: -2.25, t1: -1.30 };
const LAWN: Box = { s0: 0.40, s1: 0.80, t0: -1.00, t1: -0.65 };
const PLATE: Box = { s0: -1.10, s1: 2.20, t0: -2.65, t1: 1.05 };
const TREES: [number, number][] = [[0.78, -2.05], [0.8, -1.7], [0.86, -2.3], [1.5, -2.25], [1.6, -1.35], [1.78, -1.2], [0.3, -1.3], [0.28, -1.1],
  [0.9, -0.75], [1.22, -0.82], [1.32, -1.0], [-0.3, -1.0], [-0.42, -0.2], [0.5, 1.0], [1.0, 1.0], [1.5, 1.02], [1.92, 0.75], [1.96, 0.4], [-0.5, 0.2], [-0.9, 0.1], [0.2, -0.62], [1.85, -0.7]];
const UNKNOWN_LEVELS = 3;     // drawn height when the floor count has not been given yet

const SU = 50, SV = 28;       // plan units per s and per t
const U = (s: number) => SU * (s + 1.1);
const V = (t: number) => SV * (t + 2.65);
const S = 3.9, C = 0.866, SN = 0.5, FH = 8, OX = 16, OY = 330;
type Pt = readonly [number, number];
const P = (u: number, v: number, z = 0): Pt => [OX + (u + v) * C * S, OY + (v - u) * SN * S - z];
const pts = (...a: Pt[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
const col = (name: string, a = 1) => `rgb(var(--c-${name}) / ${a})`;
const rect = (b: Box) => ({ u0: U(b.s0), u1: U(b.s1), v0: V(b.t0), v1: V(b.t1) });
type R = ReturnType<typeof rect>;
const flat = (r: R, z = 0) => pts(P(r.u0, r.v0, z), P(r.u1, r.v0, z), P(r.u1, r.v1, z), P(r.u0, r.v1, z));
const ctr = (r: R): [number, number] => [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2];

/** Back-to-front order for boxes on the ground (the viewer is at small u, large v). */
function order<T extends { r: R }>(items: T[]): T[] {
  const behind = (a: R, b: R) => a.v1 <= b.v0 + 0.01 || a.u0 >= b.u1 - 0.01;
  const left = [...items], out: T[] = [];
  while (left.length) {
    const i = left.findIndex((a) => !left.some((b) => b !== a && behind(b.r, a.r) && !behind(a.r, b.r)));
    out.push(...left.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

function Floors({ r, f, n, selected }: { r: R; f: number | null; n: number; selected: boolean }) {
  const { u0, u1, v0, v1 } = r;
  const lines = [];
  for (let k = 1; k < n; k++) {
    const z = k * FH;
    lines.push(<polyline key={`r${k}`} points={pts(P(u0, v1, z), P(u1, v1, z))} fill="none" style={{ stroke: col("edge", 0.4) }} strokeWidth="1" />);
    lines.push(<polyline key={`l${k}`} points={pts(P(u0, v0, z), P(u0, v1, z))} fill="none" style={{ stroke: col("edge", 0.4) }} strokeWidth="1" />);
  }
  const band = selected && f !== null && f < n ? (() => {
    const z0 = f * FH, z1 = (f + 1) * FH;
    return (<>
      <polygon points={pts(P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1))} style={{ fill: col("go", 0.95) }} />
      <polygon points={pts(P(u0, v0, z0), P(u0, v1, z0), P(u0, v1, z1), P(u0, v0, z1))} style={{ fill: col("go", 0.8) }} />
    </>);
  })() : null;
  return <>{lines}{band}</>;
}

export default function CampusMap({ buildings, selected, floor, onSelect }: {
  buildings: CampusBuilding[]; selected: string | null; floor: number | null; onSelect: (id: string) => void;
}) {
  const items = order(buildings.filter((b) => PLAN[b.id]).map((b) => ({ b, r: rect(PLAN[b.id]), round: !!PLAN[b.id].round,
    n: b.levels ?? UNKNOWN_LEVELS })));
  const others = order(OTHER.map((o) => ({ r: rect(o) })));
  const key = (id: string) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } };
  const edge: CSSProperties = { stroke: col("edge", 0.75) };
  const shadow: CSSProperties = { filter: "drop-shadow(3px 5px 3px rgb(0 0 0 / 0.16))" };
  const plate = rect(PLATE), field = rect(FIELD), courts = rect(COURTS), parking = rect(PARKING), lawn = rect(LAWN);
  const [fcu, fcv] = ctr(field);

  const xs = [P(plate.u0, plate.v0), P(plate.u1, plate.v0), P(plate.u1, plate.v1), P(plate.u0, plate.v1)];
  const minX = Math.min(...xs.map((p) => p[0])) - 12, maxX = Math.max(...xs.map((p) => p[0])) + 12;
  const topY = Math.min(...xs.map((p) => p[1]), ...items.map((i) => P(i.r.u0, i.r.v0, i.n * FH)[1] - 44)) - 6;
  const botY = Math.max(...xs.map((p) => p[1])) + 12;

  return (
    <svg viewBox={`${minX.toFixed(0)} ${topY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(botY - topY).toFixed(0)}`} className="w-full"
      role="group" aria-label="Campus map. Select a building." style={{ touchAction: "manipulation" }}>
      <polygon points={flat(plate)} style={{ fill: col("sheet"), stroke: col("line") }} strokeWidth="2" strokeLinejoin="round" />

      {/* parking lot */}
      <polygon points={flat(parking)} style={{ fill: col("track", 0.9), stroke: col("edge", 0.35) }} strokeWidth="1" />
      {[0.2, 0.4, 0.6, 0.8].map((k) => <polyline key={k} points={pts(P(parking.u0 + (parking.u1 - parking.u0) * k, parking.v0 + 2), P(parking.u0 + (parking.u1 - parking.u0) * k, parking.v1 - 2))} fill="none" style={{ stroke: col("paper", 0.8) }} strokeWidth="1.2" strokeDasharray="3 3" />)}
      <text x={P(...ctr(parking))[0]} y={P(...ctr(parking))[1] + 4} textAnchor="middle" fontSize="15" className="font-display" style={{ fill: col("mute") }}>Parking</text>

      {/* garden with pond */}
      <polygon points={flat(lawn)} style={{ fill: col("go", 0.2), stroke: col("go", 0.5) }} strokeWidth="1" />
      <ellipse cx={P(...ctr(lawn))[0]} cy={P(...ctr(lawn))[1]} rx="13" ry="7" style={{ fill: col("brand", 0.28), stroke: col("brand", 0.5) }} />

      {/* football field and courts */}
      <polygon points={flat(field)} style={{ fill: col("go", 0.24), stroke: col("go", 0.65) }} strokeWidth="1.5" />
      <polyline points={pts(P(fcu, field.v0), P(fcu, field.v1))} fill="none" style={{ stroke: col("go", 0.65) }} strokeWidth="1.2" />
      <ellipse cx={P(fcu, fcv)[0]} cy={P(fcu, fcv)[1]} rx="22" ry="12.5" fill="none" style={{ stroke: col("go", 0.65) }} strokeWidth="1.2" />
      <text x={P(fcu, fcv)[0]} y={P(fcu, fcv)[1] + 40} textAnchor="middle" fontSize="16" className="font-display" style={{ fill: col("mute") }}>Football field</text>
      <polygon points={flat(courts)} style={{ fill: col("violet", 0.2), stroke: col("violet", 0.55) }} strokeWidth="1.5" />
      <polyline points={pts(P(courts.u0, (courts.v0 + courts.v1) / 2), P(courts.u1, (courts.v0 + courts.v1) / 2))} fill="none" style={{ stroke: col("violet", 0.55) }} strokeWidth="1.2" />
      <text x={P(...ctr(courts))[0] + 2} y={P(...ctr(courts))[1] + 36} textAnchor="middle" fontSize="16" className="font-display" style={{ fill: col("mute") }}>Courts</text>

      {/* trees */}
      {TREES.map(([s, t], i) => { const p = P(U(s), V(t)); return <g key={i} aria-hidden><ellipse cx={p[0]} cy={p[1] + 2} rx="5" ry="2.4" style={{ fill: "rgb(0 0 0 / 0.12)" }} /><circle cx={p[0]} cy={p[1] - 5} r="5.5" style={{ fill: col("go", 0.55), stroke: col("go", 0.8) }} /></g>; })}

      {/* buildings without a name yet */}
      {others.map(({ r }, i) => {
        const h = 2 * FH;
        return (<g key={i} aria-hidden style={shadow}>
          <polygon points={pts(P(r.u0, r.v0), P(r.u0, r.v1), P(r.u0, r.v1, h), P(r.u0, r.v0, h))} style={{ fill: col("track", 0.9), ...edge }} strokeWidth="1" />
          <polygon points={pts(P(r.u0, r.v1), P(r.u1, r.v1), P(r.u1, r.v1, h), P(r.u0, r.v1, h))} style={{ fill: col("line", 0.9), ...edge }} strokeWidth="1" />
          <polygon points={flat(r, h)} style={{ fill: col("sheet"), ...edge }} strokeWidth="1" />
        </g>);
      })}

      {items.map(({ b, r, round, n }) => {
        const sel = selected === b.id;
        const unknown = b.levels === null;
        const h = n * FH;
        const topFill = sel ? col("brand", 0.92) : col("sheet");
        const [cu, cv] = ctr(r);
        const label = P(cu, cv, h);
        const common = {
          className: "bld cursor-pointer", role: "button" as const, tabIndex: 0, "aria-pressed": sel,
          "aria-label": `${b.name}${b.levels ? `, ${b.levels} floor${b.levels > 1 ? "s" : ""}` : ""}`,
          onClick: () => onSelect(b.id), onKeyDown: key(b.id), style: shadow,
        };
        const dash = unknown ? { strokeDasharray: "5 3" } : {};
        const labelEl = (dy: number) => (
          <text x={label[0]} y={label[1] - dy} textAnchor="middle" className="font-display font-bold pointer-events-none" fontSize="26"
            style={{ fill: sel ? col("brand") : col("ink"), paintOrder: "stroke", stroke: col("paper"), strokeWidth: 6, strokeLinejoin: "round" }}>{b.short}</text>
        );
        if (round) {
          const rad = (r.u1 - r.u0) / 2;
          const [x, y] = P(cu, cv);
          const rx = 1.2247 * rad * S, ry = 0.7071 * rad * S;
          const ring = <ellipse cx={x} cy={y} rx={rx * 1.55} ry={ry * 1.55} style={{ fill: col("brand", 0.2), stroke: col("brand", 0.45) }} />;
          const sideFill = sel ? col("brand", 0.4) : col("track");
          return (
            <g key={b.id}>
              {ring}
              <g {...common}>
                <path className="face" d={`M ${x - rx} ${y - h} L ${x - rx} ${y} A ${rx} ${ry} 0 0 0 ${x + rx} ${y} L ${x + rx} ${y - h} Z`} style={{ fill: sideFill, ...edge }} strokeWidth="1.5" {...dash} />
                {[1, 2].map((k) => <path key={k} d={`M ${x - rx} ${y - (h * k) / 3} A ${rx} ${ry} 0 0 0 ${x + rx} ${y - (h * k) / 3}`} fill="none" style={{ stroke: col("edge", 0.4) }} />)}
                <ellipse className="top face" cx={x} cy={y - h} rx={rx} ry={ry} style={{ fill: topFill, ...edge }} strokeWidth="1.5" />
                <path className="top face" d={`M ${x - rx * 0.88} ${y - h} A ${rx * 0.88} ${ry * 2.3} 0 0 1 ${x + rx * 0.88} ${y - h}`} style={{ fill: sel ? col("brand", 0.78) : col("paper"), ...edge }} strokeWidth="1.5" />
                {[-0.45, 0, 0.45].map((k) => <path key={k} className="pointer-events-none" d={`M ${x + rx * 0.88 * k} ${y - h - ry * 0.5 * (1 - Math.abs(k))} A ${rx * 0.08} ${ry * 2} 0 0 1 ${x + rx * 0.88 * k} ${y - h + ry * 0.2}`} fill="none" style={{ stroke: col("edge", 0.3) }} />)}
                <ellipse className="hit" cx={x} cy={y - h / 2} rx={rx * 1.1} ry={ry + h / 2 + 14} fill="transparent" />
                {labelEl(ry * 2.3 + 10)}
              </g>
              {b.places.length > 0 && <text x={x} y={y + ry * 1.55 + 22} textAnchor="middle" fontSize="16" className="font-display font-semibold pointer-events-none" style={{ fill: col("ink"), paintOrder: "stroke", stroke: col("paper"), strokeWidth: 4 }}>{b.places.join(", ")}</text>}
            </g>
          );
        }
        const slab = b.kind === "tower";
        return (
          <g key={b.id} {...common}>
            <polygon className="face" points={pts(P(r.u0, r.v0, 0), P(r.u0, r.v1, 0), P(r.u0, r.v1, h), P(r.u0, r.v0, h))} style={{ fill: col("track"), ...edge }} strokeWidth="1.5" />
            <polygon className="face" points={pts(P(r.u0, r.v1, 0), P(r.u1, r.v1, 0), P(r.u1, r.v1, h), P(r.u0, r.v1, h))} style={{ fill: col("line"), ...edge }} strokeWidth="1.5" />
            {slab && Array.from({ length: n }, (_, k) => <polyline key={k} className="pointer-events-none" points={pts(P(r.u0, r.v1, k * FH + FH * 0.5), P(r.u1, r.v1, k * FH + FH * 0.5))} fill="none" style={{ stroke: col("brand", 0.35) }} strokeWidth="3" />)}
            <Floors r={r} f={floor} n={n} selected={sel} />
            <polygon className="top face" points={flat(r, h)} style={{ fill: topFill, ...edge }} strokeWidth="1.5" {...dash} />
            <polygon className="hit" points={flat(r, h)} fill="transparent" stroke="transparent" strokeWidth="18" strokeLinejoin="round" />
            {labelEl(10)}
          </g>
        );
      })}
    </svg>
  );
}
