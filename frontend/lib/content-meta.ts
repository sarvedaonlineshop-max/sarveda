import type { CourseListItem } from "./course-types";
import type { EventListItem } from "./event-types";
import type {
  CourseCurriculumModule,
  CourseLayoutTemplate,
  CourseSession
} from "./course-sessions";

export type CourseTeacher = {
  name: string;
  bio?: string | null;
  imageUrl?: string | null;
  designation?: string | null;
};

export type CourseScheduleRow = {
  startDate?: string | null;
  endDate?: string | null;
  mode?: string | null;
  location?: string | null;
  timings?: string | null;
  duration?: string | null;
};

export type CourseExtra = {
  startDate?: string | null;
  endDate?: string | null;
  duration?: string | null;
  durationHours?: number | null;
  layoutTemplate?: CourseLayoutTemplate;
  mentorIds?: string[];
  sessions?: CourseSession[];
  curriculum?: CourseCurriculumModule[];
  mode?: string | null;
  venue?: string | null;
  timings?: string | null;
  courseIncludes?: string | null;
  aboutTheCourse?: string | null;
  /** Synced from mentors on save; legacy import may use string[] only. */
  teachers?: string[] | CourseTeacher[];
  schedule?: CourseScheduleRow[];
  videoLink?: string | null;
  seoKeyword?: string | null;
  faqs?: Array<{ question: string; answer: string }>;
};

export function parseCourseSessions(extra: CourseExtra): CourseSession[] {
  if (!Array.isArray(extra.sessions)) return [];
  return extra.sessions.filter((s) => s.name?.trim());
}

export function courseDurationHours(extra: CourseExtra): number | null {
  if (typeof extra.durationHours === "number" && extra.durationHours > 0) {
    return extra.durationHours;
  }
  const raw = extra.duration?.trim();
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatCourseDuration(extra: CourseExtra): string | null {
  const hours = courseDurationHours(extra);
  if (hours == null) return extra.duration?.trim() || null;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function parseCourseExtra(extra: CourseListItem["extra"]): CourseExtra {
  if (!extra || typeof extra !== "object") return {};
  return extra as CourseExtra;
}

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** End of calendar day in IST — a course stays active through the full local day. */
function endOfIstCalendarDay(raw: string): Date | null {
  const trimmed = raw.trim();
  const match = ISO_DATE_ONLY.exec(trimmed);
  if (match) {
    const [, y, mo, d] = match;
    return new Date(`${y}-${mo}-${d}T23:59:59.999+05:30`);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDisplayDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const match = ISO_DATE_ONLY.exec(trimmed);
  if (match) {
    const [, y, mo, d] = match;
    return new Date(`${y}-${mo}-${d}T12:00:00+05:30`);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function latestDateRaw(candidates: string[]): string | null {
  let bestRaw: string | null = null;
  let bestTime = 0;
  for (const raw of candidates) {
    const boundary = endOfIstCalendarDay(raw);
    const time = boundary?.getTime() ?? 0;
    if (time > bestTime) {
      bestTime = time;
      bestRaw = raw;
    }
  }
  return bestRaw;
}

function collectCourseDateStrings(extra: CourseExtra): {
  endRaw: string | null;
  startRaw: string | null;
} {
  const endCandidates: string[] = [];
  const startCandidates: string[] = [];

  const push = (start?: string | null, end?: string | null) => {
    if (start?.trim()) startCandidates.push(start.trim());
    if (end?.trim()) endCandidates.push(end.trim());
  };

  push(extra.startDate, extra.endDate);
  for (const row of parseCourseSchedule(extra)) {
    push(row.startDate, row.endDate);
  }
  for (const mod of extra.curriculum ?? []) {
    push(mod.startDate, mod.endDate);
  }

  return {
    endRaw: latestDateRaw(endCandidates),
    startRaw: latestDateRaw(startCandidates)
  };
}

/** Reference date for upcoming vs past — latest end date if any, else latest start. */
export function courseScheduleDate(extra: CourseExtra): Date | null {
  const { endRaw, startRaw } = collectCourseDateStrings(extra);
  const raw = endRaw ?? startRaw;
  if (!raw) return null;
  return endOfIstCalendarDay(raw) ?? parseDisplayDate(raw);
}

export function isCourseUpcoming(course: CourseListItem, now = new Date()): boolean {
  const extra = parseCourseExtra(course.extra);
  const ref = courseScheduleDate(extra);
  if (!ref) return false;
  return ref >= now;
}

export function formatCourseDateRange(extra: CourseExtra): string | null {
  const start = parseDisplayDate(extra.startDate);
  const end = parseDisplayDate(extra.endDate);
  if (start && end) {
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
    return `${fmt(start)} - ${fmt(end)}`;
  }
  if (start) {
    return start.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  }
  return null;
}

/** Normalized teacher list (supports legacy string[] from import). */
export function parseCourseTeachers(extra: CourseExtra): CourseTeacher[] {
  const raw = extra.teachers;
  if (!raw?.length) return [];

  if (typeof raw[0] === "string") {
    return (raw as string[])
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  }

  return (raw as CourseTeacher[])
    .map((t) => ({
      name: (t.name ?? "").trim(),
      bio: t.bio?.trim() || null,
      imageUrl: t.imageUrl?.trim() || null,
      designation: t.designation?.trim() || null
    }))
    .filter((t) => t.name);
}

export function parseCourseSchedule(extra: CourseExtra): CourseScheduleRow[] {
  const rows = extra.schedule;
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) =>
    Boolean(
      r.startDate?.trim() ||
        r.endDate?.trim() ||
        r.mode?.trim() ||
        r.location?.trim() ||
        r.timings?.trim() ||
        r.duration?.trim()
    )
  );
}

export function courseTeachers(extra: CourseExtra): string[] {
  return parseCourseTeachers(extra).map((t) => t.name);
}

export function isEventUpcoming(event: EventListItem, now = new Date()): boolean {
  const start = new Date(event.startDate);
  return !Number.isNaN(start.getTime()) && start >= now;
}

export function eventTypeLabel(event: EventListItem): string {
  if (event.isOnline) {
    const v = event.venue?.toLowerCase() ?? "";
    if (v.includes("webinar")) return "Live Webinar Online";
    return "Online Event";
  }
  if (event.venue?.toLowerCase().includes("retreat")) return "Weekend Retreat";
  return event.venue?.trim() || "Live";
}

export function formatEventCardWhen(event: EventListItem): string {
  const start = new Date(event.startDate);
  if (Number.isNaN(start.getTime())) return "";
  const time = start.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  });
  const date = start.toLocaleDateString("en-IN", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  return `${time}\n${date}`;
}

export function splitCourses(courses: CourseListItem[]) {
  const upcoming = courses
    .filter((c) => isCourseUpcoming(c))
    .sort((a, b) => {
      const da = courseScheduleDate(parseCourseExtra(a.extra))?.getTime() ?? 0;
      const db = courseScheduleDate(parseCourseExtra(b.extra))?.getTime() ?? 0;
      return da - db;
    });
  const past = courses.filter((c) => !isCourseUpcoming(c));
  return { upcoming, past };
}

export function splitEvents(events: EventListItem[]) {
  const upcoming = events
    .filter((e) => isEventUpcoming(e))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const past = events
    .filter((e) => !isEventUpcoming(e))
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  return { upcoming, past };
}
