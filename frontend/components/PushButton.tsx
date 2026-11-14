"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type State = "loading" | "unsupported" | "off-site" | "blocked" | "ready" | "on";

const b64ToBytes = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function currentEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}

/** "Notify me" switch for browser push. Anonymous: nothing about the student is stored. */
export default function PushButton() {
  const [state, setState] = useState<State>("loading");
  const [topics, setTopics] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    try {
      const k = await api<{ enabled: boolean; topics: string[] }>("/api/push/key");
      setTopics(k.topics);
      if (!k.enabled) { setState("off-site"); return; }
      if (Notification.permission === "denied") { setState("blocked"); return; }
      const ep = await currentEndpoint();
      if (ep) {
        const s = await api<{ subscribed: boolean; tags: string[] }>("/api/push/status", { method: "POST", json: { endpoint: ep } });
        setChosen(s.tags);
        setState(s.subscribed ? "on" : "ready");
      } else setState("ready");
    } catch { setState("unsupported"); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = async (tags: string[]) => {
    setBusy(true); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "ready"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { key } = await api<{ key: string }>("/api/push/key");
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      const j = sub.toJSON();
      await api("/api/push/subscribe", { method: "POST", json: { endpoint: sub.endpoint, keys: j.keys, tags } });
      setChosen(tags); setState("on");
    } catch (e) { setMsg((e as Error).message || "Could not turn notifications on."); }
    finally { setBusy(false); }
  };

  const unsubscribe = async () => {
    setBusy(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await api("/api/push/unsubscribe", { method: "POST", json: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
      setState("ready");
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggleTopic = (t: string) => subscribe(chosen.includes(t) ? chosen.filter((x) => x !== t) : [...chosen, t]);

  if (state === "loading" || state === "off-site") return null;
  if (state === "unsupported") return <p className="mt-4 text-[15px] text-mute">This browser can't show notifications. On iPhone, add the site to your Home Screen first, then open it from there.</p>;
  if (state === "blocked") return <p className="mt-4 text-[15px] text-mute">Notifications are blocked for this site. Allow them in your browser's site settings, then reload.</p>;
  return (
    <div className="mt-4 rounded-xl border border-line bg-sheet p-4">
      {state === "ready" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy} onClick={() => subscribe([])}>Notify me about new notices</button>
          <span className="text-[15px] text-mute">A phone or laptop alert when AIUB posts something. No account needed.</span>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display font-semibold"><span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-go" />Notifications are on for this device</p>
            <button className="chip" disabled={busy} onClick={unsubscribe}>Turn off</button>
          </div>
          <p className="mt-2 text-[15px] text-mute">{chosen.length ? "You get notices about the topics selected below." : "You get every notice. Pick topics to hear about fewer."}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Notification topics">
            {topics.map((t) => <button key={t} className="chip" aria-pressed={chosen.includes(t)} disabled={busy} onClick={() => toggleTopic(t)}>{t}</button>)}
          </div>
        </div>
      )}
      {msg && <p role="alert" className="mt-2 text-busy">{msg}</p>}
    </div>
  );
}
