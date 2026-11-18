"use client";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

export interface CampusBuilding {
  id: string; name: string; short: string; kind: string; levels: number | null; note: string; places: string[];
  floors: { n: number; label: string }[]; extension_floors?: number[]; pending_floors?: number[]; floor_notes?: Record<string, string>; formats?: { code: string; meaning: string }[];
}

/* ---------------------------------------------------------------------------------------------
   Campus layout. s runs along the football field (left to right), t across it (t = 0 is the field's
   back edge, t = 1 its front edge). A building is { s0, s1, t0, t1 }. This is a schematic of how the
   buildings sit next to each other, not a surveyed plan. To move something, change the numbers here.
   --------------------------------------------------------------------------------------------- */
export type Box = { s0: number; s1: number; t0: number; t1: number };
export const PLAN: Record<string, Box> = {
  D:  { s0: 1.50, s1: 1.72, t0: -0.45, t1: 0.55 },     // tall slab at the right end
  A9: { s0: 1.50, s1: 1.72, t0: -1.85, t1: -0.85 },    // same shape as D, in line with it on its back side
  C:  { s0: 0.96, s1: 1.20, t0: -1.52, t1: -1.09 },    // round building (a circle in plan)
  A6: { s0: 0.38, s1: 0.56, t0: -2.40, t1: -1.60 },    // two long buildings side by side, running front to back
  A5: { s0: 0.08, s1: 0.26, t0: -2.40, t1: -1.60 },
  A2: { s0: -0.10, s1: 0.45, t0: -0.40, t1: -0.12 },   // low strips along the field's back edge
  A1: { s0: 0.55, s1: 1.12, t0: -0.42, t1: -0.14 },
  A4: { s0: -0.58, s1: -0.38, t0: -1.80, t1: -1.00 },  // two long buildings at the left end, end to end
  A3: { s0: -0.52, s1: -0.32, t0: -0.88, t1: -0.08 },
  A7: { s0: -1.62, s1: -1.30, t0: -1.95, t1: -0.45 },  // architecture building, far left
};
export const FIELD: Box = { s0: 0, s1: 1, t0: 0, t1: 1 };
export const PARKING: Box = { s0: 0.90, s1: 1.38, t0: -2.32, t1: -1.66 };
export const LAWN: Box = { s0: 0.42, s1: 0.82, t0: -1.05, t1: -0.68 };
const PLATE: Box = { s0: -1.95, s1: 2.6, t0: -2.65, t1: 1.3 };
export const TREES: [number, number][] = [[0.78, -2.05], [0.8, -1.7], [1.6, -2.1], [1.62, -1.4], [1.9, -1.2], [0.3, -1.3], [0.28, -1.1], [0.9, -0.8],
  [1.3, -0.9], [1.45, -1.0], [-0.3, -1.1], [-0.42, -0.1], [0.5, 1.0], [1.0, 1.0], [1.4, 1.02], [1.9, 0.75], [2.3, 0.8], [2.35, -1.2],
  [-0.5, 0.2], [-1.0, 0.1], [-1.0, -1.4], [0.2, -0.62], [1.85, -0.7], [2.3, -0.9], [-1.4, 0.3], [-0.2, -1.9], [1.8, -2.2]];

/* One colour set per building so each can be told apart: wall facing left, wall facing right, roof, window glass. */
export const BUILDING_COLORS: Record<string, { l: string; r: string; roof: string; win: string }> = {
  D:  { l: "#8a4535", r: "#ad5c47", roof: "#d6c4b8", win: "#f6dfc4" },
  A9: { l: "#b4822f", r: "#d3a24a", roof: "#efe0bd", win: "#fff3d2" },
  C:  { l: "#cdbf9f", r: "#eadfc6", roof: "#f5eedb", win: "#7fb2cf" },
  A1: { l: "#25727a", r: "#37929a", roof: "#bfe3e2", win: "#e1f6f6" },
  A2: { l: "#467f47", r: "#5f9e60", roof: "#cfe7ce", win: "#e6f5e4" },
  A3: { l: "#44579a", r: "#5a72bb", roof: "#d0d8f1", win: "#e5ebfb" },
  A4: { l: "#71509b", r: "#8d6bb8", roof: "#ddd1ee", win: "#f0e9fa" },
  A5: { l: "#b4662a", r: "#d6823f", roof: "#f2d8bc", win: "#fdebd6" },
  A6: { l: "#aa4258", r: "#cc5f76", roof: "#f0cbd4", win: "#fbe3e8" },
  A7: { l: "#4f565e", r: "#6c747d", roof: "#d6d9dc", win: "#e9edf0" },
};
const FALLBACK = { l: "#6b7280", r: "#8a919c", roof: "#dde0e4", win: "#f1f3f5" };
const UNKNOWN_LEVELS = 3;      // drawn height when the floor count has not been given yet
const C_LEVELS = 4;            // drawn height of the round C building
const SUB: Record<string, string> = { A7: "Architecture" };

const SU = 50, SV = 28;        // plan units per s and per t
const U = (s: number) => SU * (s + 1.95);
const V = (t: number) => SV * (t + 2.65);
const S = 3.5, C = 0.866, SN = 0.5, FH = 9, OX = 16, OY = 330;
type Pt = readonly [number, number];
const P = (u: number, v: number, z = 0): Pt => [OX + (u + v) * C * S, OY + (v - u) * SN * S - z];
const pts = (...a: Pt[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
const col = (name: string, a = 1) => `rgb(var(--c-${name}) / ${a})`;
const rect = (b: Box) => ({ u0: U(b.s0), u1: U(b.s1), v0: V(b.t0), v1: V(b.t1) });
type R = ReturnType<typeof rect>;
const flat = (r: R, z = 0) => pts(P(r.u0, r.v0, z), P(r.u1, r.v0, z), P(r.u1, r.v1, z), P(r.u0, r.v1, z));
const ctr = (r: R): [number, number] => [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2];
const inset = (r: R, k: number): R => { const du = (r.u1 - r.u0) * k, dv = (r.v1 - r.v0) * k; return { u0: r.u0 + du, u1: r.u1 - du, v0: r.v0 + dv, v1: r.v1 - dv }; };

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

const EDGE = "rgb(20 25 45 / 0.55)";

/** A solid box: left wall, right wall and roof. */
function Prism({ r, z0 = 0, z1, c, roof, sw = 1 }: { r: R; z0?: number; z1: number; c: { l: string; r: string; roof: string }; roof?: string; sw?: number }) {
  return (<>
    <polygon points={pts(P(r.u0, r.v0, z0), P(r.u0, r.v1, z0), P(r.u0, r.v1, z1), P(r.u0, r.v0, z1))} fill={c.l} stroke={EDGE} strokeWidth={sw} strokeLinejoin="round" />
    <polygon points={pts(P(r.u0, r.v1, z0), P(r.u1, r.v1, z0), P(r.u1, r.v1, z1), P(r.u0, r.v1, z1))} fill={c.r} stroke={EDGE} strokeWidth={sw} strokeLinejoin="round" />
    <polygon points={flat(r, z1)} fill={roof ?? c.roof} stroke={EDGE} strokeWidth={sw} strokeLinejoin="round" />
  </>);
}

/** Rows of windows on both visible walls, one row per floor. */
function Windows({ r, n, win }: { r: R; n: number; win: string }) {
  const rows: ReactNode[] = [];
  const pad = 1.2;
  for (let k = 0; k < n; k++) {
    const z = k * FH + FH * 0.52;
    rows.push(<polyline key={`a${k}`} points={pts(P(r.u0 + pad, r.v1, z), P(r.u1 - pad, r.v1, z))} fill="none" stroke={win} strokeOpacity="0.78" strokeWidth={FH * 0.4} strokeDasharray="5.5 4.5" />);
    rows.push(<polyline key={`b${k}`} points={pts(P(r.u0, r.v0 + pad, z), P(r.u0, r.v1 - pad, z))} fill="none" stroke={win} strokeOpacity="0.5" strokeWidth={FH * 0.4} strokeDasharray="5.5 4.5" />);
  }
  return <g className="pointer-events-none" aria-hidden>{rows}</g>;
}

function FloorBand({ r, f, n }: { r: R; f: number | null; n: number }) {
  if (f === null || f >= n) return null;
  const z0 = f * FH, z1 = (f + 1) * FH;
  return (<g className="pointer-events-none" aria-hidden>
    <polygon points={pts(P(r.u0, r.v1, z0), P(r.u1, r.v1, z0), P(r.u1, r.v1, z1), P(r.u0, r.v1, z1))} fill="rgb(var(--c-go))" fillOpacity="0.9" stroke="#fff" strokeWidth="1.5" />
    <polygon points={pts(P(r.u0, r.v0, z0), P(r.u0, r.v1, z0), P(r.u0, r.v1, z1), P(r.u0, r.v0, z1))} fill="rgb(var(--c-go))" fillOpacity="0.75" stroke="#fff" strokeWidth="1.5" />
  </g>);
}

export default function CampusMap({ buildings, selected, floor, onSelect }: {
  buildings: CampusBuilding[]; selected: string | null; floor: number | null; onSelect: (id: string) => void;
}) {
  const items = order(buildings.filter((b) => PLAN[b.id]).map((b) => ({ b, r: rect(PLAN[b.id]), n: b.id === "C" ? C_LEVELS : b.levels ?? UNKNOWN_LEVELS })));
  const key = (id: string) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } };
  const shadow: CSSProperties = { filter: "drop-shadow(4px 6px 3px rgb(0 0 0 / 0.2))" };
  const plate = rect(PLATE), field = rect(FIELD), parking = rect(PARKING), lawn = rect(LAWN);
  const [fcu, fcv] = ctr(field);
  const bridgeLeft = rect(PLAN.A9), bridgeRight = rect(PLAN.D);   // Annex 9 is behind D along its long side

  // The view is cropped to the buildings and grounds; the ground plate continues past the edge.
  const area = [field, parking, lawn, ...items.map((i) => i.r)];
  const cs = area.flatMap((r) => [P(r.u0, r.v0), P(r.u1, r.v0), P(r.u1, r.v1), P(r.u0, r.v1)]);
  const minX = Math.min(...cs.map((p) => p[0])) - 34, maxX = Math.max(...cs.map((p) => p[0])) + 48;
  const topY = Math.min(...items.map((i) => P(i.r.u0, i.r.v0, i.n * FH)[1] - 70)) - 6;
  const botY = Math.max(...cs.map((p) => p[1])) + 46;
  const treeOk = (s: number, t: number) => !Object.values(PLAN).some((b) => s > b.s0 - 0.1 && s < b.s1 + 0.1 && t > b.t0 - 0.2 && t < b.t1 + 0.2)
;

  return (
    <svg viewBox={`${minX.toFixed(0)} ${topY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(botY - topY).toFixed(0)}`} className="w-full"
      role="group" aria-label="Campus map. Select a building." style={{ touchAction: "manipulation" }}>
      <polygon points={flat(plate)} style={{ fill: col("sheet"), stroke: col("line") }} strokeWidth="2" strokeLinejoin="round" />

      {/* parking lot */}
      <polygon points={flat(parking)} fill="#9aa1ab" fillOpacity="0.5" stroke={EDGE} strokeOpacity="0.4" />
      {[0.14, 0.28, 0.42, 0.56, 0.7, 0.84].map((k) => <polyline key={k} points={pts(P(parking.u0 + (parking.u1 - parking.u0) * k, parking.v0 + 2), P(parking.u0 + (parking.u1 - parking.u0) * k, parking.v1 - 2))} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.3" strokeDasharray="3 3" />)}
      <text x={P(parking.u0 + (parking.u1 - parking.u0) * 0.8, parking.v0 + (parking.v1 - parking.v0) * 0.3)[0]} y={P(parking.u0 + (parking.u1 - parking.u0) * 0.8, parking.v0 + (parking.v1 - parking.v0) * 0.3)[1] + 5} textAnchor="middle" fontSize="15" className="font-display" style={{ fill: col("mute"), paintOrder: "stroke", stroke: col("paper"), strokeWidth: 3 }}>Parking</text>

      {/* garden and pond */}
      <polygon points={flat(lawn)} fill="#7cc27c" fillOpacity="0.35" stroke="#4e9a52" strokeOpacity="0.6" />
      <ellipse cx={P(...ctr(lawn))[0]} cy={P(...ctr(lawn))[1]} rx="16" ry="8" fill="#6fb6dd" fillOpacity="0.75" stroke="#3b86b0" />

      {/* football field */}
      <polygon points={flat(field)} fill="#4fae5a" fillOpacity="0.5" stroke="#2f8a3d" strokeWidth="1.5" />
      {[0.2, 0.4, 0.6, 0.8].map((k) => <polygon key={k} points={pts(P(field.u0 + (field.u1 - field.u0) * k, field.v0), P(field.u0 + (field.u1 - field.u0) * (k + 0.1), field.v0), P(field.u0 + (field.u1 - field.u0) * (k + 0.1), field.v1), P(field.u0 + (field.u1 - field.u0) * k, field.v1))} fill="#fff" fillOpacity="0.07" />)}
      <polyline points={pts(P(fcu, field.v0), P(fcu, field.v1))} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" />
      <ellipse cx={P(fcu, fcv)[0]} cy={P(fcu, fcv)[1]} rx="22" ry="12.5" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" />
      <polygon points={flat(field)} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.4" transform="translate(0 0)" />
      <text x={P(fcu, fcv)[0]} y={P(fcu, fcv)[1] + 42} textAnchor="middle" fontSize="16" className="font-display" style={{ fill: col("ink"), paintOrder: "stroke", stroke: col("paper"), strokeWidth: 4 }}>Football field</text>

      {/* trees */}
      {TREES.filter(([s, t]) => treeOk(s, t)).map(([s, t], i) => { const p = P(U(s), V(t)); return (
        <g key={i} aria-hidden><ellipse cx={p[0]} cy={p[1] + 2} rx="5.5" ry="2.6" fill="rgb(0 0 0 / 0.14)" /><rect x={p[0] - 0.8} y={p[1] - 3} width="1.6" height="5" fill="#7a5a3a" />
          <circle cx={p[0]} cy={p[1] - 8} r="6.5" fill="#3f9a4a" stroke="#2c7a37" /><circle cx={p[0] - 2} cy={p[1] - 10} r="3" fill="#6cc27a" fillOpacity="0.7" /></g>); })}

      {items.map(({ b, r, n }) => {
        const sel = selected === b.id;
        const dim = 1;
        const c = BUILDING_COLORS[b.id] ?? FALLBACK;
        const h = n * FH;
        const [cu, cv] = ctr(r);
        const unknown = b.levels === null && b.id !== "C";
        const common = {
          className: "bld cursor-pointer", role: "button" as const, tabIndex: 0, "aria-pressed": sel,
          "aria-label": `${b.name}${b.levels ? `, ${b.levels} floor${b.levels > 1 ? "s" : ""}` : ""}`,
          onClick: () => onSelect(b.id), onKeyDown: key(b.id), style: { ...shadow, opacity: dim } as CSSProperties,
        };
        const ring = sel ? { stroke: "rgb(var(--c-brand))", strokeWidth: 3 } : {};
        const labelAt = P(cu, cv, h);
        const label = (dy: number, sub?: string) => (<>
          {sub && <text x={labelAt[0]} y={labelAt[1] - dy - 22} textAnchor="middle" className="font-display font-semibold pointer-events-none" fontSize="15" style={{ fill: col("ink"), paintOrder: "stroke", stroke: col("paper"), strokeWidth: 4, strokeLinejoin: "round" }}>{sub}</text>}
          <text x={labelAt[0]} y={labelAt[1] - dy} textAnchor="middle" className="font-display font-bold pointer-events-none" fontSize={b.id === "D" || b.id === "C" ? 25 : 17}
            style={{ fill: sel ? col("brand") : col("ink"), paintOrder: "stroke", stroke: col("paper"), strokeWidth: 6, strokeLinejoin: "round" }}>{b.id.startsWith("A") ? `Annex ${b.short}` : b.short}</text>
        </>);

        if (b.id === "C") {
          // round building: cylinder with a glass dome
          const rad = Math.min(r.u1 - r.u0, r.v1 - r.v0) / 2;
          const [x, y] = P(cu, cv);
          const rx = 1.2247 * rad * S, ry = 0.7071 * rad * S;
          const top = y - h;
          const dome = rx * 0.78;
          const arcs = [0.28, 0.58, 0.86].map((f) => Math.sqrt(1 - f * f));
          return (
            <g key={b.id}>
              <ellipse cx={x} cy={y + 1} rx={rx * 1.7} ry={ry * 1.7} fill="#d9d2bd" stroke={EDGE} strokeOpacity="0.4" />
              <ellipse cx={x} cy={y + 1} rx={rx * 1.38} ry={ry * 1.38} fill="#ece6d3" stroke={EDGE} strokeOpacity="0.3" />
              <g {...common}>
                <path d={`M ${x - rx} ${top} L ${x - rx} ${y} A ${rx} ${ry} 0 0 0 ${x + rx} ${y} L ${x + rx} ${top} Z`} fill={c.r} stroke={EDGE} strokeWidth="1.2" {...ring} />
                <path d={`M ${x - rx} ${top} L ${x - rx} ${y} A ${rx} ${ry} 0 0 0 ${x - rx * 0.1} ${y + ry} L ${x - rx * 0.1} ${top + ry} A ${rx} ${ry} 0 0 1 ${x - rx} ${top} Z`} fill={c.l} fillOpacity="0.55" className="pointer-events-none" />
                {Array.from({ length: n }, (_, k) => { const z = y - k * FH - FH * 0.52; return <path key={k} className="pointer-events-none" d={`M ${x - rx + 2} ${z} A ${rx - 2} ${ry - 1} 0 0 0 ${x + rx - 2} ${z}`} fill="none" stroke={c.win} strokeWidth={FH * 0.42} strokeOpacity="0.85" strokeDasharray="4 3" />; })}
                {Array.from({ length: 13 }, (_, k) => { const a = (k / 12) * Math.PI; const px = x - rx * Math.cos(a), py = y + ry * Math.sin(a); return <line key={k} className="pointer-events-none" x1={px} y1={py} x2={px} y2={py - h} stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" />; })}
                <ellipse cx={x} cy={top} rx={rx} ry={ry} fill={c.roof} stroke={EDGE} strokeWidth="1.2" {...ring} />
                <ellipse cx={x} cy={top} rx={rx * 0.92} ry={ry * 0.92} fill="none" stroke="#b9ad8c" strokeWidth="2" />
                <path d={`M ${x - dome} ${top} A ${dome} ${dome * 0.95} 0 0 1 ${x + dome} ${top} A ${dome} ${dome * 0.5} 0 0 1 ${x - dome} ${top} Z`} fill={c.win} fillOpacity="0.92" stroke="#2f6f93" strokeWidth="1.2" />
                {[0.34, 0.7].map((f, i) => <path key={i} className="pointer-events-none" d={`M ${x - dome * f} ${top + dome * 0.5 * Math.sqrt(1 - f * f) * 0.9} A ${dome * f} ${dome * 0.95} 0 0 1 ${x + dome * f} ${top + dome * 0.5 * Math.sqrt(1 - f * f) * 0.9}`} fill="none" stroke="#fff" strokeOpacity="0.55" />)}
                {arcs.map((w, i) => { const f = [0.28, 0.58, 0.86][i]; const yy = top - dome * 0.95 * f; return <path key={i} className="pointer-events-none" d={`M ${x - dome * w} ${yy} A ${dome * w} ${dome * w * 0.5} 0 0 0 ${x + dome * w} ${yy}`} fill="none" stroke="#fff" strokeOpacity="0.5" />; })}
                <path d={`M ${x - dome * 0.55} ${top - dome * 0.42} L ${x - dome * 0.2} ${top - dome * 0.98} M ${x + dome * 0.55} ${top - dome * 0.42} L ${x + dome * 0.2} ${top - dome * 0.98}`} fill="none" stroke="#fff" strokeOpacity="0.35" className="pointer-events-none" />
                <line x1={x} y1={top - dome * 0.95} x2={x} y2={top - dome * 0.95 - 9} stroke="#444" strokeWidth="1.5" />
                <circle cx={x} cy={top - dome * 0.95 - 10} r="2" fill="#c8a24a" />
                <ellipse className="hit" cx={x} cy={(y + top) / 2 - dome * 0.4} rx={rx * 1.15} ry={ry + (h + dome) / 2 + 6} fill="transparent" />
                {label(dome * 0.95 + 18)}
              </g>
            </g>
          );
        }

        const tower = b.id === "D" || b.id === "A9";
        const roofIn = inset(r, 0.2);
        return (
          <g key={b.id}>
            {b.id === "D" && [2, 3].map((fl) => {
              // two bridges between Annex 9 and D, on the 2nd and 3rd floors
              const br: R = { u0: bridgeRight.u0 + 3.2, u1: bridgeRight.u1 - 3.2, v0: bridgeLeft.v1, v1: bridgeRight.v0 };
              return <g key={fl} style={{ opacity: dim }} aria-hidden><Prism r={br} z0={fl * FH + 1.5} z1={(fl + 1) * FH - 1.5} c={{ l: "#6d9bb2", r: "#8fc0d8", roof: "#c9e4f1" }} sw={0.8} />
                <polyline points={pts(P(br.u0, br.v1, fl * FH + FH * 0.5), P(br.u1, br.v1, fl * FH + FH * 0.5))} stroke="#fff" strokeOpacity="0.7" strokeWidth="2.4" fill="none" /></g>;
            })}
            <g {...common}>
              <Prism r={r} z1={h} c={c} sw={1.2} />
              <Windows r={r} n={n} win={c.win} />
              <polygon points={flat(roofIn, h)} fill="#000" fillOpacity="0.06" stroke={EDGE} strokeOpacity="0.35" className="pointer-events-none" />
              {tower && <Prism r={inset(r, 0.34)} z0={h} z1={h + 7} c={{ l: c.l, r: c.r, roof: c.roof }} sw={0.9} />}
              {sel && <polygon points={flat(r, h)} fill="none" stroke="rgb(var(--c-brand))" strokeWidth="3" strokeLinejoin="round" className="pointer-events-none" />}
              {unknown && <polygon points={flat(r, h)} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" strokeDasharray="5 4" className="pointer-events-none" />}
              <FloorBand r={r} f={sel ? floor : null} n={n} />
              <polygon className="hit" points={flat(r, h)} fill="transparent" stroke="transparent" strokeWidth="18" strokeLinejoin="round" />
              {label(tower ? (b.id === "D" ? 27 : 25) : 10, SUB[b.id])}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
