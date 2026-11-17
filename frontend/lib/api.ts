export const API = process.env.NEXT_PUBLIC_API_BASE ?? "";
const TOKEN_KEY = "aiub_admin_token";

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

export const adminToken = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

/** ?at=2026-11-15T10:30 in the page address pretends it is that time (demo/testing; the server ignores it in production). */
function withAt(path: string): string {
  if (typeof window === "undefined" || path.includes("at=")) return path;
  const at = new URLSearchParams(window.location.search).get("at");
  return at ? path + (path.includes("?") ? "&" : "?") + "at=" + encodeURIComponent(at) : path;
}

export async function api<T>(path: string, init: RequestInit & { admin?: boolean; json?: unknown } = {}): Promise<T> {
  const { admin, json, headers, ...rest } = init;
  const h: Record<string, string> = { ...(headers as Record<string, string>) };
  if (json !== undefined) h["Content-Type"] = "application/json";
  if (admin) { const t = adminToken.get(); if (t) h["Authorization"] = `Bearer ${t}`; }
  const vid = visitorId();
  if (vid) h["X-Visitor"] = vid;
  const isGet = !rest.method || rest.method === "GET";
  let res: Response;
  try {
    res = await fetch(API + (isGet ? withAt(path) : path), { ...rest, headers: h, body: json !== undefined ? JSON.stringify(json) : rest.body });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = (await res.json()).detail; } catch { /* not json */ }
    const msg = typeof detail === "string" ? detail
      : res.status === 429 ? "Too many requests. Wait a moment and try again."
      : res.status === 401 ? "Please log in again."
      : (detail as { message?: string })?.message || `Something went wrong (${res.status}).`;
    throw new ApiError(res.status, msg, detail);
  }
  return res.json() as Promise<T>;
}

export function visitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let v = localStorage.getItem("aiub_vid");
    if (!v) {
      v = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 36);
      localStorage.setItem("aiub_vid", v);
    }
    return v;
  } catch {
    return "";
  }
}

/** "2026-11-15T10:30:00+06:00" -> minutes since midnight (the server already sends Dhaka time) */
export function minutesOf(iso: string): number {
  return parseInt(iso.slice(11, 13), 10) * 60 + parseInt(iso.slice(14, 16), 10);
}

export function fmtMin(m: number, lang: "en" | "bn" = "en"): string {
  const h = Math.floor(m / 60), mi = m % 60;
  const nf = new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en", { useGrouping: false, minimumIntegerDigits: 1 });
  const nf2 = new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en", { useGrouping: false, minimumIntegerDigits: 2 });
  return `${nf.format(h % 12 || 12)}:${nf2.format(mi)} ${h < 12 ? "AM" : "PM"}`;
}

export function dayName(iso: string, lang: "en" | "bn" = "en"): string {
  return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US", { weekday: "long" });
}
