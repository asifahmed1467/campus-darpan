"use client";
import dynamic from "next/dynamic";
import { useState } from "react";

const BuildingRoute = dynamic(() => import("./BuildingRoute"), {
  ssr: false,
  loading: () => <div className="skeleton mt-4 h-[360px] rounded-2xl" aria-label="Loading the 3D route" />,
});

type Info = { ok?: boolean; building?: string; wing?: string | null; floor?: number | null; room?: string | null; code?: string; seat?: string | null };

/** "Show me the way" for D Building North/South rooms: opens the 3D walk from the main door to the room. */
export function canRoute(i?: Info | null): boolean {
  return !!(i?.ok && i.building === "D" && (i.wing === "North side" || i.wing === "South side") && i.floor != null && i.room && /^\d+$/.test(i.room));
}

export default function RouteButton({ info, tone = "light" }: { info: Info; tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  if (!canRoute(info)) return null;
  const lab = /^D[NS]\d{3}$/i.test((info.code ?? "").replace(/[\s-]/g, ""));
  return (
    <div className="w-full">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`btn !min-h-[48px] w-full sm:w-auto ${tone === "dark" ? "border border-white/40 bg-transparent text-white hover:bg-white/10" : "btn-quiet"}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13 4a1 1 0 1 0 2 0a1 1 0 1 0-2 0M7 21l3-4M16 21l-2-4l-3-3l1-6M6 12l2-3l4-1l3 3l3 1" /></svg>
        {open ? "Hide the route" : "Show me the way"}
      </button>
      {open && <div className="text-ink"><BuildingRoute side={info.wing === "South side" ? "S" : "N"} floor={info.floor as number} room={info.room as string} lab={lab} desk={info.seat ?? null} /></div>}
    </div>
  );
}
