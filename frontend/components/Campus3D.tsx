"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BUILDING_COLORS, FIELD, LAWN, PARKING, PLAN, TREES, type Box, type CampusBuilding } from "./CampusMap";

/**
 * The campus in 3D, built from the same schematic plan as the flat map (not a surveyed model).
 * Tap a building: the camera flies to it, the others fade, and a student walks there from the main gate.
 * Choosing a floor lights that floor up.
 */
const SX = 30, SZ = 19;                       // plan units -> metres-ish
const X = (s: number) => (s - 0.55) * SX;
const Z = (t: number) => (t + 0.45) * SZ;
const FH = 0.95;                              // floor height
const UNKNOWN_LEVELS = 3, C_LEVELS = 4;
const GATE = { s: 1.3, t: 1.32 };             // main gate on the road side (schematic)
const SPINE_S = 1.3, BACK_T = -0.05, REAR_T = -0.95;   // walkways between the buildings

const levelsOf = (b: CampusBuilding) => (b.id === "C" ? C_LEVELS : b.levels ?? UNKNOWN_LEVELS);
const nameOf = (b: CampusBuilding) => (b.id === "D" ? "D Building" : b.id === "C" ? "C Building" : b.id === "A7" ? "Annex 7" : b.name);

/** Walking route from the main gate to a building's nearest face, along the campus walkways. Plan units. */
export function routeTo(id: string): [number, number][] {
  const b = PLAN[id];
  if (!b) return [];
  const cs = (b.s0 + b.s1) / 2, ct = (b.t0 + b.t1) / 2;
  const pts: [number, number][] = [[GATE.s, GATE.t]];
  if (b.s0 >= SPINE_S) {                                  // D and Annex 9, right of the walkway
    pts.push([SPINE_S, ct], [b.s0 - 0.05, ct]);
  } else if (b.t1 > -0.5) {                               // the row along the field's back edge
    pts.push([SPINE_S, BACK_T], [cs, BACK_T], [cs, b.t1 + 0.04]);
  } else {                                                // the buildings further back
    pts.push([SPINE_S, BACK_T], [SPINE_S, REAR_T]);
    if (b.t0 < REAR_T && REAR_T < b.t1) pts.push([b.s1 + 0.05, REAR_T]);       // walkway runs into it: stop at its side
    else pts.push([cs, REAR_T], [cs, b.t1 + 0.04]);
  }
  return pts;
}

function facadeTexture(base: string, win: string, floors: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 32 * floors;
  const g = c.getContext("2d")!;
  g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
  for (let f = 0; f < floors; f++) {
    const y = f * 32;
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, y + 29, c.width, 3);           // floor line
    for (let k = 0; k < 6; k++) {
      g.fillStyle = win; g.globalAlpha = 0.85; g.fillRect(6 + k * 20, y + 8, 13, 15);
      g.fillStyle = "#1d2a3a"; g.globalAlpha = 0.35; g.fillRect(6 + k * 20, y + 8, 13, 5);
      g.globalAlpha = 1;
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

function label(text: string, big: boolean) {
  const c = document.createElement("canvas");
  const w = big ? 512 : 256; c.width = w; c.height = big ? 120 : 72;
  const g = c.getContext("2d")!;
  g.fillStyle = big ? "#D85A30" : "rgba(15,27,61,0.86)";
  g.beginPath(); g.roundRect(4, 6, w - 8, c.height - 12, 18); g.fill();
  g.fillStyle = "#fff"; g.font = `700 ${big ? 54 : 36}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, c.height / 2 + 2, w - 24);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.renderOrder = 10;
  const h = big ? 2.2 : 1.1; s.scale.set((w / c.height) * h, h, 1);
  return s;
}

export default function Campus3D({ buildings, selected, floor, onSelect }: {
  buildings: CampusBuilding[]; selected: string | null; floor: number | null; onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ select: (id: string | null, floor: number | null) => void } | null>(null);
  const pickRef = useRef(onSelect); pickRef.current = onSelect;
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("Tap a building to see where it is and how to walk there.");

  useEffect(() => {
    const el = host.current;
    if (!el || !buildings.length) return;
    let R: THREE.WebGLRenderer;
    try { R = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return; }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = document.documentElement.dataset.theme === "dark";
    const H = () => (el.clientWidth < 600 ? 400 : 520);
    R.setPixelRatio(Math.min(devicePixelRatio, 1.5)); R.setSize(el.clientWidth, H());
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(R.domElement);
    const dom = R.domElement; dom.style.touchAction = "pan-y"; dom.style.cursor = "grab";

    const S = new THREE.Scene();
    S.fog = new THREE.Fog(dark ? 0x0b1120 : 0xe8eef5, 70, 150);
    const C = new THREE.PerspectiveCamera(40, el.clientWidth / H(), 0.5, 400);
    S.add(new THREE.HemisphereLight(dark ? 0xa9bce8 : 0xeef3fb, dark ? 0x1d2436 : 0x9d9a8a, dark ? 1.1 : 1.3));
    const sun = new THREE.DirectionalLight(0xfff0d8, dark ? 1.5 : 2.4);
    sun.position.set(-30, 60, 40); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 160 }); sun.shadow.bias = -0.0005;
    S.add(sun);

    const trash: { dispose: () => void }[] = [];
    const mat = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(o); trash.push(m); return m; };
    const BOX = new THREE.BoxGeometry(1, 1, 1); trash.push(BOX);
    const put = (m: THREE.Material | THREE.Material[], w: number, h: number, d: number, x: number, y: number, z: number, cast = true) => {
      const me = new THREE.Mesh(BOX, m); me.scale.set(w, h, d); me.position.set(x, y, z); me.castShadow = cast; me.receiveShadow = true; S.add(me); return me;
    };
    const flatBox = (b: Box, y: number, m: THREE.Material, h = 0.06) =>
      put(m, (b.s1 - b.s0) * SX, h, (b.t1 - b.t0) * SZ, X((b.s0 + b.s1) / 2), y, Z((b.t0 + b.t1) / 2), false);

    // ground, road, field, lawn and pond, parking, walkways, trees
    put(mat({ color: dark ? 0x2b4231 : 0x8fb57a, roughness: 1 }), 140, 0.2, 110, 0, -0.1, 0, false);
    put(mat({ color: dark ? 0x23272f : 0x5a5f66, roughness: 1 }), 140, 0.05, 5, 0, 0.01, Z(GATE.t) + 3.2, false);
    const field = flatBox(FIELD, 0.05, mat({ color: 0x3f9b4b, roughness: 0.95 }));
    const lineM = mat({ color: 0xffffff, roughness: 0.8 });
    put(lineM, 0.15, 0.02, (FIELD.t1 - FIELD.t0) * SZ, X(0.5), 0.1, Z(0.5), false);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 6, 48), lineM); ring.rotation.x = Math.PI / 2; ring.position.set(X(0.5), 0.1, Z(0.5)); S.add(ring); trash.push(ring.geometry);
    void field;
    flatBox(LAWN, 0.04, mat({ color: 0x74b86a, roughness: 1 }));
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.05, 32), mat({ color: 0x5aa6d6, roughness: 0.15, metalness: 0.2 }));
    pond.scale.set(1.6, 1, 0.9); pond.position.set(X((LAWN.s0 + LAWN.s1) / 2), 0.08, Z((LAWN.t0 + LAWN.t1) / 2)); S.add(pond); trash.push(pond.geometry);
    flatBox(PARKING, 0.04, mat({ color: 0x9ba1aa, roughness: 0.95 }));
    const walkM = mat({ color: dark ? 0x4a4f5a : 0xd9d2c3, roughness: 0.95 });
    const walk = (s0: number, t0: number, s1: number, t1: number) =>
      put(walkM, Math.abs(X(s1) - X(s0)) + 1.6, 0.05, Math.abs(Z(t1) - Z(t0)) + 1.6, (X(s0) + X(s1)) / 2, 0.06, (Z(t0) + Z(t1)) / 2, false);
    walk(SPINE_S, GATE.t, SPINE_S, -2.0); walk(-1.2, BACK_T, SPINE_S, BACK_T); walk(-1.2, REAR_T, SPINE_S, REAR_T);
    put(mat({ color: 0x3b4252, roughness: 0.5, metalness: 0.5 }), 5, 0.3, 0.3, X(GATE.s), 2.4, Z(GATE.t) + 0.6);     // gate arch
    for (const dx of [-2.4, 2.4]) put(mat({ color: 0x3b4252, roughness: 0.5 }), 0.3, 2.4, 0.3, X(GATE.s) + dx, 1.2, Z(GATE.t) + 0.6);
    const gateTag = label("Main gate", false); gateTag.position.set(X(GATE.s), 3.6, Z(GATE.t) + 0.6); S.add(gateTag);
    const trunkM = mat({ color: 0x7a5a3c, roughness: 1 }), leafM = mat({ color: dark ? 0x2f6a3e : 0x3f8f46, roughness: 1 });
    const leafG = new THREE.SphereGeometry(0.9, 10, 8); trash.push(leafG);
    const inBuilding = (s: number, t: number) => Object.values(PLAN).some((b) => s > b.s0 - 0.08 && s < b.s1 + 0.08 && t > b.t0 - 0.15 && t < b.t1 + 0.15);
    for (const [s, t] of TREES) {
      if (inBuilding(s, t)) continue;
      put(trunkM, 0.2, 1.2, 0.2, X(s), 0.6, Z(t));
      const lf = new THREE.Mesh(leafG, leafM); lf.position.set(X(s), 1.7, Z(t)); lf.castShadow = true; S.add(lf);
    }

    // buildings
    type Bld = { id: string; group: THREE.Group; mats: THREE.MeshStandardMaterial[]; box: Box; h: number; tag: THREE.Sprite; levels: number };
    const blds: Bld[] = [];
    const hits: THREE.Object3D[] = [];
    for (const b of buildings) {
      const box = PLAN[b.id];
      if (!box) continue;
      const levels = levelsOf(b), h = levels * FH;
      const col = BUILDING_COLORS[b.id] ?? { l: "#6b7280", r: "#8a919c", roof: "#dde0e4", win: "#f1f3f5" };
      const w = (box.s1 - box.s0) * SX, d = (box.t1 - box.t0) * SZ, x = X((box.s0 + box.s1) / 2), z = Z((box.t0 + box.t1) / 2);
      const group = new THREE.Group(); S.add(group);
      const mats: THREE.MeshStandardMaterial[] = [];
      const m = (o: THREE.MeshStandardMaterialParameters) => { const mm = mat({ ...o, transparent: true }); mats.push(mm); return mm; };
      if (b.id === "C") {
        const r = Math.min(w, d) / 2;
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), m({ map: facadeTexture(col.r, col.win, levels), roughness: 0.6 }));
        cyl.position.set(x, h / 2, z); cyl.castShadow = cyl.receiveShadow = true; group.add(cyl); trash.push(cyl.geometry);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m({ color: 0x8fc3e6, roughness: 0.08, metalness: 0.4, opacity: 0.85 }));
        dome.position.set(x, h, z); group.add(dome); trash.push(dome.geometry);
        hits.push(cyl, dome); cyl.userData.id = dome.userData.id = b.id;
      } else {
        const tex = facadeTexture(col.r, col.win, levels);
        const texSide = tex.clone(); texSide.needsUpdate = true; texSide.repeat.set(Math.max(1, Math.round(d / 4)), 1); tex.repeat.set(Math.max(1, Math.round(w / 4)), 1);
        trash.push(tex, texSide);
        const side = m({ map: texSide, roughness: 0.7 }), front = m({ map: tex, roughness: 0.7 }), roof = m({ color: col.roof, roughness: 0.9 });
        const mesh = new THREE.Mesh(BOX, [side, side, roof, roof, front, front]);
        mesh.scale.set(w, h, d); mesh.position.set(x, h / 2, z); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.id = b.id;
        group.add(mesh); hits.push(mesh);
        const rim = new THREE.Mesh(BOX, m({ color: col.l, roughness: 0.8 })); rim.scale.set(w + 0.15, 0.25, d + 0.15); rim.position.set(x, h + 0.12, z); group.add(rim);
      }
      const tag = label(b.id.startsWith("A") ? `Annex ${b.short}` : `${b.short}`, false);
      tag.position.set(x, h + 1.2, z); S.add(tag);
      blds.push({ id: b.id, group, mats, box, h, tag, levels });
    }
    // the two bridges between D and Annex 9 (2nd and 3rd floors)
    if (PLAN.D && PLAN.A9) {
      const bm = mat({ color: 0x9aa4b2, roughness: 0.4, metalness: 0.3 });
      const z0 = Z(PLAN.A9.t1), z1 = Z(PLAN.D.t0), x = X((PLAN.D.s0 + PLAN.D.s1) / 2);
      for (const f of [2, 3]) put(bm, 1.6, FH * 0.8, z1 - z0, x, f * FH + FH * 0.45, (z0 + z1) / 2);
    }

    // highlight pieces: pin, floor band, big label, walker and route
    const hot = mat({ color: 0xd85a30, emissive: 0xd85a30, emissiveIntensity: 0.35, roughness: 0.5 });
    const pin = new THREE.Group();
    const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), hot); pinHead.position.y = 1.1;
    const pinTip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 20), hot); pinTip.rotation.x = Math.PI; pinTip.position.y = 0.4;
    pin.add(pinHead, pinTip); pin.visible = false; S.add(pin); trash.push(pinHead.geometry, pinTip.geometry);
    const band = put(mat({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.5, transparent: true, opacity: 0.75 }), 1, FH, 1, 0, 0, 0, false); band.visible = false;
    let bigTag: THREE.Sprite | null = null;
    const person = new THREE.Group(); S.add(person); person.visible = false;
    const legs = [-0.12, 0.12].map((dx) => { const p = new THREE.Group(); p.position.set(dx, 0.6, 0); const l = new THREE.Mesh(BOX, mat({ color: 0x1b1d22 })); l.scale.set(0.16, 0.6, 0.18); l.position.y = -0.3; p.add(l); person.add(p); return p; });
    const body = new THREE.Mesh(BOX, mat({ color: 0x1f3a7a })); body.scale.set(0.5, 0.6, 0.3); body.position.y = 0.92; body.castShadow = true; person.add(body);
    const bag = new THREE.Mesh(BOX, mat({ color: 0xf2b01e })); bag.scale.set(0.36, 0.44, 0.16); bag.position.set(0, 0.95, -0.22); person.add(bag);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), mat({ color: 0xc08a62 })); head.position.y = 1.42; person.add(head); trash.push(head.geometry);
    person.scale.setScalar(1.2);
    let routeLine: THREE.Line | null = null;
    let path: THREE.Vector3[] = [], pathLen = 0, walkT0 = -1;

    // camera: overview, or a flight to the chosen building
    const overview = { pos: new THREE.Vector3(14, 62, 78), look: new THREE.Vector3(4, 0, -10) };
    const cam = { pos: overview.pos.clone(), look: overview.look.clone() };
    const goal = { pos: overview.pos.clone(), look: overview.look.clone() };
    let orbit = 0, drag: { x: number } | null = null, lastTouch = 0, lastDraw = 0, selId: string | null = null, flyT0 = 0;

    const select = (id: string | null, fl: number | null) => {
      const changed = id !== selId;
      selId = id;
      for (const b of blds) {
        const on = !id || b.id === id;
        for (const m of b.mats) { m.opacity = on ? 1 : 0.22; m.depthWrite = on; m.emissive?.setHex(b.id === id ? 0x331100 : 0x000000); }
        b.tag.visible = !id;
      }
      if (bigTag) { S.remove(bigTag); bigTag.material.map?.dispose(); bigTag.material.dispose(); bigTag = null; }
      if (routeLine) { S.remove(routeLine); routeLine.geometry.dispose(); (routeLine.material as THREE.Material).dispose(); routeLine = null; }
      const b = blds.find((x) => x.id === id);
      if (!b) {
        pin.visible = band.visible = person.visible = false;
        goal.pos.copy(overview.pos); goal.look.copy(overview.look); flyT0 = performance.now();
        setStatus("Tap a building to see where it is and how to walk there.");
        return;
      }
      const cx = X((b.box.s0 + b.box.s1) / 2), cz = Z((b.box.t0 + b.box.t1) / 2);
      const w = (b.box.s1 - b.box.s0) * SX, d = (b.box.t1 - b.box.t0) * SZ;
      pin.visible = true; pin.position.set(cx, b.h + 1.2, cz);
      const meta = buildings.find((x) => x.id === id);
      bigTag = label(meta ? nameOf(meta) : b.id, true); bigTag.position.set(cx, b.h + 4.4, cz); S.add(bigTag);
      if (fl !== null && fl < b.levels) {
        band.visible = true;
        if (id === "C") { band.scale.set(Math.min(w, d) + 0.25, FH * 0.9, Math.min(w, d) + 0.25); }
        else band.scale.set(w + 0.25, FH * 0.9, d + 0.25);
        band.position.set(cx, fl * FH + FH / 2, cz);
      } else band.visible = false;
      if (changed) {
        // route from the main gate along the walkways
        path = routeTo(id!).map(([s, t]) => new THREE.Vector3(X(s), 0.12, Z(t)));
        pathLen = 0; for (let i = 1; i < path.length; i++) pathLen += path[i].distanceTo(path[i - 1]);
        const g = new THREE.BufferGeometry().setFromPoints(path.map((p) => p.clone().setY(0.16)));
        routeLine = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xf2b01e, dashSize: 0.8, gapSize: 0.5 })); routeLine.computeLineDistances(); S.add(routeLine);
        person.visible = true; person.position.copy(path[0]); walkT0 = performance.now() + (reduce ? -1e7 : 1400);
        const size = Math.max(w, d, b.h);
        goal.look.set((cx + X(GATE.s)) / 2 * 0.35 + cx * 0.65, b.h * 0.35, (cz + Z(GATE.t)) / 2 * 0.35 + cz * 0.65);
        goal.pos.set(goal.look.x + 10 + size * 0.6, b.h + 16 + size * 0.8, goal.look.z + 22 + size * 0.9);
        flyT0 = performance.now();
        setStatus(`${meta ? nameOf(meta) : b.id}: follow the student from the main gate.`);
      } else if (routeLine === null && path.length) {
        const g = new THREE.BufferGeometry().setFromPoints(path.map((p) => p.clone().setY(0.16)));
        routeLine = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xf2b01e, dashSize: 0.8, gapSize: 0.5 })); routeLine.computeLineDistances(); S.add(routeLine);
      }
      lastTouch = performance.now();
    };
    api.current = { select };

    // pointer: drag to turn, tap to choose a building
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX }; downAt = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); dom.style.cursor = "grabbing"; lastTouch = performance.now(); };
    const move = (e: PointerEvent) => { lastTouch = performance.now(); if (!drag) return; orbit -= (e.clientX - drag.x) * 0.006; drag = { x: e.clientX }; };
    const up = (e: PointerEvent) => {
      dom.style.cursor = "grab"; drag = null;
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) {
        const r = dom.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, C);
        const hit = ray.intersectObjects(hits, false)[0];
        if (hit?.object.userData.id) pickRef.current(hit.object.userData.id as string);
      }
      downAt = null;
    };
    dom.addEventListener("pointerdown", down); dom.addEventListener("pointermove", move); dom.addEventListener("pointerup", up); dom.addEventListener("pointercancel", up);

    let onScreen = true;
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }); io.observe(el);
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const start = { pos: cam.pos.clone(), look: cam.look.clone() };
    let lastFly = -1, raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!onScreen || document.hidden) return;
      const moving = now - flyT0 < 2200 || (walkT0 > 0 && now - walkT0 < 12000) || now - lastTouch < 1500;
      if (!moving && now - lastDraw < 250) return;
      lastDraw = now;
      // camera flight
      if (flyT0 !== lastFly) { lastFly = flyT0; start.pos.copy(cam.pos); start.look.copy(cam.look); }
      const k = reduce ? 1 : ease(Math.min(1, (now - flyT0) / 1800));
      cam.pos.lerpVectors(start.pos, goal.pos, k); cam.look.lerpVectors(start.look, goal.look, k);
      const off = cam.pos.clone().sub(cam.look); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
      C.position.copy(cam.look).add(off); C.lookAt(cam.look);
      // walker
      if (person.visible && path.length > 1) {
        const dist = Math.max(0, (now - walkT0) / 1000) * 7;     // metres per second (sped up)
        let left = Math.min(dist, pathLen), i = 1;
        while (i < path.length - 1 && left > path[i].distanceTo(path[i - 1])) { left -= path[i].distanceTo(path[i - 1]); i++; }
        const a = path[i - 1], b = path[i], seg = a.distanceTo(b) || 1;
        person.position.lerpVectors(a, b, Math.min(1, left / seg));
        person.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        const walking = dist > 0 && dist < pathLen, sw = walking ? Math.sin(now / 95) * 0.7 : 0;
        legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
        if (dist >= pathLen && selId) setStatus(`You have arrived at ${nameOf(buildings.find((x) => x.id === selId)!)}.`);
      }
      if (pin.visible) { pin.position.y = (blds.find((b) => b.id === selId)?.h ?? 0) + 1.2 + Math.sin(now / 300) * 0.25; pin.rotation.y = now / 800; }
      R.render(S, C);
    };
    raf = requestAnimationFrame(frame);
    select(selected, floor);

    const onResize = () => { R.setSize(el.clientWidth, H()); C.aspect = el.clientWidth / H(); C.updateProjectionMatrix(); lastTouch = performance.now(); };
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", onResize); io.disconnect();
      dom.removeEventListener("pointerdown", down); dom.removeEventListener("pointermove", move); dom.removeEventListener("pointerup", up); dom.removeEventListener("pointercancel", up);
      S.traverse((o) => { if (o instanceof THREE.Sprite) { o.material.map?.dispose(); o.material.dispose(); } if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) o.material.map?.dispose(); });
      trash.forEach((d) => d.dispose()); R.dispose(); dom.remove(); api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings]);

  useEffect(() => { api.current?.select(selected, floor); }, [selected, floor]);

  if (failed) return null;
  return (
    <div>
      <div ref={host} className="relative w-full overflow-hidden rounded-xl bg-[linear-gradient(rgb(var(--c-paper)),rgb(var(--c-track)))]" aria-hidden />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="font-display font-semibold" aria-live="polite">{status}</p>
        {selected && <button type="button" className="chip" onClick={() => pickRef.current("")}>Show whole campus</button>}
      </div>
    </div>
  );
}
