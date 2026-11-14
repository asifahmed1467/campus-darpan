"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminToken, api } from "@/lib/api";

export default function AdminLogin() {
  const router = useRouter();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await api<{ token: string }>("/api/admin/login", { method: "POST", json: { username: u.trim().toLowerCase(), password: p } });
      adminToken.set(r.token);
      router.replace("/admin");
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="text-4xl font-bold">Admin login</h1>
      <p className="mt-2 text-mute">For ক্যাম্পাসদর্পণ admins only. Students don't need an account.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div><label htmlFor="u" className="mb-1 block font-display font-semibold">Username</label>
          <input id="u" className="field" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required autoFocus /></div>
        <div><label htmlFor="p" className="mb-1 block font-display font-semibold">Password</label>
          <input id="p" className="field" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></div>
        {err && <p role="alert" className="text-busy">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Checking…" : "Log in"}</button>
      </form>
    </div>
  );
}
