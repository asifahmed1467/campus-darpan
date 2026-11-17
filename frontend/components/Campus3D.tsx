"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ENTRY, GATES, SX, SZ, WALKWAYS, bestRoute } from "@/lib/campusRoute";
import { BUILDING_COLORS, FIELD, LAWN, PARKING, PLAN, TREES, type Box, type CampusBuilding } from "./CampusMap";

/**
 * The campus in 3D, built from the same schematic plan as the flat map (not a surveyed model).
 * Tap a building: the camera flies to it, the others fade, and a student walks there from the main gate.
 * Choosing a floor lights that floor up.
 */
const X = (s: number) => (s - 0.55) * SX;
const Z = (t: number) => (t + 0.45) * SZ;
const FH = 0.95;                              // floor height
const UNKNOWN_LEVELS = 3, C_LEVELS = 4;
const GATE = GATES.main;

const levelsOf = (b: CampusBuilding) => (b.id === "C" ? C_LEVELS : b.levels ?? UNKNOWN_LEVELS);
const nameOf = (b: CampusBuilding) => (b.id === "D" ? "D Building" : b.id === "C" ? "C Building" : b.id === "A7" ? "Annex 7" : b.name);

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
  const w = big ? 640 : 400, h = big ? 150 : 110; c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = big ? "#D85A30" : "rgba(15,27,61,0.92)";
  g.beginPath(); g.roundRect(4, 6, w - 8, h - 12, 24); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 5; g.stroke();
  g.fillStyle = "#fff"; g.font = `800 ${big ? 78 : 64}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 3, w - 40);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.renderOrder = 10;
  const sh = big ? 3.6 : 2.6; sp.scale.set((w / h) * sh, sh, 1); sp.userData.base = sp.scale.clone();
  return sp;
}

export default function Campus3D({ buildings, selected, floor, onSelect }: {
  buildings: CampusBuilding[]; selected: string | null; floor: number | null; onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ select: (id: string | null, floor: number | null) => void; rotate: (d: number) => void; zoom: (f: number) => void; reset: () => void; replay: () => void } | null>(null);
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
    for (const way of WALKWAYS) for (let i = 1; i < way.length; i++) walk(way[i - 1][0], way[i - 1][1], way[i][0], way[i][1]);
    for (const id of Object.keys(PLAN)) {       // the short footpath from a walkway to each building, so nobody walks on grass
      const r = bestRoute(id);
      if (r && r.points.length > 1) { const a = r.points[r.points.length - 2], c = r.points[r.points.length - 1]; walk(a[0], a[1], c[0], c[1]); }
    }
    const gateM = mat({ color: 0x3b4252, roughness: 0.5, metalness: 0.5 });
    const gateTags: THREE.Sprite[] = [];
    for (const g of Object.values(GATES)) {
      put(gateM, 5, 0.3, 0.3, X(g.s), 2.4, Z(g.t) + 0.6);     // gate arch
      for (const dx of [-2.4, 2.4]) put(gateM, 0.3, 2.4, 0.3, X(g.s) + dx, 1.2, Z(g.t) + 0.6);
      const tag = label(g.name, false); tag.position.set(X(g.s), 4.2, Z(g.t) + 0.6); S.add(tag); gateTags.push(tag);
    }
    const startTag = label("Start here", false); startTag.position.set(X(ENTRY.s), 4.2, Z(ENTRY.t)); S.add(startTag); gateTags.push(startTag);
    const startDot = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.08, 24), mat({ color: 0xd85a30, emissive: 0xd85a30, emissiveIntensity: 0.5 }));
    startDot.position.set(X(ENTRY.s), 0.12, Z(ENTRY.t)); S.add(startDot); trash.push(startDot.geometry);
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
      } else if (b.id === "D") {
        // D Building as in the photo: warm stone bands and dark glass window strips on every floor, darker top floors,
        // a planted terrace ledge on the field side, and the tall charcoal tower at the North end.
        const stone = m({ color: 0xd9d3c7, roughness: 0.85 }), stoneDark = m({ color: 0x8d8a85, roughness: 0.8 });
        const glass = m({ color: 0x4a5a6e, roughness: 0.1, metalness: 0.35, emissive: 0x16202c, emissiveIntensity: 0.4 });
        const towerM = m({ color: 0x3a3d43, roughness: 0.7 }), towerWin = m({ color: 0x9fb1c4, roughness: 0.2 });
        const leaf = m({ color: dark ? 0x2f6a3e : 0x4d8f46, roughness: 1 }), pot = m({ color: 0x6f6a62, roughness: 0.9 });
        const towerD = Math.min(3.2, d * 0.16), bodyD = d - towerD;          // tower at the North (front, road) end
        const bz = z - towerD / 2;                                           // centre of the main block
        const part = (mm: THREE.Material, ww: number, hh: number, dd: number, xx: number, yy: number, zz: number) => {
          const me = new THREE.Mesh(BOX, mm); me.scale.set(ww, hh, dd); me.position.set(xx, yy, zz); me.castShadow = me.receiveShadow = true; group.add(me); return me;
        };
        for (let f = 0; f < levels; f++) {
          const y = f * FH, band = f >= levels - 2 ? stoneDark : stone;
          const inset = f >= 7 ? 0.45 : 0;                                    // upper floors step back on the field side
          part(band, w - inset, FH * 0.45, bodyD, x + inset / 2, y + FH * 0.225, bz);
          part(glass, w - inset - 0.12, FH * 0.5, bodyD - 0.12, x + inset / 2, y + FH * 0.7, bz);
        }
        part(stone, w + 0.2, 0.18, bodyD + 0.2, x, h + 0.09, bz);            // roof slab
        for (let k = 0; k < 6; k++) {                                         // planted ledge on the 7th floor, field side
          const zz = bz - bodyD / 2 + 1.2 + k * ((bodyD - 2.4) / 5);
          part(pot, 0.5, 0.25, 0.9, x - w / 2 + 0.25, 7 * FH + 0.12, zz);
          part(leaf, 0.55, 0.45, 0.8, x - w / 2 + 0.25, 7 * FH + 0.45, zz);
        }
        const tz = z + d / 2 - towerD / 2, th = h + 1.4 * FH;
        part(towerM, w * 0.85, th, towerD, x, th / 2, tz);
        for (let f = 0; f < levels + 1; f++) part(towerWin, 0.05, FH * 0.32, towerD * 0.3, x - w * 0.425 - 0.03, f * FH + FH * 0.55, tz);
        // one invisible box for tapping
        const pick = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        pick.scale.set(w, th, d); pick.position.set(x, th / 2, z); pick.userData.id = b.id; group.add(pick); hits.push(pick);
        trash.push(pick.material as THREE.Material);
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
    // the student: capsule body, swinging arms and legs, backpack, hair, soft shadow
    const person = new THREE.Group(); S.add(person); person.visible = false;
    const rig = new THREE.Group(); person.add(rig);
    const skin = mat({ color: 0xc08a62, roughness: 0.8 }), shirt = mat({ color: 0x2457c5, roughness: 0.7 }), pants = mat({ color: 0x252a36, roughness: 0.8 });
    const bagM = mat({ color: 0xf2b01e, roughness: 0.6 }), dark1 = mat({ color: 0x14161b, roughness: 0.7 });
    const cap = (r: number, l: number) => { const g = new THREE.CapsuleGeometry(r, l, 4,10); trash.push(g); return g; };
    const ball = (r: number) => { const g = new THREE.SphereGeometry(r, 14, 10); trash.push(g); return g; };
    const part = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = rig) => {
      const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me;
    };
    const torso = part(cap(0.2, 0.34), shirt, 0, 1.18, 0); torso.scale.z = 0.72;
    const headM = part(ball(0.17), skin, 0, 1.72, 0);
    const hair = part(ball(0.18), dark1, 0, 1.77, -0.025); hair.scale.set(1, 0.7, 1);
    part(new THREE.BoxGeometry(0.4, 0.5, 0.18), bagM, 0, 1.2, -0.24); trash.push(headM.geometry);
    const limb = (x: number, y: number, len: number, rad: number, m: THREE.Material, tip: THREE.Material, tipY: number) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0); rig.add(pivot);
      part(cap(rad, len), m, 0, -len / 2 - rad * 0.6, 0, pivot);
      part(ball(rad * 1.15), tip, 0, tipY, 0, pivot);
      return pivot;
    };
    const legs = [limb(-0.1, 0.86, 0.5, 0.075, pants, dark1, -0.86), limb(0.1, 0.86, 0.5, 0.075, pants, dark1, -0.86)];
    const arms = [limb(-0.3, 1.4, 0.4, 0.06, shirt, skin, -0.55), limb(0.3, 1.4, 0.4, 0.06, shirt, skin, -0.55)];
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; person.add(blob); trash.push(blob.geometry, blob.material as THREE.Material);
    person.scale.setScalar(1.5);
    // route drawn as a flat amber ribbon on the ground
    const ribbonM = mat({ color: 0xf2b01e, emissive: 0xf2b01e, emissiveIntensity: 0.5, roughness: 0.6 });
    let routeGroup: THREE.Group | null = null;
    let path: THREE.Vector3[] = [], pathLen = 0, walkT0 = -1, speed = 12, yaw = 0, gateName = "", routeMetres = 0;
    const drawRoute = () => {
      if (routeGroup) { S.remove(routeGroup); routeGroup = null; }
      if (path.length < 2) return;
      routeGroup = new THREE.Group();
      const dotG = new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16); trash.push(dotG);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], c = path[i], len = a.distanceTo(c);
        const seg = new THREE.Mesh(BOX, ribbonM); seg.scale.set(0.9, 0.05, len); seg.position.set((a.x + c.x) / 2, 0.14, (a.z + c.z) / 2);
        seg.rotation.y = Math.atan2(c.x - a.x, c.z - a.z); routeGroup.add(seg);
      }
      for (const p of path) { const d = new THREE.Mesh(dotG, ribbonM); d.position.set(p.x, 0.14, p.z); routeGroup.add(d); }
      S.add(routeGroup);
    };

    // drone camera: it glides to a spot behind and above whatever it is following
    const overview = { pos: new THREE.Vector3(14, 62, 78), look: new THREE.Vector3(4, 0, -10) };
    const cam = { pos: overview.pos.clone(), look: overview.look.clone() };
    const goal = { pos: overview.pos.clone(), look: overview.look.clone() };
    let orbit = 0, auto = 0, zoom = 1, drag: { x: number } | null = null, lastTouch = 0, lastDraw = 0, selId: string | null = null, lastNow = 0;
    const heading = new THREE.Vector3(0, 0, -1);

    const select = (id: string | null, fl: number | null) => {
      const changed = id !== selId;
      selId = id;
      for (const b of blds) {
        const on = !id || b.id === id;
        for (const m of b.mats) { m.opacity = on ? 1 : 0.22; m.depthWrite = on; m.emissive?.setHex(b.id === id ? 0x331100 : 0x000000); }
        b.tag.visible = !id;
      }
      if (bigTag) { S.remove(bigTag); bigTag.material.map?.dispose(); bigTag.material.dispose(); bigTag = null; }
      const b = blds.find((x) => x.id === id);
      if (!b) {
        if (routeGroup) { S.remove(routeGroup); routeGroup = null; }
        path = []; pathLen = 0;
        pin.visible = band.visible = person.visible = false;
        goal.pos.copy(overview.pos); goal.look.copy(overview.look); auto = 0;
        setStatus("Tap a building to see where it is and how to walk there.");
        return;
      }
      const cx = X((b.box.s0 + b.box.s1) / 2), cz = Z((b.box.t0 + b.box.t1) / 2);
      const w = (b.box.s1 - b.box.s0) * SX, d = (b.box.t1 - b.box.t0) * SZ;
      pin.visible = true; pin.position.set(cx, b.h + 1.2, cz);
      const meta = buildings.find((x) => x.id === id);
      const title = meta ? nameOf(meta) : b.id;
      bigTag = label(title, true); bigTag.position.set(cx, b.h + 5.2, cz); S.add(bigTag);
      if (fl !== null && fl < b.levels) {
        band.visible = true;
        if (id === "C") { band.scale.set(Math.min(w, d) + 0.25, FH * 0.9, Math.min(w, d) + 0.25); }
        else band.scale.set(w + 0.25, FH * 0.9, d + 0.25);
        band.position.set(cx, fl * FH + FH / 2, cz);
      } else band.visible = false;
      if (changed) {
        // shortest walk from the nearer entrance, along the walkways
        const r = bestRoute(id!);
        path = r ? r.points.map(([s, t]) => new THREE.Vector3(X(s), 0.12, Z(t))) : [];
        pathLen = 0; for (let i = 1; i < path.length; i++) pathLen += path[i].distanceTo(path[i - 1]);
        gateName = r ? GATES[r.gate].name : GATE.name; routeMetres = r ? Math.round(r.metres) : 0;
        drawRoute();
        auto = 0; orbit = 0;
        person.visible = path.length > 1;
        if (path.length > 1) {
          person.position.copy(path[0]); speed = Math.max(12, pathLen / 8); walkT0 = performance.now() + (reduce ? -1e7 : 900);   // fast, and never longer than about 8 seconds
          heading.set(path[1].x - path[0].x, 0, path[1].z - path[0].z).normalize();
          yaw = Math.atan2(heading.x, heading.z);
        }
        const size = Math.max(w, d, b.h);
        goal.look.set(cx, b.h * 0.4, cz);
        goal.pos.set(cx + 12 + size * 0.5, b.h + 18 + size * 0.7, cz + 26 + size * 0.8);
        setStatus(`${title}: the student starts at the road end and walks in through the ${gateName} (about ${routeMetres} m).`);
      } else if (!routeGroup && path.length) drawRoute();
      lastTouch = performance.now();
    };
    api.current = {
      select,
      rotate: (d: number) => { orbit += d; lastTouch = performance.now(); },
      zoom: (f: number) => { zoom = Math.min(1.9, Math.max(0.55, zoom * f)); lastTouch = performance.now(); },
      replay: () => { if (path.length > 1) { person.position.copy(path[0]); walkT0 = performance.now() + 500; auto = 0; lastTouch = performance.now(); } },
      reset: () => { orbit = 0; zoom = 1; lastTouch = performance.now(); },
    };

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
    let raf = 0, lost = false;
    const UP = new THREE.Vector3(0, 1, 0), tp = new THREE.Vector3(), tl = new THREE.Vector3(), off = new THREE.Vector3();
    const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const onLost = (e: Event) => { e.preventDefault(); lost = true; };
    const onRestored = () => { lost = false; lastTouch = performance.now(); };
    dom.addEventListener("webglcontextlost", onLost); dom.addEventListener("webglcontextrestored", onRestored);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!onScreen || document.hidden || lost) return;
      try {
        const dt = Math.min(0.06, lastNow ? (now - lastNow) / 1000 : 0.016); 
        const dist = selId && path.length > 1 ? Math.max(0, (now - walkT0) / 1000) * speed : 0;
        const walking = person.visible && path.length > 1 && now >= walkT0 && dist < pathLen;
        const arrived = person.visible && path.length > 1 && dist >= pathLen;
        const settling = cam.pos.distanceTo(tp) + cam.look.distanceTo(tl) > 0.1;
        const busy = walking || !!selId || settling || now - lastTouch < 1500 || now < walkT0;
        if (!busy && now - lastDraw < 100) return;
        if (busy && now - lastDraw < 20) return;
        lastNow = now; lastDraw = now;
        // walker: follow the path, turn smoothly at corners, swing arms and legs, bob a little
        if (person.visible && path.length > 1) {
          let left = Math.min(dist, pathLen), i = 1;
          while (i < path.length - 1 && left > path[i].distanceTo(path[i - 1])) { left -= path[i].distanceTo(path[i - 1]); i++; }
          const a = path[i - 1], c = path[i], seg = a.distanceTo(c) || 1;
          person.position.lerpVectors(a, c, Math.min(1, left / seg));
          const want = Math.atan2(c.x - a.x, c.z - a.z);
          yaw += wrapA(want - yaw) * Math.min(1, dt * 9);
          person.rotation.y = yaw; heading.set(Math.sin(yaw), 0, Math.cos(yaw));
          const sw = walking ? Math.sin(now / 90) * 0.8 : 0;
          legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
          arms[0].rotation.x = -sw * 0.8; arms[1].rotation.x = walking ? sw * 0.8 : Math.PI * 0.85 + Math.sin(now / 160) * 0.25;   // waves on arrival
          rig.position.y = walking ? Math.abs(Math.sin(now / 90)) * 0.08 : 0;
          if (arrived && selId) setStatus(`You have arrived at ${nameOf(buildings.find((x) => x.id === selId) ?? ({ id: selId, name: selId } as CampusBuilding))}.`);
        }
        // where the drone wants to be
        if (person.visible && path.length > 1 && !arrived && !reduce) {      // drone follows from the gate until the student arrives
          tl.copy(person.position).addScaledVector(heading, 5).setY(1.4);
          tp.copy(person.position).addScaledVector(heading, -13).setY(10.5 + Math.sin(now / 900) * 0.4);
        } else {
          tl.copy(goal.look); tp.copy(goal.pos);
          if (arrived && !reduce) auto += dt * 0.12;         // slow lap around the building
        }
        off.copy(tp).sub(tl).applyAxisAngle(UP, orbit + auto).multiplyScalar(zoom);
        tp.copy(tl).add(off);
        const kp = reduce ? 1 : 1 - Math.exp(-dt * (walking ? 4.5 : 3)), kl = reduce ? 1 : 1 - Math.exp(-dt * 4.5);
        cam.pos.lerp(tp, kp); cam.look.lerp(tl, kl);
        C.position.copy(cam.pos); C.lookAt(cam.look);
        if (pin.visible) { pin.position.y = (blds.find((b) => b.id === selId)?.h ?? 0) + 1.2 + Math.sin(now / 300) * 0.25; pin.rotation.y = now / 800; }
        // names stay readable: they grow a little as the camera moves away
        const grow = (t: THREE.Sprite) => { const f = Math.min(2.2, Math.max(0.9, C.position.distanceTo(t.position) / 55)); t.scale.copy(t.userData.base).multiplyScalar(f); };
        for (const b of blds) if (b.tag.visible) grow(b.tag);
        gateTags.forEach(grow); if (bigTag) grow(bigTag);
        R.render(S, C);
      } catch (e) { console.error("3D campus frame", e); }
    };
    raf = requestAnimationFrame(frame);
    select(selected, floor);

    const onResize = () => { R.setSize(el.clientWidth, H()); C.aspect = el.clientWidth / H(); C.updateProjectionMatrix(); lastTouch = performance.now(); };
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf); removeEventListener("resize", onResize); io.disconnect();
      dom.removeEventListener("pointerdown", down); dom.removeEventListener("pointermove", move); dom.removeEventListener("pointerup", up); dom.removeEventListener("pointercancel", up);
      dom.removeEventListener("webglcontextlost", onLost); dom.removeEventListener("webglcontextrestored", onRestored);
      S.traverse((o) => { if (o instanceof THREE.Sprite) { o.material.map?.dispose(); o.material.dispose(); } if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) o.material.map?.dispose(); });
      trash.forEach((d) => d.dispose()); R.dispose(); dom.remove(); api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings]);

  useEffect(() => { api.current?.select(selected, floor); }, [selected, floor]);

  if (failed) return null;
  const btn = "grid h-10 w-10 place-items-center rounded-full border border-line bg-sheet/90 font-display text-xl font-bold shadow-md active:scale-95";
  return (
    <div>
      <div className="relative">
        <div ref={host} className="relative w-full overflow-hidden rounded-xl bg-[linear-gradient(rgb(var(--c-paper)),rgb(var(--c-track)))]" aria-hidden />
        <div className="absolute right-2 top-2 flex flex-col gap-2" role="group" aria-label="Map view controls">
          <button type="button" className={btn} aria-label="Zoom in" onClick={() => api.current?.zoom(0.8)}>+</button>
          <button type="button" className={btn} aria-label="Zoom out" onClick={() => api.current?.zoom(1.25)}>&minus;</button>
          <button type="button" className={btn} aria-label="Turn left" onClick={() => api.current?.rotate(0.4)}>&#8630;</button>
          <button type="button" className={btn} aria-label="Turn right" onClick={() => api.current?.rotate(-0.4)}>&#8631;</button>
          <button type="button" className={btn} aria-label="Reset view" onClick={() => api.current?.reset()}>&#8634;</button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="font-display font-semibold" aria-live="polite">{status}</p>
        <div className="flex gap-2">
          {selected && <button type="button" className="chip" onClick={() => api.current?.replay()}>Walk again</button>}
          {selected && <button type="button" className="chip" onClick={() => pickRef.current("")}>Show whole campus</button>}
        </div>
      </div>
    </div>
  );
}
