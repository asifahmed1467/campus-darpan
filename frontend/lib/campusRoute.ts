/**
 * Walking routes on the campus plan. The walkways form a small graph; a route is the shortest way from
 * either entrance (main gate or the direct Annex 2 gate) to the nearest face of the chosen building.
 * Plan units (s across, t along), same schematic plan as the flat map.
 */
import { FIELD, LAWN, PLAN, type Box } from "@/components/CampusMap";

export const SX = 30, SZ = 19;                          // plan units -> metres-ish (same as Campus3D)
export type Pt = [number, number];

export const GATES = {
  main: { s: 1.3, t: 1.32, name: "Main gate" },
  annex2: { s: -0.14, t: 1.32, name: "Annex 2 gate" },
} as const;
export type GateId = keyof typeof GATES;

const SPINE_S = 1.3, BACK_T = -0.05, REAR_T = -0.95, LEFT_S = -0.14;

/** Walkways as ordered points; junction points are listed on every walkway that meets there. */
export const WALKWAYS: Pt[][] = [
  [[SPINE_S, GATES.main.t], [SPINE_S, BACK_T], [SPINE_S, REAR_T], [SPINE_S, -2.0]],
  [[-1.2, BACK_T], [LEFT_S, BACK_T], [SPINE_S, BACK_T]],
  [[-1.2, REAR_T], [SPINE_S, REAR_T]],
  [[LEFT_S, GATES.annex2.t], [LEFT_S, BACK_T]],        // direct way from the road up the field's left edge to Annex 2
];

const STUBS = [6, 16];                                   // metres from a walkway to a door: short first, longer only if nothing else reaches
const m = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * SX, (a[1] - b[1]) * SZ);
const key = (p: Pt) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

type Graph = { nodes: Map<string, Pt>; adj: Map<string, [string, number][]> };
let graph: Graph | null = null;

function build(): Graph {
  const nodes = new Map<string, Pt>(), adj = new Map<string, [string, number][]>();
  const add = (p: Pt) => { const k = key(p); if (!nodes.has(k)) { nodes.set(k, p); adj.set(k, []); } return k; };
  const link = (a: string, b: string) => { const d = m(nodes.get(a)!, nodes.get(b)!); adj.get(a)!.push([b, d]); adj.get(b)!.push([a, d]); };
  for (const way of WALKWAYS) {
    for (let i = 1; i < way.length; i++) {
      const a = way[i - 1], b = way[i], n = Math.max(1, Math.ceil(m(a, b) / 1.5));
      let prev = add(a);
      for (let j = 1; j <= n; j++) {
        const p: Pt = j === n ? b : [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n];
        const k = add(p); link(prev, k); prev = k;
      }
    }
  }
  return { nodes, adj };
}

function dijkstra(g: Graph, from: string) {
  const dist = new Map<string, number>([[from, 0]]), prev = new Map<string, string>();
  const todo = new Set<string>([from]);
  while (todo.size) {
    let u = "", best = Infinity;
    for (const k of todo) { const d = dist.get(k)!; if (d < best) { best = d; u = k; } }
    todo.delete(u);
    for (const [v, w] of g.adj.get(u)!) {
      const nd = best + w;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); todo.add(v); }
    }
  }
  return { dist, prev };
}

const nearestOn = (b: Box, p: Pt): Pt => [Math.min(Math.max(p[0], b.s0), b.s1), Math.min(Math.max(p[1], b.t0), b.t1)];
const crosses = (a: Pt, b: Pt, others: Box[]) => {
  for (let i = 1; i < 8; i++) {
    const s = a[0] + ((b[0] - a[0]) * i) / 8, t = a[1] + ((b[1] - a[1]) * i) / 8;
    if (others.some((o) => s > o.s0 - 0.01 && s < o.s1 + 0.01 && t > o.t0 - 0.02 && t < o.t1 + 0.02)) return true;
  }
  return false;
};
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (out.length && m(out[out.length - 1], p) < 0.01) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (Math.abs(cross) < 1e-6) out.pop(); else break;
    }
    out.push(p);
  }
  return out;
}

export interface Route { points: Pt[]; gate: GateId; metres: number }

/** Shortest walking route to a building from whichever entrance is nearer. */
export function bestRoute(id: string): Route | null {
  const target = PLAN[id];
  if (!target) return null;
  graph ??= build();
  const g = graph;
  const others = [...Object.entries(PLAN).filter(([k]) => k !== id).map(([, v]) => v), FIELD, LAWN];   // no shortcuts over buildings, the pitch or the pond lawn
  let best: (Route & { cost: number }) | null = null;
  for (const maxStub of STUBS) {
    for (const gate of Object.keys(GATES) as GateId[]) {
      const start = key([GATES[gate].s, GATES[gate].t]);
      const { dist, prev } = dijkstra(g, start);
      for (const [k, p] of g.nodes) {
        const d = dist.get(k);
        if (d === undefined) continue;
        const q = nearestOn(target, p);
        if (m(p, q) > maxStub || crosses(p, q, others)) continue;
        const cost = d + m(p, q);
        if (!best || cost < best.cost) {
          const way: Pt[] = [];
          for (let c: string | undefined = k; c; c = prev.get(c)) way.push(g.nodes.get(c)!);
          way.reverse();
          best = { points: simplify([...way, q]), gate, metres: cost, cost };
        }
      }
    }
    if (best) break;
  }
  return best && { points: best.points, gate: best.gate, metres: best.metres };
}
