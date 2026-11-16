"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * A 3D walk-through for a D Building room, styled after the real building: stone bands with dark glass window strips,
 * a tall dark tower at the North end, and a planted terrace on the upper floors.
 * Inside, a corridor runs down the middle with rooms on both sides (back and front). The lift is at the back, between
 * the South and North halves. The student walks in, rides up (the floors above fade away), steps out, turns towards
 * the South or North side and walks to the door. Room positions are a sketch counted outward from the lift, not a surveyed plan.
 */
type Props = { side: "N" | "S"; floor: number; room: string; lab?: boolean; desk?: string | null };

const FH = 1.0;               // floor height
const W = 12, D = 5;          // footprint: width along the corridor (x), depth (z)
const FLOORS = 10;            // ground + 1st to 9th
const CORR = 0.55;            // half width of the corridor
const CORE = 1.0;             // half width of the lift lobby in the middle
const LIFT_Z = -D / 2 + 0.55;
const TERRACE = 7;            // floors from here up are set back at the front, with planters on the ledge
const SETBACK = 0.5;

const ord = (n: number) => (n === 0 ? "ground floor" : `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 > 3 ? 0 : n % 10]} floor`);

function label(text: string, color: string, bg: string, w = 256) {
  const c = document.createElement("canvas");
  c.width = w; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 14, w - 8, 68, 16); g.fill();
  g.fillStyle = color; g.font = "600 44px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((w / 96) * 0.5, 0.5, 1);
  return s;
}

export default function BuildingRoute({ side, floor, room, lab = false, desk = null }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState("Getting ready");
  const [lvl, setLvl] = useState("G");
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = document.documentElement.dataset.theme === "dark";
    const height = () => (el.clientWidth < 500 ? 380 : 480);

    const R = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    R.setPixelRatio(Math.min(devicePixelRatio, 1.5)); R.setSize(el.clientWidth, height());
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace;
    R.domElement.setAttribute("aria-hidden", "true");
    el.appendChild(R.domElement);

    const S = new THREE.Scene();
    S.fog = new THREE.Fog(dark ? 0x0b1120 : 0xe9edf3, 30, 70);
    const C = new THREE.PerspectiveCamera(38, el.clientWidth / height(), 0.1, 200);
    S.add(new THREE.HemisphereLight(dark ? 0xa9bce8 : 0xeaf0fa, dark ? 0x1d2436 : 0xa89f8c, dark ? 1.1 : 1.35));
    const sun = new THREE.DirectionalLight(0xfff0d8, dark ? 1.5 : 2.3);
    sun.position.set(-10, 24, 14); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 16, bottom: -8, near: 1, far: 70 }); sun.shadow.bias = -0.0006;
    S.add(sun);

    const trash: { dispose: () => void }[] = [];
    const mat = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(o); trash.push(m); return m; };
    const BOX = new THREE.BoxGeometry(1, 1, 1); trash.push(BOX);
    const put = (parent: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, cast = true) => {
      const me = new THREE.Mesh(BOX, m); me.scale.set(w, h, d); me.position.set(x, y, z); me.castShadow = cast; me.receiveShadow = true; parent.add(me); return me;
    };

    // materials, close to the photo: warm stone bands, dark glass, charcoal tower
    const stone = mat({ color: 0xd9d3c7, roughness: 0.85 });
    const stoneDark = mat({ color: 0x8d8a85, roughness: 0.8 });
    const glassDark = mat({ color: 0x4a5a6e, roughness: 0.1, metalness: 0.35, emissive: 0x16202c, emissiveIntensity: 0.4 });
    const tower = mat({ color: 0x3a3d43, roughness: 0.7 });
    const towerWin = mat({ color: 0x9fb1c4, roughness: 0.2, metalness: 0.4 });
    const slab = mat({ color: 0xcfcac0, roughness: 0.9 });
    const tile = mat({ color: 0xefebe3, roughness: 0.75 });
    const roomFloor = mat({ color: 0xe2ddd2, roughness: 0.85 });
    const wallM = mat({ color: 0xf6f4ef, roughness: 0.85 });
    const doorM = mat({ color: 0x8a5a3a, roughness: 0.6 });
    const hot = mat({ color: 0xd85a30, roughness: 0.5, emissive: 0xd85a30, emissiveIntensity: 0.3 });
    const hotFloor = mat({ color: 0xf1c2ae, roughness: 0.8 });
    const steel = mat({ color: 0xc9cdd3, roughness: 0.3, metalness: 0.85 });
    const desk = mat({ color: 0xb9895c, roughness: 0.7 });
    const navy = mat({ color: 0x1f3a7a, roughness: 0.6 });
    const amber = mat({ color: 0xf2b01e, roughness: 0.5 });
    const skin = mat({ color: 0xc08a62, roughness: 0.7 });
    const hair = mat({ color: 0x1b1d22, roughness: 0.8 });
    const leaf = mat({ color: dark ? 0x2f6a3e : 0x4d8f46, roughness: 1 });
    const trunk = mat({ color: 0x7a5a3c, roughness: 1 });
    const planter = mat({ color: 0x6f6a62, roughness: 0.9 });

    // ---- surroundings
    const site = new THREE.Group(); S.add(site);
    put(site, mat({ color: dark ? 0x2f4a33 : 0x86ad72, roughness: 1 }), 50, 0.1, 40, 0, -0.06, 3, false);
    put(site, mat({ color: dark ? 0x3a3f4b : 0xd2ccc0, roughness: 0.95 }), 16, 0.04, 7, 0, 0, D / 2 + 3.4, false);
    put(site, mat({ color: dark ? 0x22262e : 0x55595f, roughness: 1 }), 50, 0.03, 2.6, 0, 0, D / 2 + 8.2, false);
    const palm = (parent: THREE.Object3D, x: number, y: number, z: number, s = 1, lf: THREE.Material = leaf) => {
      put(parent, trunk, 0.07 * s, 0.7 * s, 0.07 * s, x, y + 0.35 * s, z);
      for (let a = 0; a < 6; a++) { const l = put(parent, lf, 0.5 * s, 0.03, 0.12 * s, x, y + 0.72 * s, z); l.rotation.set(0.35, (a * Math.PI) / 3, 0); l.translateX(0.22 * s); }
    };
    for (const x of [-7, -4.5, 4.5, 7]) palm(site, x, 0, D / 2 + 5.4, 1.4);
    put(site, mat({ color: 0x3b4252, roughness: 0.5, metalness: 0.6 }), 2.8, 0.08, 1.3, 0, 1.0, D / 2 + 0.65);   // canopy
    for (let i = 0; i < 3; i++) put(site, slab, 3 - i * 0.2, 0.05, 0.3, 0, 0.025 + i * 0.05, D / 2 + 1.6 - i * 0.12, false);

    // ---- building shell. Floors above the student's floor go in `upper` and fade away during the lift ride.
    const lower = new THREE.Group(), upper = new THREE.Group(); S.add(lower, upper);
    const fadeMats: THREE.MeshStandardMaterial[] = [];
    const fadeable = (m: THREE.MeshStandardMaterial) => { const c = m.clone(); c.transparent = true; trash.push(c); fadeMats.push(c); return c; };
    const up = { stone: fadeable(stone), stoneDark: fadeable(stoneDark), glass: fadeable(glassDark), slab: fadeable(slab), tower: fadeable(tower), towerWin: fadeable(towerWin), leaf: fadeable(leaf), planter: fadeable(planter) };

    const facade = (g: THREE.Group, f: number, m: { stone: THREE.Material; stoneDark: THREE.Material; glass: THREE.Material }, openFront: boolean) => {
      const y = f * FH, front = D / 2 - (f >= TERRACE ? SETBACK : 0);
      const band = f >= FLOORS - 2 ? m.stoneDark : m.stone;
      const zc = (front - D / 2) / 2, depth = front + D / 2;
      put(g, band, W, 0.42, 0.12, 0, y + 0.27, -D / 2);                         // back
      put(g, m.glass, W - 0.1, 0.46, 0.06, 0, y + 0.71, -D / 2 + 0.02, false);
      put(g, band, 0.12, 0.42, depth, -W / 2, y + 0.27, zc);                    // South end
      put(g, m.glass, 0.06, 0.46, depth - 0.1, -W / 2 + 0.02, y + 0.71, zc, false);
      put(g, band, 0.12, 0.88, depth, W / 2, y + 0.5, zc);                      // North end (behind the tower)
      if (!openFront) {
        put(g, band, W, 0.42, 0.12, 0, y + 0.27, front);
        put(g, m.glass, W - 0.1, 0.46, 0.06, 0, y + 0.71, front - 0.02, false);
        if (f === 0) put(g, m.glass, 2.2, 0.9, 0.08, 0, y + 0.5, front + 0.02, false);   // glass entrance
      }
    };
    for (let f = 0; f < FLOORS; f++) {
      const isUp = f > floor, g = isUp ? upper : lower;
      const front = D / 2 - (f >= TERRACE ? SETBACK : 0);
      put(g, isUp ? up.slab : slab, W + 0.25, 0.1, front + D / 2 + 0.2, 0, f * FH, (front - D / 2) / 2);
      facade(g, f, isUp ? up : { stone, stoneDark, glass: glassDark }, f === floor);
      if (f === TERRACE) for (let x = -W / 2 + 0.8; x < W / 2 - 0.6; x += 1.35) {   // planted ledge, as in the photo
        put(g, isUp ? up.planter : planter, 0.7, 0.22, 0.4, x, f * FH + 0.11, D / 2 - 0.15);
        palm(g, x, f * FH + 0.2, D / 2 - 0.15, 0.8, isUp ? up.leaf : leaf);
      }
    }
    put(upper, up.slab, W + 0.3, 0.16, D - SETBACK + 0.2, 0, FLOORS * FH, -SETBACK / 2);   // roof
    // the tall dark tower at the North end, rising above the roof, with a column of small windows
    const towerH = (FLOORS + 1.4) * FH, splitY = (floor + 1) * FH;
    put(lower, tower, 1.3, splitY, D * 0.8, W / 2 + 0.65, splitY / 2, -D * 0.1);
    put(upper, up.tower, 1.3, towerH - splitY, D * 0.8, W / 2 + 0.65, splitY + (towerH - splitY) / 2, -D * 0.1);
    for (let f = 0; f < FLOORS + 1; f++) put(f > floor ? upper : lower, f > floor ? up.towerWin : towerWin, 0.04, 0.32, 0.22, W / 2 + 1.31, f * FH + 0.55, D / 2 - 1.3, false);

    // ---- the student's floor: corridor down the middle, rooms on both sides, lift lobby in the centre
    const fy = floor * FH;
    const inside = new THREE.Group(); S.add(inside);
    put(inside, tile, W - 0.3, 0.02, CORR * 2, 0, fy + 0.06, 0, false);
    const n = Math.max(1, parseInt(room, 10) || 1);
    const sign = side === "S" ? -1 : 1;
    const k = lab && side === "N" && n >= 7 && n <= 12 ? n - 7 : n - 1;
    const span = W / 2 - CORE - 0.2;
    const perRow = Math.max(5, Math.ceil((k + 1) / 2));
    const cw = span / perRow;                         // room width
    const wallH = 0.62;                               // low "dollhouse" walls so you can see in
    let tx = 0, tz = 0, tRow = -1;
    for (const s of [-1, 1]) for (const row of [-1, 1]) {   // row -1 = back (lift side), +1 = front (window side)
      const zIn = row * CORR, zOut = row * (D / 2 - (row > 0 && floor >= TERRACE ? SETBACK : 0));
      const zc = (zIn + zOut) / 2, depth = Math.abs(zOut - zIn);
      for (let i = 0; i < perRow; i++) {
        const idx = i * 2 + (row < 0 ? 0 : 1);           // numbers count outward from the lift, alternating back and front
        const x = s * (CORE + 0.1 + cw * i + cw / 2);
        const mine = s === sign && idx === k;
        put(inside, mine ? hotFloor : roomFloor, cw - 0.04, 0.02, depth - 0.05, x, fy + 0.06, zc, false);
        put(inside, wallM, 0.05, wallH, depth, x + s * (cw / 2), fy + wallH / 2 + 0.05, zc);       // partition
        const dw = Math.min(0.34, cw * 0.4), seg = (cw - dw) / 2;                                    // corridor wall with a door gap
        put(inside, wallM, seg, wallH, 0.05, x - dw / 2 - seg / 2, fy + wallH / 2 + 0.05, zIn);
        put(inside, wallM, seg, wallH, 0.05, x + dw / 2 + seg / 2, fy + wallH / 2 + 0.05, zIn);
        const dr = put(inside, mine ? hot : doorM, dw, wallH - 0.04, 0.03, x, fy + wallH / 2 + 0.04, zIn);
        if (mine) {
          dr.rotation.y = 0.9 * row * s; tx = x; tz = zIn; tRow = row;
          for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) put(inside, desk, cw * 0.28, 0.12, 0.22, x + (c - 0.5) * cw * 0.4, fy + 0.12, zIn + row * (0.55 + r * 0.45));
        }
      }
      put(inside, wallM, 0.05, wallH, depth, s * (CORE + 0.1), fy + wallH / 2 + 0.05, zc);   // lobby walls
    }
    const plate = label(room, "#ffffff", "#D85A30", 200); plate.position.set(tx, fy + 1.0, tz); inside.add(plate);
    const pinG = new THREE.Group(); inside.add(pinG);
    const pinHeadG = new THREE.SphereGeometry(0.17, 20, 14), pinTipG = new THREE.ConeGeometry(0.12, 0.32, 20); trash.push(pinHeadG, pinTipG);
    const pinHead = new THREE.Mesh(pinHeadG, hot); pinHead.position.y = 0.34;
    const pinTip = new THREE.Mesh(pinTipG, hot); pinTip.rotation.x = Math.PI; pinTip.position.y = 0.12;
    pinG.add(pinHead, pinTip); pinG.position.set(tx, fy + 1.25, tz);
    const ringGeo = new THREE.RingGeometry(0.18, 0.27, 32); trash.push(ringGeo);
    const ringMat = mat({ color: 0xd85a30, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; inside.add(ring);
    const sTag = label("South", "#ffffff", "#1F3A7A"); sTag.position.set(-W / 2 + 0.9, fy + 1.2, 0); inside.add(sTag);
    const nTag = label("North", "#ffffff", "#1F3A7A"); nTag.position.set(W / 2 - 0.9, fy + 1.2, 0); inside.add(nTag);

    // ---- lift at the back centre: glass shaft, steel cabin, sliding doors facing the corridor
    const shaftMat = mat({ color: 0x7fa8d8, transparent: true, opacity: 0.14, depthWrite: false });
    put(S, shaftMat, 0.9, FLOORS * FH, 0.9, 0, (FLOORS * FH) / 2, LIFT_Z, false);
    for (const x of [-0.45, 0.45]) for (const z of [LIFT_Z - 0.45, LIFT_Z + 0.45]) put(S, steel, 0.04, FLOORS * FH, 0.04, x, (FLOORS * FH) / 2, z, false);
    const cab = new THREE.Group(); S.add(cab);
    put(cab, mat({ color: 0xf2b01e, roughness: 0.35, metalness: 0.3, emissive: 0xf2b01e, emissiveIntensity: 0.55, transparent: true, opacity: 0.85 }), 0.84, 0.84, 0.84, 0, 0.44, 0, false);
    const cabLight = new THREE.PointLight(0xffd27a, 3, 4); cabLight.position.set(0, 0.6, 0.6); cab.add(cabLight);
    const liftTag = label("Lift", "#ffffff", "#B7790F", 160); liftTag.position.set(0, 1.25, 0); cab.add(liftTag);
    const doors = [-1, 1].map((s) => put(cab, steel, 0.2, 0.76, 0.02, s * 0.1, 0.42, 0.41, false));
    cab.position.set(0, 0.04, LIFT_Z);

    // ---- the student
    const person = new THREE.Group(); S.add(person);
    const legs = [-0.05, 0.05].map((x) => { const p = new THREE.Group(); p.position.set(x, 0.26, 0); put(p, hair, 0.07, 0.24, 0.08, 0, -0.12, 0); person.add(p); return p; });
    put(person, navy, 0.2, 0.24, 0.12, 0, 0.39, 0);
    put(person, amber, 0.15, 0.18, 0.07, 0, 0.4, -0.09);
    const headGeo = new THREE.SphereGeometry(0.075, 16, 12), hairGeo = new THREE.SphereGeometry(0.079, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2); trash.push(headGeo, hairGeo);
    const head = new THREE.Mesh(headGeo, skin); head.position.y = 0.58; head.castShadow = true; person.add(head);
    const hairM = new THREE.Mesh(hairGeo, hair); hairM.position.y = 0.59; person.add(hairM);
    person.scale.setScalar(1.35);

    // ---- route on the floor
    const corrZ = tRow * 0.18, doorZ = tz - tRow * 0.12;
    const pts = [new THREE.Vector3(0, fy + 0.09, LIFT_Z + 0.5), new THREE.Vector3(0, fy + 0.09, corrZ), new THREE.Vector3(tx, fy + 0.09, corrZ), new THREE.Vector3(tx, fy + 0.09, tz)];
    const rGeo = new THREE.BufferGeometry().setFromPoints(pts); trash.push(rGeo);
    const rMat = new THREE.LineDashedMaterial({ color: 0xf2b01e, dashSize: 0.16, gapSize: 0.09 }); trash.push(rMat);
    const routeLine = new THREE.Line(rGeo, rMat); routeLine.computeLineDistances(); inside.add(routeLine);
    ring.position.set(tx, fy + 0.08, doorZ);

    // ---- timeline
    const turn = floor === 0 ? (side === "S" ? "left" : "right") : (side === "S" ? "right" : "left"), wing = side === "S" ? "South" : "North";
    const rowName = tRow < 0 ? "on the lift side of the corridor" : "on the window side of the corridor";
    type Seg = { d: number; a: number[]; b: number[]; txt: string; walk?: boolean; ride?: boolean; turn?: boolean };
    const deskTxt = desk ? `, desk ${desk}` : "";
    const plan: Seg[] = floor === 0 ? [
      // ground floor: no lift. Tiny placeholder steps keep the step numbers the same as the lift route.
      { d: 2.8, a: [0, 0.08, D / 2 + 3.2], b: [0, 0.08, corrZ], txt: "Walk in through the main door", walk: true },
      { d: 0.01, a: [0, 0.08, corrZ], b: [0, 0.08, corrZ], txt: "You are on the ground floor" },
      { d: 0.01, a: [0, 0.08, corrZ], b: [0, 0.08, corrZ], txt: "You are on the ground floor" },
      { d: 0.3, a: [0, 0.08, corrZ], b: [0, 0.08, corrZ], txt: "You are on the ground floor, no lift needed" },
    ] : [
      { d: 2.8, a: [0, 0.08, D / 2 + 3.2], b: [0, 0.08, LIFT_Z + 0.9], txt: "Walk in through the main door to the lift at the back", walk: true },
      { d: 0.8, a: [0, 0.08, LIFT_Z + 0.9], b: [0, 0.08, LIFT_Z], txt: "Step into the lift", walk: true },
      { d: Math.max(1.2, floor * 0.45), a: [0, 0.08, LIFT_Z], b: [0, fy + 0.08, LIFT_Z], txt: `Ride the lift to the ${ord(floor)}`, ride: true },
      { d: 1.0, a: [0, fy + 0.08, LIFT_Z], b: [0, fy + 0.08, corrZ], txt: "Step out into the corridor", walk: true },
    ];
    plan.push(
      { d: 0.7, a: [0, fy + 0.08, corrZ], b: [0, fy + 0.08, corrZ], txt: `Turn ${turn} for the ${wing} side`, turn: true },
      { d: Math.max(1.2, Math.abs(tx) * 0.45), a: [0, fy + 0.08, corrZ], b: [tx, fy + 0.08, corrZ], txt: `Walk along the ${wing} side`, walk: true },
      { d: 0.6, a: [tx, fy + 0.08, corrZ], b: [tx, fy + 0.08, doorZ], txt: `Room ${room}${deskTxt} is here, ${rowName}`, walk: true },
    );
    const final = `D Building, ${wing} side, ${ord(floor)}, room ${room}${deskTxt}`;
    const total = plan.reduce((a, p) => a + p.d, 0);

    // ---- camera: drag to orbit; it rises with the student
    let ang = 0.42, tilt = 0.5, drag: { x: number; y: number } | null = null, camY = 4.5, camR = 30, camLift = 15;
    const dom = R.domElement; dom.style.touchAction = "pan-y"; dom.style.cursor = "grab";
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); dom.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => { if (!drag) return; ang -= (e.clientX - drag.x) * 0.008; tilt = Math.min(1.15, Math.max(0.2, tilt + (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; };
    const upFn = () => { drag = null; dom.style.cursor = "grab"; };
    dom.addEventListener("pointerdown", down); dom.addEventListener("pointermove", move); dom.addEventListener("pointerup", upFn); dom.addEventListener("pointercancel", upFn);

    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    // x-ray: while the lift rides, the walls and floors below turn see-through so the lift at the back is visible
    const xray = [stone, stoneDark, glassDark, slab, tower, towerWin, planter];
    xray.forEach((m) => { m.transparent = true; m.needsUpdate = true; });
    const setXray = (o: number) => { for (const m of xray) { m.opacity = o; m.depthWrite = o > 0.9; } };
    const setFade = (o: number) => { for (const m of fadeMats) { m.opacity = o; m.depthWrite = o > 0.6; } upper.visible = o > 0.02; };
    const t0 = performance.now();
    let raf = 0, lastStep = "", lastLvl = "", lastDraw = 0, lastTouch = 0, onScreen = true;
    // Save the device: draw only while the canvas is on screen and the tab is open; once the walk is over, slow to a few frames a second.
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }); io.observe(el);
    const touch = () => { lastTouch = performance.now(); };
    dom.addEventListener("pointermove", touch); dom.addEventListener("pointerdown", touch);

    const frameFn = (now: number) => {
      raf = requestAnimationFrame(frameFn);
      if (!onScreen || document.hidden) return;
      const finished = reduce || (now - t0) / 1000 > total + 2.5;
      if (finished && now - lastTouch > 1500 && now - lastDraw < 250) return;   // idle: about 4 frames a second
      lastDraw = now;
      let t = reduce ? total + 1 : (now - t0) / 1000, i = 0;
      while (i < plan.length - 1 && t > plan[i].d) { t -= plan[i].d; i++; }
      const p = plan[i], k = ease(Math.min(1, t / p.d));
      const x = lerp(p.a[0], p.b[0], k), y = lerp(p.a[1], p.b[1], k), z = lerp(p.a[2], p.b[2], k);
      person.position.set(x, y, z);
      const dx = p.b[0] - p.a[0], dz = p.b[2] - p.a[2];
      if (p.turn) person.rotation.y = floor === 0 ? lerp(Math.PI, side === "S" ? Math.PI * 1.5 : Math.PI / 2, k) : lerp(0, side === "S" ? -Math.PI / 2 : Math.PI / 2, k);
      else if (p.ride) person.rotation.y = lerp(Math.PI, 0, Math.min(1, k * 2));
      else if (Math.abs(dx) + Math.abs(dz) > 0.01) person.rotation.y = Math.atan2(dx, dz);
      const walking = p.walk && k < 1, sw = walking ? Math.sin(now / 90) * 0.6 : 0;
      legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
      person.position.y += walking ? Math.abs(Math.sin(now / 90)) * 0.02 : 0;
      // lift and its doors
      cab.position.y = i < 2 ? 0.04 : i === 2 ? y - 0.04 : fy + 0.04;
      const open = i === 0 ? Math.max(0, (k - 0.6) / 0.4) : i === 1 ? 1 - Math.max(0, (k - 0.7) / 0.3) : i === 2 && k > 0.85 ? (k - 0.85) / 0.15 : i === 3 ? (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) : 0;
      doors[0].position.x = -0.1 - open * 0.18; doors[1].position.x = 0.1 + open * 0.18;
      // open up the building: the floors above fade during the ride and the student's floor appears
      setFade(i < 2 ? 1 : i === 2 ? Math.max(0, 1 - k * 1.4) : 0);
      inside.visible = i >= 2;
      setXray(i === 0 ? 1 - Math.max(0, (k - 0.7) / 0.3) * 0.78 : i <= 2 ? 0.22 : i === 3 ? 0.22 + k * 0.78 : 1);
      liftTag.visible = i >= 1 && i <= 2;
      // destination cues
      pinG.position.y = fy + 1.25 + Math.sin(now / 300) * 0.06; pinG.rotation.y = now / 900;
      const pulse = (now / 1200) % 1; ring.scale.setScalar(1 + pulse * 1.6); ringMat.opacity = 0.8 * (1 - pulse);
      const done = i === plan.length - 1 && t >= p.d;
      const st = done ? final : p.txt;
      if (st !== lastStep) { lastStep = st; setStep(st); }
      const lv = Math.round(Math.max(0, cab.position.y - 0.04) / FH), lvs = lv === 0 ? "G" : String(lv);
      if (lvs !== lastLvl) { lastLvl = lvs; setLvl(lvs); }
      // camera: a wide view of the whole building first, then it follows the student and looks down into the floor
      const narrow = el.clientWidth < 500;
      const want = i < 2 ? 4.5 : Math.max(y, 0.5);
      camY = lerp(camY, want, 0.04);
      const inFloor = i >= 3;
      camR = lerp(camR, !inFloor ? (narrow ? 34 : 28) : (narrow ? 15 : 12), 0.045);
      const lift = !inFloor ? 1.5 + tilt * camR * 0.45 : camR * (0.55 + tilt * 0.6);
      camLift = lerp(camLift, lift, 0.045);
      C.position.set(Math.sin(ang) * camR, camY + camLift, Math.cos(ang) * camR);
      C.lookAt(i >= 4 ? x * 0.5 : 0.4, camY - (i < 2 ? 0.5 : 0) + 0.2, 0);
      R.render(S, C);
    };
    raf = requestAnimationFrame(frameFn);

    const onResize = () => { R.setSize(el.clientWidth, height()); C.aspect = el.clientWidth / height(); C.updateProjectionMatrix(); };
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", onResize); io.disconnect();
      dom.removeEventListener("pointermove", touch); dom.removeEventListener("pointerdown", touch);
      dom.removeEventListener("pointerdown", down); dom.removeEventListener("pointermove", move); dom.removeEventListener("pointerup", upFn); dom.removeEventListener("pointercancel", upFn);
      S.traverse((o) => { if (o instanceof THREE.Sprite) { o.material.map?.dispose(); o.material.dispose(); } });
      trash.forEach((d) => d.dispose());
      R.dispose(); dom.remove();
    };
  }, [side, floor, room, lab, desk, run]);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border-2 border-edge bg-sheet">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="font-display text-lg font-semibold" aria-live="polite">{step}</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line px-3 py-1 font-display text-sm">Floor <b>{lvl}</b></span>
          <button type="button" className="btn btn-quiet !min-h-[36px] !py-1 text-sm" onClick={() => setRun((r) => r + 1)}>Play again</button>
        </div>
      </div>
      <div ref={host} className="relative w-full bg-[linear-gradient(rgb(var(--c-paper)),rgb(var(--c-track)))]" />
      <p className="px-4 py-2.5 text-sm text-mute">
        Drag to look around. The lift is at the back of the building. Step out into the corridor: the South side is on your right and
        the North side on your left, with rooms on both sides. Room positions are a sketch, not the exact plan.
      </p>
    </div>
  );
}
