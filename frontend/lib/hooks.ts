"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, visitorId } from "./api";

/** Load data now and again every `ms` (default 60 s) so "free now" never goes stale while a tab is open. */
export function useLive<T>(load: () => Promise<T>, deps: unknown[], ms = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef(load);
  ref.current = load;

  const reload = useCallback(async () => {
    try { setData(await ref.current()); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    const id = ms ? setInterval(() => { if (!document.hidden) reload(); }, ms) : undefined;
    const vis = () => { if (!document.hidden) reload(); };
    document.addEventListener("visibilitychange", vis);
    return () => { if (id) clearInterval(id); document.removeEventListener("visibilitychange", vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

/** Tell the server this (anonymous) tab is open. Returns how many students are online. */
export function useOnline(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const vid = visitorId();
    if (!vid) return;
    let stop = false;
    const beat = () => {
      if (document.hidden) return;
      api<{ online: number }>("/api/presence/heartbeat", { method: "POST", json: { vid } })
        .then((r) => !stop && setN(r.online)).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 30_000);
    const vis = () => { if (!document.hidden) beat(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return n;
}

/** Favourite teachers live in this browser only (no account needed). */
export function useFavs() {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    try { setIds(JSON.parse(localStorage.getItem("aiub_favs") || "[]")); } catch { /* ignore */ }
    const sync = () => { try { setIds(JSON.parse(localStorage.getItem("aiub_favs") || "[]")); } catch { /* ignore */ } };
    window.addEventListener("aiub:favs", sync);
    return () => window.removeEventListener("aiub:favs", sync);
  }, []);
  const toggle = useCallback((id: number) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("aiub_favs", JSON.stringify(next)); } catch { /* ignore */ }
      setTimeout(() => window.dispatchEvent(new Event("aiub:favs")), 0);
      return next;
    });
  }, []);
  return { ids, toggle, has: (id: number) => ids.includes(id) };
}
