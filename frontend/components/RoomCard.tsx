import Link from "next/link";
import type { Profile } from "@/lib/types";

const firstName = (n: string) => n.replace(/^(dr|prof|mr|ms|mrs|md)\.?\s+/i, "").split(/\s+/)[0];

/** The office room, big enough to read from across the corridor. */
export function RoomCard({ p }: { p: Profile }) {
  const classRooms = Array.from(new Set(p.week.flatMap((d) => d.slots).filter((s) => s.type === "CLASS" && s.room).map((s) => s.room as string)));
  const code = p.room ? [p.building, p.room].filter(Boolean).join(" ") : null;
  const ri = p.room_info;
  return (
    <section aria-labelledby="rm" className="rise mt-6 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 rounded-2xl border-2 border-edge bg-inverse p-5 text-white shadow-[6px_6px_0_0_rgb(var(--c-shadow))] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:p-6" style={{ ["--i" as string]: 1 }}>
      <svg aria-hidden width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pin shrink-0 self-start text-needle sm:h-11 sm:w-11">
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.6" />
      </svg>
      <div className="min-w-0">
        <h2 id="rm" className="font-display text-base font-semibold text-white/75">{firstName(p.name)}&apos;s office room</h2>
        {code ? (
          <>
            <p className="room-num font-display break-words text-4xl font-extrabold leading-[1.05] tracking-tight min-[400px]:text-5xl sm:text-6xl lg:text-7xl">{code}</p>
            {ri?.ok && (ri.building_name || ri.floor_label) && (
              <p className="mt-2 text-xl font-semibold text-white/90">{[ri.building_name, ri.wing, ri.floor_label].filter(Boolean).join(", ")}</p>
            )}
          </>
        ) : (
          <>
            <p className="font-display text-3xl font-bold leading-tight sm:text-4xl">Room not listed yet</p>
            <p className="mt-1 text-white/80">It is added once this teacher&apos;s consultation hours are uploaded, or by an admin.</p>
          </>
        )}
        {classRooms.length > 0 && (
          <p className="mt-3 text-lg text-white/85">Classes in <span className="font-display font-bold">{classRooms.join(", ")}</span></p>
        )}
      </div>
      {p.room && ri?.ok && (
        <Link href={`/rooms?code=${encodeURIComponent(p.room)}`} className="btn col-span-2 !min-h-[52px] w-full bg-white !px-5 text-lg text-brand hover:bg-needle sm:col-span-1 sm:w-auto">Show on map</Link>
      )}
    </section>
  );
}

/** Small room badge for lists. */
export function RoomBadge({ room, building }: { room: string | null; building?: string | null }) {
  if (!room) return null;
  return <span className="inline-flex items-center gap-1 rounded-md bg-inverse px-2 py-0.5 font-display text-base font-bold text-white">{[building, room].filter(Boolean).join(" ")}</span>;
}
