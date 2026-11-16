export type StatusKey = "available" | "in_class" | "admin" | "unavailable" | "off" | "no_schedule";

export interface NextFree {
  date: string; day: string; start: number; end: number; start_label: string; end_label: string;
  minutes_until: number; when: string; room: string | null;
}

export interface Status {
  status: StatusKey;
  basis: "consultation" | "gap" | null;
  until: string | null;
  minutes_left: number | null;
  current: { type: string; course: string | null; section: string | null; room: string | null; label: string | null } | null;
  next: NextFree | null;
  reason: string | null;
  room: string | null;
  now: string; // local (Dhaka) ISO time from the server
}

export interface TodayBlock { start: number; end: number; type: string }

export interface Faculty {
  id: number; name: string; email: string | null; faculty_code: string | null; department: string | null;
  designation: string | null; room: string | null; building: string | null; photo_url: string | null;
  profile_url: string | null; has_tsf: boolean; today: TodayBlock[]; status: Status; message: string;
  room_info?: { ok: boolean; code?: string; building?: string; building_name?: string; wing?: string | null; seat?: string | null; section?: string | null; floor_label?: string | null; floor?: number | null; room?: string | null } | null;
}

export interface WeekSlot {
  start: string; end: string; start_label: string; end_label: string; type: string;
  course: string | null; section: string | null; room: string | null; label: string | null;
}
export interface WeekDay { day: string; slots: WeekSlot[] }
export interface Profile extends Faculty { semester: string | null; week: WeekDay[] }

export interface Suggestion {
  id: number; name: string; department: string | null; faculty_code: string | null; room: string | null;
  status: StatusKey; basis: string | null; until: string | null; next_when: string | null;
}

export interface Notice {
  id: number; title: string; url: string; date: string | null; summary: string | null; tags: string[];
  source: string; first_seen_at: string; attachment_url?: string | null;
}

export interface Meta {
  now: string; semester: string | null; semester_start: string | null; semester_end: string | null;
  upcoming_holidays: { date: string; name: string }[]; faculty_total: number; with_tsf: number;
  by_faculty: Record<string, number>;
}

export interface AskResult {
  sample?: boolean;
  ai?: boolean;
  general?: boolean;
  mode: string; answered: boolean; answer: string; faculty?: Faculty;
  sources: { title: string; url: string }[];
}
