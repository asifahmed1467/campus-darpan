"use client";
import type { ReactNode } from "react";

/* Layout of D building, drawn from the hand sketches.
   Seen on this plan (lifts at the top), North is on the LEFT and South on the RIGHT. Standing at the lift entrance and facing
   into the floor (back to the lifts), your left hand is South and your right hand is North.
   Floors 1 to 3: 12 rooms per floor, all labs. Rooms 01 to 06 are on the South side and 07 to 12 on the North side, numbered
   from the South end: bottom row 01, 03, 05 | 08, 10, 12 and top row 02, 04, 06 | 07, 09, 11.
   The Extension (DE rooms) joins at the lifts and exists only on the 1st, 2nd and 3rd floors. */
export type DWing = "North side" | "South side" | "Extension" | null;

const COL = { south: "#2d7f8a", north: "#b86a2a", ext: "#ad5c47", edge: "#3b2f2a", slab: "#e4d8cc" };
const AX = 320;      // x of the lift entrance axis in the plan
const LAB_FLOORS = [1, 2, 3];

function Block({ x, y, w, h, color, on, door, text }: { x: number; y: number; w: number; h: number; color: string; on: boolean; door: "top" | "bottom"; text?: string }) {
  const dy = door === "bottom" ? y + h : y;
  return (<g>
    <rect x={x} y={y} width={w} height={h} rx="3" fill={on ? "rgb(var(--c-brand))" : color} fillOpacity={on ? 1 : 0.9} stroke={on ? "#fff" : COL.edge} strokeOpacity={on ? 1 : 0.5} strokeWidth={on ? 2.5 : 1} />
    <line x1={x + w / 2 - 8} x2={x + w / 2 + 8} y1={dy} y2={dy} stroke="#fff" strokeWidth="4.5" />
    {text && <text x={x + w / 2} y={y + h / 2 + (door === "bottom" ? 2 : 7)} textAnchor="middle" fontSize="12.5" fontWeight="700" className="font-display" fill="#fff" style={{ paintOrder: "stroke", stroke: "rgb(0 0 0 / 0.25)", strokeWidth: 2 }}>{text}</text>}
  </g>);
}

function Rooms({ x0, x1, n, y, h, color, on, door, k }: { x0: number; x1: number; n: number; y: number; h: number; color: string; on: boolean; door: "top" | "bottom"; k: string }) {
  const gap = 7, w = (x1 - x0 - gap * (n - 1)) / n;
  return <>{Array.from({ length: n }, (_, i) => <Block key={`${k}${i}`} x={x0 + i * (w + gap)} y={y} w={w} h={h} color={color} on={on} door={door} />)}</>;
}

const T = (x: number, y: number, t: string, size = 13, weight = 600, anchor: "start" | "middle" | "end" = "middle", fill = "rgb(var(--c-ink))"): ReactNode => (
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} className="font-display" style={{ fill }}>{t}</text>
);

/** Room numbers by position, left to right, from the sketch. */
const NORTH_TOP = [11, 9, 7], NORTH_BOTTOM = [12, 10, 8], SOUTH_TOP = [6, 4, 2], SOUTH_BOTTOM = [5, 3, 1];

export default function DFloorPlan({ floor, levels, extensionFloors, highlight, highlightRoom, onPickFloor }: {
  floor: number | null; levels: number; extensionFloors: number[]; highlight: DWing; highlightRoom: number | null; onPickFloor: (n: number | null) => void;
}) {
  const hasExt = floor === null ? true : extensionFloors.includes(floor);
  const extDim = floor !== null && !hasExt;
  const labs = floor !== null && LAB_FLOORS.includes(floor);
  const floorName = floor === null ? "every floor" : floor === 0 ? "Ground floor" : `${floor}${floor === 1 ? "st" : floor === 2 ? "nd" : floor === 3 ? "rd" : "th"} floor`;
  const code = (side: "N" | "S", n: number) => (labs ? `D${side}${floor}${String(n).padStart(2, "0")}` : String(n).padStart(2, "0"));
  const FHt = 36, base = 392;    // side view
  const rowN = (nums: number[], x0: number, x1: number, y: number, door: "top" | "bottom") => {
    const gap = 7, w = (x1 - x0 - gap * (nums.length - 1)) / nums.length;
    return nums.map((n, i) => <Block key={`n${n}`} x={x0 + i * (w + gap)} y={y} w={w} h={38} color={COL.north} door={door} text={code("N", n)} on={highlightRoom === n && highlight === "North side" || (highlight === "North side" && highlightRoom === null)} />);
  };
  const rowS = (nums: number[], x0: number, x1: number, y: number, door: "top" | "bottom") => {
    const gap = 7, w = (x1 - x0 - gap * (nums.length - 1)) / nums.length;
    return nums.map((n, i) => <Block key={`s${n}`} x={x0 + i * (w + gap)} y={y} w={w} h={38} color={COL.south} door={door} text={code("S", n)} on={highlightRoom === n && highlight === "South side" || (highlight === "South side" && highlightRoom === null)} />);
  };
  return (
    <figure className="rounded-2xl border border-line bg-paper p-3 sm:p-4">
      <figcaption className="mb-3">
        <h3 className="text-xl font-bold">D building layout, {floorName}{labs ? ", labs only" : ""}</h3>
        <p className="text-[15px] text-mute">On this plan North is on the left and South is on the right. Standing at the lift entrance and facing into the floor, your left hand is South and your right hand is North. From a hand sketch, not to scale.</p>
      </figcaption>
      <div className="grid gap-4 md:grid-cols-[1fr_13rem]">
        <svg viewBox="0 0 640 520" className="w-full" role="img" aria-label="D building floor layout. The Extension and the lifts are at the top. The full floor is at the bottom with 12 rooms: North side rooms 07 to 12 on the left and South side rooms 01 to 06 on the right.">
          <defs>
            <linearGradient id="dnorth" x1="0" x2="1"><stop offset="0" stopColor={COL.north} stopOpacity="0.22" /><stop offset="1" stopColor={COL.north} stopOpacity="0.06" /></linearGradient>
            <linearGradient id="dsouth" x1="0" x2="1"><stop offset="0" stopColor={COL.south} stopOpacity="0.06" /><stop offset="1" stopColor={COL.south} stopOpacity="0.22" /></linearGradient>
            <marker id="darr" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="rgb(var(--c-ink))" /></marker>
          </defs>

          {/* Extension (1st to 3rd floor only) */}
          <g opacity={extDim ? 0.3 : 1}>
            <rect x={AX - 40} y="16" width="244" height="118" rx="6" fill={COL.slab} fillOpacity="0.7" stroke={COL.edge} strokeOpacity="0.7" strokeWidth="1.6" strokeDasharray={extDim ? "6 5" : undefined} />
            <Rooms x0={AX - 30} x1={AX + 194} n={3} y={22} h={36} color={COL.ext} on={highlight === "Extension"} door="bottom" k="en" />
            <Rooms x0={AX - 30} x1={AX + 194} n={3} y={92} h={36} color={COL.ext} on={highlight === "Extension"} door="top" k="es" />
            {T(AX + 82, 80, "Extension", 15, 700)}
          </g>
          {extDim ? T(AX + 82, 152, "No Extension on this floor", 13, 700) : T(AX + 82, 152, "Extension: 1st, 2nd and 3rd floors only", 12.5, 600, "middle", "rgb(var(--c-mute))")}
          <g stroke={COL.edge} strokeWidth="2" opacity={extDim ? 0.3 : 1}><line x1={AX - 9} y1="134" x2={AX - 9} y2="172" /><line x1={AX + 9} y1="134" x2={AX + 9} y2="172" /></g>

          {/* lifts and stairs */}
          {[[AX - 62, 172], [AX + 20, 172]].map(([x, y], i) => <g key={i}><rect x={x} y={y} width="42" height="54" rx="3" fill="#eef1f4" stroke="#4f565e" strokeWidth="1.6" /><line x1={x + 21} x2={x + 21} y1={y + 6} y2={y + 48} stroke="#4f565e" /><path d={`M ${x + 8} ${y + 20} l 5 -7 l 5 7 M ${x + 24} ${y + 34} l 5 7 l 5 -7`} stroke="#4f565e" fill="none" strokeWidth="1.3" /></g>)}
          {T(AX - 41, 166, "Lift", 13, 700)}{T(AX + 41, 166, "Lift", 13, 700)}
          {[[AX - 62, 246], [AX + 20, 246]].map(([x, y], i) => <rect key={i} x={x} y={y} width="42" height="54" rx="3" fill="#eef1f4" stroke="#4f565e" strokeWidth="1.6" />)}
          <g stroke="#4f565e" strokeWidth="2"><line x1="470" y1="206" x2="470" y2="340" /><line x1="496" y1="206" x2="496" y2="340" />
            {Array.from({ length: 8 }, (_, i) => <line key={i} x1="470" x2="496" y1={212 + i * 16.5} y2={212 + i * 16.5} strokeWidth="1.2" />)}</g>
          {T(483, 198, "Stairs", 13, 700)}{T(483, 358, "Stairs entrance", 12.5, 700)}

          {/* entrance between the lifts and the full floor */}
          <g stroke={COL.edge} strokeWidth="2"><line x1={AX - 9} y1="300" x2={AX - 9} y2="372" /><line x1={AX + 9} y1="300" x2={AX + 9} y2="372" /></g>
          {T(AX, 346, "Lift entrance", 13, 700)}

          {/* full floor: North on the left, South on the right */}
          <rect x="16" y="372" width={AX - 16} height="136" rx="6" fill="url(#dnorth)" stroke={COL.edge} strokeOpacity="0.7" strokeWidth="1.8" />
          <rect x={AX} y="372" width={624 - AX} height="136" rx="6" fill="url(#dsouth)" stroke={COL.edge} strokeOpacity="0.7" strokeWidth="1.8" />
          {rowN(NORTH_TOP, 24, AX - 8, 378, "bottom")}{rowN(NORTH_BOTTOM, 24, AX - 8, 464, "top")}
          {rowS(SOUTH_TOP, AX + 8, 616, 378, "bottom")}{rowS(SOUTH_BOTTOM, AX + 8, 616, 464, "top")}
          <line x1="22" x2="616" y1="440" y2="440" stroke={COL.edge} strokeOpacity="0.25" strokeDasharray="2 6" />
          {T(AX - 160, 438, "NORTH", 20, 800, "middle", COL.north)}{T(AX - 160, 457, "DN rooms 07 to 12", 12, 600, "middle", "rgb(var(--c-mute))")}
          {T(AX + 160, 438, "SOUTH", 20, 800, "middle", COL.south)}{T(AX + 160, 457, "DS rooms 01 to 06", 12, 600, "middle", "rgb(var(--c-mute))")}
          {T(618, 366, "Full floor", 13, 700, "end")}

          {/* you: at the lift entrance, facing into the floor */}
          <g aria-hidden>
            <circle cx={AX} cy="426" r="7" fill="rgb(var(--c-ink))" stroke="#fff" strokeWidth="2" />
            <line x1={AX} y1="434" x2={AX} y2="460" stroke="rgb(var(--c-ink))" strokeWidth="2.2" markerEnd="url(#darr)" />
            <line x1={AX - 14} y1="440" x2={AX - 52} y2="440" stroke={COL.north} strokeWidth="2.6" markerEnd="url(#darr)" />
            <line x1={AX + 14} y1="440" x2={AX + 52} y2="440" stroke={COL.south} strokeWidth="2.6" markerEnd="url(#darr)" />
          </g>

          {/* direction key */}
          <g transform="translate(16 18)">
            <rect width="190" height="124" rx="10" fill="rgb(var(--c-sheet))" stroke="rgb(var(--c-line))" />
            {T(95, 20, "Standing at the lift entrance", 12, 700)}{T(95, 36, "and facing into the floor", 12, 700)}
            <circle cx="95" cy="62" r="5" fill="rgb(var(--c-ink))" />
            <line x1="95" y1="68" x2="95" y2="100" stroke="rgb(var(--c-ink))" strokeWidth="2" markerEnd="url(#darr)" />
            {T(84, 86, "N", 17, 800, "end", COL.north)}{T(106, 86, "S", 17, 800, "start", COL.south)}
            {T(10, 66, "right hand", 11.5, 600, "start", "rgb(var(--c-mute))")}{T(180, 66, "left hand", 11.5, 600, "end", "rgb(var(--c-mute))")}
            {T(10, 114, "= North", 11.5, 700, "start", COL.north)}{T(180, 114, "South =", 11.5, 700, "end", COL.south)}
          </g>
        </svg>

        {/* side view: pick a floor */}
        <div>
          <h4 className="font-display font-semibold">Side view</h4>
          <svg viewBox="0 0 208 420" className="mx-auto w-full max-w-[13rem]" role="group" aria-label="Side view of D building and Annex 9. Select a floor.">
            
            <line x1="6" x2="202" y1={base} y2={base} stroke={COL.edge} strokeOpacity="0.5" strokeWidth="2" />
            {/* Annex 9 with its two bridges */}
            {Array.from({ length: 5 }, (_, n) => <rect key={n} x="8" y={base - (n + 1) * FHt} width="44" height={FHt - 2} rx="2" fill="#d3a24a" fillOpacity="0.9" stroke={COL.edge} strokeOpacity="0.45" />)}
            {T(30, base + 16, "Annex 9", 12, 700)}
            {[2, 3].map((n) => <rect key={n} x="52" y={base - (n + 1) * FHt + 9} width="20" height={FHt - 20} fill="#8fc0d8" stroke="#4d7f98" />)}
            {/* D tower */}
            {Array.from({ length: levels }, (_, n) => {
              const on = floor === n, y = base - (n + 1) * FHt;
              return (
                <g key={n} className="cursor-pointer" role="button" tabIndex={0} aria-pressed={on} aria-label={`D building, floor ${n}`}
                  onClick={() => onPickFloor(on ? null : n)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPickFloor(on ? null : n); } }}>
                  <rect x="72" y={y} width="72" height={FHt - 2} rx="2" fill={on ? "rgb(var(--c-go))" : "#ad5c47"} fillOpacity={on ? 1 : 0.9} stroke={on ? "#fff" : COL.edge} strokeOpacity={on ? 1 : 0.5} strokeWidth={on ? 2 : 1} />
                  {T(108, y + FHt / 2 + 4, n === 0 ? "G" : String(n), 14, 700, "middle", "#fff")}
                </g>
              );
            })}
            {T(108, base + 16, "D", 12, 700)}
            {/* Extension on the 1st to 3rd floors */}
            {extensionFloors.map((n) => <rect key={n} x="144" y={base - (n + 1) * FHt} width="44" height={FHt - 2} rx="2" fill="#c98a76" fillOpacity={floor === n ? 1 : 0.9} stroke={floor === n ? "rgb(var(--c-go))" : COL.edge} strokeOpacity={floor === n ? 1 : 0.5} strokeWidth={floor === n ? 2.5 : 1} />)}
            {T(166, base + 16, "Ext.", 12, 700)}
          </svg>
          <p className="mt-1 text-[13.5px] leading-snug text-mute">G = ground floor. Ext. = Extension (1st to 3rd floors). Tap a floor to see it. Annex 9 joins D by bridges on the 2nd and 3rd floors.</p>
        </div>
      </div>
    </figure>
  );
}
