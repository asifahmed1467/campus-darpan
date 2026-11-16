"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * A 3D walk-through for a D Building room: walk in, take the lift (front centre of the building),
 * step out at the right floor, turn left for the South side or right for the North side, and walk to the door.
 * Room positions along the corridor are an illustration (numbers count outward from the lift), not a surveyed floor plan.
 */
type Props = { side: "N" | "S"; floor: number; room: string; lab?: boolean };

const FH = 1.0;              // floor height
const W = 10.4, D = 3.2;      // building width (x) and depth (z)
const LIFT_Z = 1.15;          // lift shaft sits at the front centre
const CORR_Z = -0.25;         // corridor line in front of the rooms
const ROOM_Z = -1.12;         // room fronts along the back
const FLOORS = 10;            // ground + 1st to 9th

const ord = (n: number) => (n === 0 ? "ground floor" : `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 > 3 ? 0 : n % 10]} floor`);

function label(text: string, opts: { color?: string; bg?: string; w?: number } = {}) {
  const c = document.createElement("canvas");
  const w = opts.w ?? 256; c.width = w; c.height = 96;
  const g = c.getContext("2d")!;
  if (opts.bg) { g.fillStyle = opts.bg; g.beginPath(); g.roundRect(4, 14, w - 8, 68, 14); g.fill(); }
  g.fillStyle = opts.color ?? "#0F1B3D"; g.font = "600 44px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((w / 96) * 0.42, 0.42, 1);
  return s;
}

export default function BuildingRoute({ side, floor, room, lab = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState("Getting ready");
  const [lvl, setLvl] = useState("G");
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = document.documentElement.dataset.theme === "dark";
    const H = el.clientWidth < 500 ? 360 : 460;

    const R = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.setSize(el.clientWidth, H);
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(R.domElement);
    R.domElement.setAttribute("aria-hidden", "true");

    const S = new THREE.Scene();
    S.fog = new THREE.Fog(dark ? 0x0b1120 : 0xeef2f8, 26, 60);
    const C = new THREE.PerspectiveCamera(40, el.clientWidth / H, 0.1, 200);
    S.add(new THREE.HemisphereLight(dark ? 0x9fb4e8 : 0xdfe9ff, dark ? 0x1a2238 : 0xb7ab93, dark ? 1.0 : 1.25));
    const sun = new THREE.DirectionalLight(0xfff1dc, dark ? 1.4 : 2.2);
    sun.position.set(-8, 22, 12); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 14, bottom: -6, near: 1, far: 60 }); sun.shadow.bias = -0.0006;
    S.add(sun);

    const disposables: { dispose: () => void }[] = [];
    const mat = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(o); disposables.push(m); return m; };
    const geo = <T extends THREE.BufferGeometry>(g: T) => { disposables.push(g); return g; };
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const me = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), m);
      me.position.set(x, y, z); me.castShadow = shadow; me.receiveShadow = true; S.add(me); return me;
    };

    const concrete = mat({ color: 0xd9d6cf, roughness: 0.9 });
    const concreteDark = mat({ color: 0xb9b4aa, roughness: 0.9 });
    const glass = mat({ color: 0x8fb6d9, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });
    const ghost = mat({ color: 0x9db8d6, roughness: 0.2, transparent: true, opacity: 0.08, depthWrite: false });
    const frame = mat({ color: 0x3b4252, roughness: 0.5, metalness: 0.6 });
    const steel = mat({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.85 });
    const tile = mat({ color: 0xece8df, roughness: 0.7 });
    const wall = mat({ color: 0xf3f1ec, roughness: 0.85 });
    const door = mat({ color: 0x7a5236, roughness: 0.6 });
    const target = mat({ color: 0xd85a30, roughness: 0.5, emissive: 0xd85a30, emissiveIntensity: 0.25 });
    const amber = mat({ color: 0xf2b01e, roughness: 0.5 });
    const navy = mat({ color: 0x1f3a7a, roughness: 0.6 });
    const skin = mat({ color: 0xc08a62, roughness: 0.7 });
    const grass = mat({ color: dark ? 0x2f4a33 : 0x7fae6a, roughness: 1 });
    const paver = mat({ color: dark ? 0x3a3f4b : 0xcfc9bd, roughness: 0.95 });
    const road = mat({ color: dark ? 0x22262e : 0x55595f, roughness: 1 });
    const leaf = mat({ color: dark ? 0x2e5a3a : 0x4f8a4a, roughness: 1 });
    const trunk = mat({ color: 0x6b4a33, roughness: 1 });

    // ---- site: grass, plaza, road, trees, entrance canopy
    box(40, 0.1, 30, grass, 0, -0.06, 2, false).castShadow = false;
    box(14, 0.04, 6.5, paver, 0, 0.0, 4.6, false);
    box(40, 0.03, 2.4, road, 0, 0.0, 9.2, false);
    for (const x of [-6.5, -4, 4, 6.5]) {
      box(0.12, 0.7, 0.12, trunk, x, 0.35, 6.9);
      const t = new THREE.Mesh(geo(new THREE.SphereGeometry(0.55, 14, 10)), leaf); t.position.set(x, 1.05, 6.9); t.castShadow = true; S.add(t);
    }
    box(2.4, 0.08, 1.2, frame, 0, 1.0, D / 2 + 0.6);                 // canopy over the door
    for (const x of [-1.1, 1.1]) box(0.06, 1.0, 0.06, frame, x, 0.5, D / 2 + 1.15);
    for (let i = 0; i < 3; i++) box(2.6 - i * 0.2, 0.05, 0.3, concreteDark, 0, 0.025 + i * 0.05, D / 2 + 1.5 - i * 0.12, false);

    // ---- building
    const tgtY = floor * FH;
    const nCols = 6, colXs = Array.from({ length: nCols }, (_, i) => -W / 2 + (i * W) / (nCols - 1));
    for (let f = 0; f <= FLOORS; f++) {
      const y = f * FH;
      const above = f > floor;
      box(W + 0.2, 0.12, D + 0.2, f === floor ? concrete : above ? ghost : concreteDark, 0, y, 0, !above);
      if (f === FLOORS) break;
      const cy = y + FH / 2 + 0.06;
      if (!above) {
        for (const x of colXs) for (const z of [-D / 2, D / 2]) box(0.16, FH - 0.12, 0.16, concrete, x, cy, z);
        // glass curtain wall with mullions (front glass is cut away on the student's floor so you can see in)
        const sidesGlass: [number, number, number, number, number][] = [[W, FH - 0.12, 0.02, 0, -D / 2], [0.02, FH - 0.12, D, -W / 2, 0], [0.02, FH - 0.12, D, W / 2, 0]];
        if (f !== floor) sidesGlass.push([W, FH - 0.12, 0.02, 0, D / 2]);
        for (const [w, h, d, x, z] of sidesGlass) { const g = box(w, h, d, glass, x, cy, z, false); g.castShadow = false; }
        for (let k = 0; k <= 14; k++) { const x = -W / 2 + (k * W) / 14; if (f !== floor) box(0.03, FH - 0.12, 0.05, frame, x, cy, D / 2, false); box(0.03, FH - 0.12, 0.05, frame, x, cy, -D / 2, false); }
        box(W, 0.04, 0.06, frame, 0, y + FH * 0.92, D / 2, false);
      } else {
        const g = box(W, FH - 0.12, D, ghost, 0, cy, 0, false); g.castShadow = false;
      }
    }

    // ---- the student's floor: tiled corridor, rooms with doors along the back
    box(W - 0.2, 0.02, D - 0.2, tile, 0, tgtY + 0.07, 0, false);
    const n = Math.max(1, parseInt(room, 10) || 1);
    const sign = side === "S" ? -1 : 1;
    const k = lab && side === "N" && n >= 7 && n <= 12 ? n - 7 : n - 1;
    const slots = Math.max(12, k + 1);
    const span = W / 2 - 0.9;
    const step = Math.min(0.42, span / slots);
    let targetX = 0;
    for (const s of [-1, 1]) for (let i = 0; i < slots; i++) {
      const x = s * (0.75 + i * step + step / 2);
      if (Math.abs(x) > W / 2 - 0.15) continue;
      const mine = s === sign && i === k;
      box(step - 0.03, FH - 0.14, 0.9, wall, x, tgtY + FH / 2 + 0.06, ROOM_Z - 0.18);
      box(Math.min(0.24, step * 0.6), 0.6, 0.03, mine ? target : door, x, tgtY + 0.38, ROOM_Z + 0.28, false);
      if (mine) targetX = x;
    }
    const plate = label(room, { color: "#ffffff", bg: "#D85A30", w: 200 }); plate.position.set(targetX, tgtY + 0.95, ROOM_Z + 0.32); S.add(plate);
    const pin = new THREE.Group();
    const pinHead = new THREE.Mesh(geo(new THREE.SphereGeometry(0.16, 20, 14)), target); pinHead.position.y = 0.32;
    const pinTip = new THREE.Mesh(geo(new THREE.ConeGeometry(0.11, 0.3, 20)), target); pinTip.rotation.x = Math.PI; pinTip.position.y = 0.12;
    pin.add(pinHead, pinTip); pin.position.set(targetX, tgtY + 1.2, ROOM_Z + 0.4); S.add(pin);
    const ring = new THREE.Mesh(geo(new THREE.RingGeometry(0.18, 0.26, 32)), mat({ color: 0xd85a30, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(targetX, tgtY + 0.09, ROOM_Z + 0.55); S.add(ring);
    const sTag = label("South", { color: "#ffffff", bg: "#1F3A7A" }); sTag.position.set(-W / 2 + 1.1, tgtY + 1.25, 0.6); S.add(sTag);
    const nTag = label("North", { color: "#ffffff", bg: "#1F3A7A" }); nTag.position.set(W / 2 - 1.1, tgtY + 1.25, 0.6); S.add(nTag);

    // ---- lift: glass shaft with a steel cabin and sliding doors on the front and the back
    const shaft = new THREE.Mesh(geo(new THREE.BoxGeometry(0.86, FLOORS * FH, 0.86)), mat({ color: 0x7fa8d8, transparent: true, opacity: 0.16, depthWrite: false }));
    shaft.position.set(0, (FLOORS * FH) / 2, LIFT_Z); S.add(shaft);
    for (const x of [-0.43, 0.43]) for (const z of [LIFT_Z - 0.43, LIFT_Z + 0.43]) box(0.04, FLOORS * FH, 0.04, steel, x, (FLOORS * FH) / 2, z, false);
    const cab = new THREE.Group(); S.add(cab);
    const cabBody = new THREE.Mesh(geo(new THREE.BoxGeometry(0.76, 0.78, 0.76)), mat({ color: 0xaeb6c2, roughness: 0.35, metalness: 0.7, transparent: true, opacity: 0.55 }));
    cabBody.position.y = 0.4; cab.add(cabBody);
    const dGeo = geo(new THREE.BoxGeometry(0.19, 0.74, 0.02));
    const doors = ["fl", "fr", "bl", "br"].map((id) => { const m = new THREE.Mesh(dGeo, steel); m.position.set(id[1] === "l" ? -0.095 : 0.095, 0.4, id[0] === "f" ? 0.39 : -0.39); cab.add(m); return m; });
    cab.position.set(0, 0.06, LIFT_Z);

    // ---- the student: legs that swing, a navy shirt, a backpack
    const person = new THREE.Group(); S.add(person);
    const legG = geo(new THREE.BoxGeometry(0.07, 0.24, 0.08));
    const legs = [-0.05, 0.05].map((x) => { const p = new THREE.Group(); p.position.set(x, 0.26, 0); const l = new THREE.Mesh(legG, frame); l.position.y = -0.12; l.castShadow = true; p.add(l); person.add(p); return p; });
    const torso = new THREE.Mesh(geo(new THREE.BoxGeometry(0.2, 0.24, 0.12)), navy); torso.position.y = 0.39; torso.castShadow = true; person.add(torso);
    const bag = new THREE.Mesh(geo(new THREE.BoxGeometry(0.15, 0.18, 0.07)), amber); bag.position.set(0, 0.4, -0.09); person.add(bag);
    const headM = new THREE.Mesh(geo(new THREE.SphereGeometry(0.075, 16, 12)), skin); headM.position.y = 0.58; headM.castShadow = true; person.add(headM);
    const hair = new THREE.Mesh(geo(new THREE.SphereGeometry(0.078, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)), frame); hair.position.y = 0.59; person.add(hair);
    person.scale.setScalar(1.25);

    // ---- route line on the floor
    const pts = [new THREE.Vector3(0, tgtY + 0.1, LIFT_Z - 0.45), new THREE.Vector3(0, tgtY + 0.1, CORR_Z), new THREE.Vector3(targetX, tgtY + 0.1, CORR_Z), new THREE.Vector3(targetX, tgtY + 0.1, ROOM_Z + 0.5)];
    const route = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(pts)), new THREE.LineDashedMaterial({ color: 0xf2b01e, dashSize: 0.14, gapSize: 0.08 }));
    route.computeLineDistances(); S.add(route);

    // ---- timeline
    const turn = side === "S" ? "left" : "right", wingName = side === "S" ? "South" : "North";
    const plan = [
      { d: 2.2, a: [0, 0.08, D / 2 + 2.6], b: [0, 0.08, LIFT_Z + 0.75], txt: "Walk in through the main door", walk: true },
      { d: 0.8, a: [0, 0.08, LIFT_Z + 0.75], b: [0, 0.08, LIFT_Z], txt: "Step into the lift", walk: true, open: "f" },
      { d: Math.max(1, floor * 0.45), a: [0, 0.08, LIFT_Z], b: [0, tgtY + 0.08, LIFT_Z], txt: `Ride the lift to the ${ord(floor)}`, lift: true },
      { d: 0.9, a: [0, tgtY + 0.08, LIFT_Z], b: [0, tgtY + 0.08, CORR_Z], txt: "Step out of the lift", walk: true, open: "b" },
      { d: 0.7, a: [0, tgtY + 0.08, CORR_Z], b: [0, tgtY + 0.08, CORR_Z], txt: `Turn ${turn} for the ${wingName} side`, turn: true },
      { d: Math.max(1, Math.abs(targetX) * 0.5), a: [0, tgtY + 0.08, CORR_Z], b: [targetX, tgtY + 0.08, CORR_Z], txt: `Walk along the ${wingName} side`, walk: true },
      { d: 0.7, a: [targetX, tgtY + 0.08, CORR_Z], b: [targetX, tgtY + 0.08, ROOM_Z + 0.48], txt: `Room ${room} is right here`, walk: true },
    ];
    const final = `D Building, ${wingName} side, ${ord(floor)}, room ${room}`;

    // ---- camera control: drag to orbit, follows the student up the building
    let ang = 0.35, tilt = 0.42, drag: { x: number; y: number } | null = null, camY = 0.5;
    const dom = R.domElement; dom.style.touchAction = "pan-y"; dom.style.cursor = "grab";
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); dom.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => { if (!drag) return; ang -= (e.clientX - drag.x) * 0.008; tilt = Math.min(1.1, Math.max(0.15, tilt + (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; };
    const up = () => { drag = null; dom.style.cursor = "grab"; };
    dom.addEventListener("pointerdown", down); dom.addEventListener("pointermove", move); dom.addEventListener("pointerup", up); dom.addEventListener("pointercancel", up);

    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const t0 = performance.now();
    let raf = 0, lastStep = "", lastLvl = "";
    const total = plan.reduce((s, p) => s + p.d, 0);

    const frameFn = (now: number) => {
      raf = requestAnimationFrame(frameFn);
      let t = reduce ? total + 1 : (now - t0) / 1000, i = 0;
      while (i < plan.length - 1 && t > plan[i].d) { t -= plan[i].d; i++; }
      const p = plan[i], k = ease(Math.min(1, t / p.d));
      const x = lerp(p.a[0], p.b[0], k), y = lerp(p.a[1], p.b[1], k), z = lerp(p.a[2], p.b[2], k);
      person.position.set(x, y, z);
      // facing
      const dx = p.b[0] - p.a[0], dz = p.b[2] - p.a[2];
      if (p.turn) person.rotation.y = lerp(Math.PI, side === "S" ? -Math.PI / 2 : Math.PI / 2, k);
      else if (Math.abs(dx) + Math.abs(dz) > 0.01) person.rotation.y = Math.atan2(dx, dz);
      // walking legs and a little bob
      const walking = p.walk && k < 1;
      const sw = walking ? Math.sin(now / 90) * 0.6 : 0;
      legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
      person.position.y += walking ? Math.abs(Math.sin(now / 90)) * 0.02 : 0;
      // lift cabin follows during the ride, doors slide open on the side being used
      const liftY = i < 2 ? 0.06 : i === 2 ? y - 0.02 : tgtY + 0.06;
      cab.position.y = liftY;
      const openF = i === 0 ? ease(Math.min(1, t / p.d)) : i === 1 ? 1 - Math.max(0, (k - 0.7) / 0.3) : 0;
      const openB = i === 3 ? (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) : i === 2 && k > 0.85 ? (k - 0.85) / 0.15 : 0;
      doors[0].position.x = -0.095 - openF * 0.17; doors[1].position.x = 0.095 + openF * 0.17;
      doors[2].position.x = -0.095 - openB * 0.17; doors[3].position.x = 0.095 + openB * 0.17;
      // the pin bobs and the ring pulses
      pin.position.y = tgtY + 1.2 + Math.sin(now / 300) * 0.06; pin.rotation.y = now / 900;
      const pulse = (now / 1200) % 1; ring.scale.setScalar(1 + pulse * 1.6); (ring.material as THREE.MeshStandardMaterial).opacity = 0.8 * (1 - pulse);
      // text
      const done = i === plan.length - 1 && t >= p.d;
      const st = done ? final : p.txt;
      if (st !== lastStep) { lastStep = st; setStep(st); }
      const lv = Math.round(Math.max(0, cab.position.y - 0.06) / FH); const lvs = lv === 0 ? "G" : String(lv);
      if (lvs !== lastLvl) { lastLvl = lvs; setLvl(lvs); }
      // camera
      camY = lerp(camY, Math.max(y, 0.4), 0.05);
      const r = 12.5;
      C.position.set(Math.sin(ang) * r * Math.cos(tilt * 0.6), camY + 2.5 + tilt * 8, Math.cos(ang) * r);
      C.lookAt(x * 0.35, camY + 0.3, 0);
      R.render(S, C);
    };
    raf = requestAnimationFrame(frameFn);

    const onResize = () => { const h = el.clientWidth < 500 ? 360 : 460; R.setSize(el.clientWidth, h); C.aspect = el.clientWidth / h; C.updateProjectionMatrix(); };
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", onResize);
      dom.removeEventListener("pointerdown", down); dom.removeEventListener("pointermove", move); dom.removeEventListener("pointerup", up); dom.removeEventListener("pointercancel", up);
      S.traverse((o) => { if (o instanceof THREE.Sprite) { o.material.map?.dispose(); o.material.dispose(); } });
      disposables.forEach((d) => d.dispose());
      R.dispose(); dom.remove();
    };
  }, [side, floor, room, lab, run]);

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
        Drag to look around. When you step out of the lift, the South side is on your left and the North side on your right.
        Room positions on the corridor are a sketch, not the exact plan.
      </p>
    </div>
  );
}
