"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/i18n";

/**
 * Full-page WebGL background for the home page, made from one photo of the campus dome:
 * depth parallax that follows the mouse (a slow drift otherwise), drifting clouds in the sky,
 * windows that breathe warm amber, a light sweep across the dome, and a click/tap animation on
 * the dome (ripple, panels lighting up, camera focus, info card).
 *
 * Assets in /public/hero: photo.jpg (1660x2956), maps.png (R depth, G sky, B lit windows),
 * dome.png (dome mask, also the click area), blur.jpg (placeholder and side fill).
 */

const IMG_W = 1660, IMG_H = 2956, ASPECT = IMG_W / IMG_H;
const DOME_C: [number, number] = [0.318, 0.737];     // dome centre in photo UV
const HOT: [number, number] = [0.36, 0.56];         // where the hint dot sits on the dome
const CAM_X = 0.015, CAM_Y = 0.01;                  // parallax strength, in photo widths
const UI = "a,button,input,textarea,select,label,header,nav,footer,[role=dialog],.glass-panel,.neu-raised,.neu-raised-sm,[data-ui]";

const VS = `attribute vec2 p; varying vec2 vPos; uniform vec2 uRes;
void main(){ vPos = (p * 0.5 + 0.5) * uRes; vPos.y = uRes.y - vPos.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `precision highp float;
varying vec2 vPos;
uniform sampler2D tPhoto, tMaps, tDome, tBlur;
uniform vec4 uRect; uniform vec2 uRes, uCam, uClick, uDomeC;
uniform float uTime, uTheme, uHover, uOpen, uWave, uClickT, uZoom, uWide, uAniso;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
float ring(float t, float r){ if (t < 0.0 || t > 1.2) return 0.0; float d = (r - 0.6 * t) / 0.04; return exp(-d * d) * (1.0 - t / 1.2); }
void main(){
  vec2 q = (vPos - uRect.xy) / uRect.zw;
  q = uDomeC + (q - uDomeC) / uZoom;
  vec2 uv = q;
  for (int i = 0; i < 4; i++) {
    float dep = texture2D(tMaps, uv).r, dm = texture2D(tDome, uv).r;
    uv = q + uCam * (dep - 0.38) * (1.0 + uOpen * dm);
  }
  // side fill: blurred photo, graded navy (dark) or pale grey (light)
  float vy = clamp(vPos.y / uRes.y, 0.0, 1.0);
  vec3 blurC = texture2D(tBlur, clamp(uv, 0.0, 1.0)).rgb;
  vec3 fd = mix(vec3(0.043, 0.078, 0.141), vec3(0.106, 0.165, 0.267), smoothstep(0.0, 0.7, vy));   // #0B1424 -> #1B2A44
  vec3 fl = mix(vec3(0.867, 0.898, 0.933), vec3(0.765, 0.816, 0.871), smoothstep(0.0, 0.7, vy));   // #DDE5EE -> #C3D0DE
  vec3 fill = mix(mix(fd, blurC * vec3(0.5, 0.6, 0.8), 0.18), mix(fl, blurC, 0.12), uTheme);
  fill *= 1.0 - 0.25 * uOpen;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(fill, 1.0); return; }

  // photo with contrast-adaptive sharpening (CAS style)
  vec2 px = uZoom / uRect.zw;
  vec3 c = texture2D(tPhoto, uv).rgb;
  vec3 n = texture2D(tPhoto, uv + vec2(0.0, -px.y)).rgb, s = texture2D(tPhoto, uv + vec2(0.0, px.y)).rgb;
  vec3 e = texture2D(tPhoto, uv + vec2(px.x, 0.0)).rgb, w = texture2D(tPhoto, uv + vec2(-px.x, 0.0)).rgb;
  vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 wg = -amp / mix(8.0, 5.0, 0.42);
  vec3 c0 = c;
  c = mix(c0, clamp((c + (n + s + e + w) * wg) / (1.0 + 4.0 * wg), 0.0, 1.0), 0.55);

  vec3 m = texture2D(tMaps, uv).rgb; float sky = m.g, win = m.b, dome = texture2D(tDome, uv).r;
  // clouds, sky only, +-10%
  float cl = fbm(uv * vec2(2.6, 5.2) + vec2(uTime * 0.012, uTime * 0.002));
  c *= 1.0 + sky * (cl - 0.5) * 0.4;
  // live grade: dark = blue hour, light = soft evening
  float L = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 sh = vec3(0.86, 0.94, 1.08), hi = vec3(1.06, 1.0, 0.93);                  // split tone
  vec3 dk = pow(c, vec3(1.08)) * mix(sh, hi, smoothstep(0.25, 0.8, L));
  dk = mix(dk, dk * dk * (3.0 - 2.0 * dk), 0.35);                               // soft S-curve
  dk = mix(dk, mix(vec3(0.07, 0.11, 0.19), vec3(0.2, 0.28, 0.4), vy) + (dk - vec3(dot(dk, vec3(0.3, 0.59, 0.11)))) * 0.3, sky * 0.45);
  vec3 lt = c * 1.18 + 0.04; lt = mix(lt, vec3(dot(lt, vec3(0.3, 0.59, 0.11))), 0.08) * mix(vec3(0.97, 0.99, 1.03), vec3(1.04, 1.0, 0.95), smoothstep(0.3, 0.85, L));
  lt = mix(lt, mix(vec3(0.84, 0.88, 0.93), vec3(0.76, 0.81, 0.87), vy), sky * 0.4);
  c = clamp(mix(dk, lt, uTheme), 0.0, 1.0);
  // windows breathe, each at its own pace (4-12 s)
  vec3 amber = vec3(1.0, 0.72, 0.47);
  float h = noise(uv * vec2(38.0, 66.0));                                   // smooth, so no square patches
  float br = 0.5 + 0.5 * sin(6.2832 * (uTime / (4.0 + 8.0 * h) + h * 7.0));
  c += amber * win * (mix(0.5, 0.2, uTheme) * (0.3 + 0.7 * br) + 0.45 * uOpen);
  // light band across the dome every ~20 s
  float band = uv.x * 0.7 + uv.y, pos = fract(uTime / 20.0) * 2.6 - 0.8, bd = (band - pos) / 0.06;
  c += vec3(0.9, 0.95, 1.0) * exp(-bd * bd) * dome * 0.16;
  // hover: brighter dome and a rim light on its outline
  c *= 1.0 + 0.06 * max(uHover, uOpen) * dome;
  // click: ripple across the dome, glass panels flash while the dark lines stay dark
  float lum = dot(c, vec3(0.3, 0.59, 0.11)), panel = smoothstep(0.1, 0.24, lum);
  if (uClickT >= 0.0) {
    float r = length((uv - uClick) * vec2(uRect.z / uRect.w, 1.0));
    float rg = ring(uClickT, r) + 0.5 * ring(uClickT - 0.25, r);
    c *= 1.0 + 0.6 * rg * panel * dome;
    c += vec3(0.8, 0.9, 1.0) * rg * dome * 0.08;
  }
  // panels switch on one by one, bottom to top
  float front = mix(1.04, 0.34, uWave) + (fbm(uv * vec2(14.0, 24.0)) - 0.5) * 0.08;
  c += amber * smoothstep(front, front + 0.03, uv.y) * dome * panel * 0.28 * (1.0 - 0.4 * uTheme);
  // focus: the rest of the scene dims
  c *= 1.0 - 0.25 * uOpen * (1.0 - dome);
  float feather = uWide > 0.5 ? smoothstep(0.0, 0.22, uv.x) : 1.0;
  gl_FragColor = vec4(mix(fill, c, feather), 1.0);
}`;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type Rect = { x: number; y: number; w: number; h: number };

export default function DomeHero() {
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const [wide, setWide] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hintEl = useRef<HTMLDivElement>(null);
  const btnEl = useRef<HTMLButtonElement>(null);
  const cardEl = useRef<HTMLDivElement>(null);
  const st = useRef({ open: false, clickAt: -1, click: [DOME_C[0], DOME_C[1]] as [number, number], reduce: false, rect: { x: 0, y: 0, w: 1, h: 1 } as Rect, cam: [0, 0] as [number, number], zoom: 1 });

  const openAt = useCallback((uv: [number, number]) => {
    const s = st.current;
    s.open = true; s.click = uv; s.clickAt = s.reduce ? -1 : performance.now();
    setOpen(true); setHint(false);
    try { localStorage.setItem("cd-dome-hint", "1"); } catch { /* private mode */ }
  }, []);
  const close = useCallback(() => { st.current.open = false; setOpen(false); }, []);

  useEffect(() => {
    setMounted(true);
    try { setHint(!localStorage.getItem("cd-dome-hint")); } catch { setHint(true); }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const el = canvas.current!;
    const s = st.current;
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    s.reduce = calm.matches;
    const phone = matchMedia("(pointer: coarse)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // dome mask for hit-testing
    let mask: ImageData | null = null;
    const mimg = new Image();
    mimg.onload = () => { const c = document.createElement("canvas"); c.width = mimg.width; c.height = mimg.height; const g = c.getContext("2d")!; g.drawImage(mimg, 0, 0); mask = g.getImageData(0, 0, c.width, c.height); };
    mimg.src = "/hero/dome.png";

    // layout: where the photo sits on screen (CSS px)
    const layout = (): Rect => {
      const W = innerWidth, H = innerHeight, isWide = W / H > 0.85;
      if (isWide) {
        const w = Math.min(Math.max(0.56 * W, H * ASPECT), (IMG_W * 0.85) / dpr), h = w / ASPECT;
        const startY = Math.min(0, Math.max(H - h, -0.2 * h));
        const y = h > H ? startY + (H - h - startY) * smooth(0, H * 1.2, scrollY) : (H - h) / 2;
        return { x: W - w, y, w, h };
      }
      const w = Math.max(W, H * ASPECT), h = w / ASPECT;
      return { x: (W - w) * 0.25, y: (H - h) * 0.5, w, h };
    };
    const toUV = (cx: number, cy: number): [number, number] => {
      const r = s.rect;
      let u = (cx - r.x) / r.w, v = (cy - r.y) / r.h;
      u = DOME_C[0] + (u - DOME_C[0]) / s.zoom; v = DOME_C[1] + (v - DOME_C[1]) / s.zoom;
      return [u + s.cam[0] * 0.42, v + s.cam[1] * 0.42];
    };
    const toScreen = (u: number, v: number): [number, number] => {
      const r = s.rect, uu = DOME_C[0] + (u - s.cam[0] * 0.42 - DOME_C[0]) * s.zoom, vv = DOME_C[1] + (v - s.cam[1] * 0.42 - DOME_C[1]) * s.zoom;
      return [r.x + uu * r.w, r.y + vv * r.h];
    };
    const onDome = (cx: number, cy: number) => {
      if (!mask) return false;
      const [u, v] = toUV(cx, cy);
      if (u < 0 || u > 1 || v < 0 || v > 1) return false;
      const i = (Math.floor(v * (mask.height - 1)) * mask.width + Math.floor(u * (mask.width - 1))) * 4;
      return mask.data[i] > 127;
    };

    // pointer: camera follows the mouse; the dome is hoverable and clickable outside the UI
    let mouse: [number, number] | null = null, lastMove = -1e9, hover = false;
    const overUI = (e: Event) => !!(e.target as Element | null)?.closest?.(UI);
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse") { mouse = [e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5]; lastMove = performance.now(); }
      const h = !overUI(e) && onDome(e.clientX, e.clientY);
      if (h !== hover) { hover = h; document.body.style.cursor = h ? "pointer" : ""; }
    };
    const click = (e: MouseEvent) => {
      if (cardEl.current?.contains(e.target as Node)) return;
      const ui = overUI(e), dome = !ui && onDome(e.clientX, e.clientY);
      if (s.open) { if (!ui || dome) close(); return; }
      if (dome) openAt(toUV(e.clientX, e.clientY));
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && s.open) close(); };
    addEventListener("pointermove", move, { passive: true });
    addEventListener("click", click);
    addEventListener("keydown", key);

    // WebGL
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try { gl = (el.getContext("webgl2", { antialias: false, alpha: false }) as WebGL2RenderingContext | null) ?? (el.getContext("webgl", { antialias: false, alpha: false }) as WebGLRenderingContext | null); } catch { gl = null; }
    const cleanup = () => {
      removeEventListener("pointermove", move); removeEventListener("click", click); removeEventListener("keydown", key);
      document.body.style.cursor = "";
    };
    if (!gl) { setFailed(true); s.rect = layout(); return cleanup; }
    const isGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const sh = (type: number, src: string) => { const x = gl!.createShader(type)!; gl!.shaderSource(x, src); gl!.compileShader(x); if (!gl!.getShaderParameter(x, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(x) ?? "shader"); return x; };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch (x) { console.error("dome hero", x); setFailed(true); return cleanup; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl!.getUniformLocation(prog, n);
    const u = { res: U("uRes"), rect: U("uRect"), cam: U("uCam"), click: U("uClick"), domeC: U("uDomeC"), time: U("uTime"), theme: U("uTheme"), hover: U("uHover"), open: U("uOpen"), wave: U("uWave"), clickT: U("uClickT"), zoom: U("uZoom"), wide: U("uWide") };
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    const textures: WebGLTexture[] = [];
    let loaded = 0;
    const tex = (src: string, unit: number, name: string, mip: boolean) => {
      const tx = gl!.createTexture()!; textures.push(tx);
      gl!.activeTexture(gl!.TEXTURE0 + unit); gl!.bindTexture(gl!.TEXTURE_2D, tx);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 1, 1, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl!.uniform1i(U(name), unit);
      const img = new Image();
      img.onload = () => {
        if (!gl) return;
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (mip && isGL2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
        else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (mip && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        if (++loaded === 4) setReady(true);
      };
      img.onerror = () => setFailed(true);
      img.src = src;
    };
    tex("/hero/photo.jpg", 0, "tPhoto", true); tex("/hero/maps.png", 1, "tMaps", false);
    tex("/hero/dome.png", 2, "tDome", false); tex("/hero/blur.jpg", 3, "tBlur", false);

    let lost = false;
    const onLost = (e: Event) => { e.preventDefault(); lost = true; };
    el.addEventListener("webglcontextlost", onLost);

    const size = () => { el.width = Math.round(innerWidth * dpr); el.height = Math.round(innerHeight * dpr); setWide(innerWidth / innerHeight > 0.85); };
    size(); addEventListener("resize", size);
    const theme = () => (document.documentElement.dataset.theme === "dark" ? 0 : 1);
    let themeV = theme(), hoverV = 0, openV = 0, waveV = 0, frame = 0, raf = 0, lastT = performance.now(), lastBtn = "";
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || lost) return;
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      const animating = s.clickAt > 0 && now - s.clickAt < 1800;
      if (phone && !animating && frame++ % 2) return;                 // phones: 30 fps while idle
      if (s.reduce && frame++ % 15) return;                           // reduced motion: a still picture, refreshed now and then
      const tt = s.reduce ? 0 : (now - t0) / 1000;
      // camera: mouse, or a slow figure-eight drift after 2.5 s idle (always on phones)
      const idle = phone || now - lastMove > 2500;
      const want: [number, number] = s.reduce ? [0, 0] : idle || !mouse
        ? [Math.sin(tt * 0.23) * 0.75 * CAM_X, Math.sin(tt * 0.17 + 1.3) * 0.45 * CAM_Y]
        : [-mouse[0] * 2 * CAM_X, -mouse[1] * 2 * CAM_Y];
      if (hoverV > 0.01 && !s.reduce) { want[0] += (DOME_C[0] - 0.5) * 0.1 * CAM_X * 4 * hoverV; }
      const k = s.reduce ? 1 : 1 - Math.pow(1 - 0.045, dt * 60);
      s.cam[0] += (want[0] - s.cam[0]) * k; s.cam[1] += (want[1] - s.cam[1]) * k;
      themeV += (theme() - themeV) * Math.min(1, dt * 6);
      hoverV += ((hover ? 1 : 0) - hoverV) * Math.min(1, dt / 0.3 * 3);
      const ot = s.open ? 1 : 0;
      openV += (ot - openV) * Math.min(1, dt * (s.open ? 2.4 : 3.3));
      const since = s.clickAt > 0 ? (now - s.clickAt) / 1000 : -1;
      waveV = s.open ? (s.reduce ? 1 : ease(Math.min(1, Math.max(0, (since - 0.3) / 1.1)))) : Math.max(0, waveV - dt / 0.9);
      s.zoom = 1;
      s.rect = layout();
      const r = s.rect;
      gl!.viewport(0, 0, el.width, el.height);
      gl!.uniform2f(u.res, el.width, el.height);
      gl!.uniform4f(u.rect, r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr);
      gl!.uniform2f(u.cam, s.cam[0], s.cam[1]); gl!.uniform2f(u.click, s.click[0], s.click[1]); gl!.uniform2f(u.domeC, DOME_C[0], DOME_C[1]);
      gl!.uniform1f(u.time, tt); gl!.uniform1f(u.theme, themeV); gl!.uniform1f(u.hover, hoverV); gl!.uniform1f(u.open, openV);
      gl!.uniform1f(u.wave, waveV); gl!.uniform1f(u.clickT, since >= 0 && since < 1.6 && !s.reduce ? since : -1); gl!.uniform1f(u.zoom, s.zoom);
      gl!.uniform1f(u.wide, innerWidth / innerHeight > 0.85 ? 1 : 0);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      // text card tilts a little with the camera
      const tilt = document.querySelector<HTMLElement>("[data-tilt]");
      if (tilt && !s.reduce) tilt.style.transform = `perspective(1000px) rotateY(${(s.cam[0] / CAM_X) * 4}deg) rotateX(${(-s.cam[1] / CAM_Y) * 2.5}deg)`;
      // hint dot and the keyboard button follow the dome
      const [hx, hy] = toScreen(HOT[0], HOT[1]);
      if (hintEl.current) hintEl.current.style.transform = `translate(${hx}px, ${hy}px)`;
      const [ax, ay] = toScreen(0.08, 0.42), [bx, by] = toScreen(0.62, 0.95);
      const box = `${Math.round(ax)},${Math.round(ay)},${Math.round(bx - ax)},${Math.round(by - ay)}`;
      if (btnEl.current && box !== lastBtn) { lastBtn = box; Object.assign(btnEl.current.style, { left: `${Math.max(0, ax)}px`, top: `${ay}px`, width: `${bx - Math.max(0, ax)}px`, height: `${by - ay}px` }); }
      if (cardEl.current && innerWidth / innerHeight > 0.85) cardEl.current.style.right = `${Math.max(16, innerWidth - toScreen(0.05, 0.6)[0] + 24)}px`;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); cleanup(); removeEventListener("resize", size); el.removeEventListener("webglcontextlost", onLost);
      textures.forEach((x) => gl!.deleteTexture(x)); gl!.deleteProgram(prog); gl!.deleteBuffer(buf);
      gl!.getExtension("WEBGL_lose_context")?.loseContext(); gl = null;
    };
  }, [mounted, openAt, close]);

  if (!mounted) return null;
  return createPortal(
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[rgb(var(--c-paper))]">
        <img src="/hero/blur.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        {failed
          ? <img src="/hero/photo.jpg" alt="" className={`absolute inset-0 h-full w-full ${wide ? "object-contain object-right" : "object-cover object-[25%_50%]"}`} />
          : <canvas ref={canvas} className={`absolute inset-0 h-full w-full transition-opacity duration-[1200ms] ${ready ? "opacity-100" : "opacity-0"}`} />}
        <div className="dome-scrim absolute inset-0" />
      </div>
      <button ref={btnEl} type="button" aria-label={t("dome.open")} onClick={(e) => { e.stopPropagation(); open ? close() : openAt(DOME_C); }}
        className="pointer-events-none fixed z-0 rounded-[45%] opacity-0 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-focus" style={{ left: 0, top: 0, width: 0, height: 0 }} />
      {hint && ready && !open && (
        <div ref={hintEl} aria-hidden className="pointer-events-none fixed left-0 top-0 z-0">
          <span className="dome-hint relative block h-2 w-2 -translate-x-1 -translate-y-1 rounded-full bg-white" />
          <span className="mt-2 block -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-2.5 py-1 font-display text-sm font-semibold text-white backdrop-blur">{t("dome.hint")}</span>
        </div>
      )}
      <div ref={cardEl} role="dialog" aria-modal="false" aria-labelledby="dome-title" aria-hidden={!open} data-ui
        className={`dome-card glass-panel fixed z-50 rounded-[20px] p-5 shadow-2xl ${wide ? "top-1/2 w-[min(22rem,40vw)]" : "inset-x-3 bottom-3"} ${open ? "is-open" : "pointer-events-none"}`}>
        <p className="font-display text-sm font-semibold text-mute">{t("dome.eyebrow")}</p>
        <h2 id="dome-title" className="mt-1 text-3xl font-bold">{t("dome.title")}</h2>
        <p className="mt-2 text-base text-ink/85">{t("dome.line")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/rooms?building=C" className="btn" tabIndex={open ? 0 : -1}>{t("dome.way")}</Link>
          <button type="button" className="btn btn-quiet" tabIndex={open ? 0 : -1} onClick={close}>{t("dome.close")}</button>
        </div>
      </div>
    </>,
    document.body,
  );
}
