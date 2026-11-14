"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import FacultyRow, { RowSkeleton } from "@/components/FacultyRow";
import { api } from "@/lib/api";
import { useDebounced, useLive } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
import type { Faculty, Meta } from "@/lib/types";

function FacultyList() {
  const { t } = useLang();
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q, 200);
  const code = sp.get("faculty") ?? "";
  const [freeOnly, setFreeOnly] = useState(false);
  const [limit, setLimit] = useState(24);
  const meta = useLive(() => api<Meta>("/api/meta"), [], 300_000);

  useEffect(() => setLimit(24), [dq, code, freeOnly]);
  const res = useLive(() => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (dq.trim()) p.set("q", dq.trim());
    if (code) p.set("faculty", code);
    if (freeOnly) p.set("status", "available");
    return api<{ items: Faculty[]; total: number }>(`/api/faculty?${p}`);
  }, [dq, code, freeOnly, limit]);

  const setCode = (c: string) => { const p = new URLSearchParams(sp.toString()); c ? p.set("faculty", c) : p.delete("faculty"); router.replace(`/faculty?${p}`); };
  const codes = Object.keys(meta.data?.by_faculty ?? {}).filter((c) => c !== "Other").sort();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold sm:text-5xl">{t("faculty.title")}</h1>
      <p className="mt-2 text-mute">{meta.data ? `${meta.data.faculty_total} teachers, ${meta.data.with_tsf} with schedules` : " "}</p>
      <div className="mt-6">
        <label htmlFor="fq" className="sr-only">Search faculty</label>
        <input id="fq" className="field font-display !text-lg" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search.placeholder")} autoComplete="off" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filters">
        <button className="chip" aria-pressed={!code} onClick={() => setCode("")}>{t("all")}</button>
        {codes.map((c) => <button key={c} className="chip" aria-pressed={code === c} onClick={() => setCode(c)}>{c}</button>)}
        <button className="chip ml-auto" aria-pressed={freeOnly} onClick={() => setFreeOnly((v) => !v)}>{t("free_only")}</button>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-sheet p-1.5">
        {res.loading && !res.data ? <RowSkeleton n={5} /> : res.error && !res.data ? (
          <div className="p-5"><p className="text-busy">{res.error}</p><button className="btn btn-quiet mt-3" onClick={res.reload}>Try again</button></div>
        ) : res.data && res.data.items.length ? (
          <ul>{res.data.items.map((f) => <FacultyRow key={f.id} f={f} />)}</ul>
        ) : (
          <p className="p-5 text-mute">{freeOnly ? "Nobody is in a consultation hour or free between classes right now. Turn off “Free now only” to see everyone." : dq ? `No teacher matches “${dq}”. Check the spelling or clear the filters.` : "No teachers have been added yet."}</p>
        )}
      </div>
      {res.data && res.data.total > limit && (
        <div className="mt-5 text-center"><button className="btn btn-quiet" onClick={() => setLimit((l) => l + 24)}>Show more ({res.data.total - limit} left)</button></div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<RowSkeleton n={5} />}><FacultyList /></Suspense>;
}
