import type { CourseListItem } from "./course-types";
import type { EventListItem } from "./event-types";

export type CourseExtra = {
  startDate?: string | null;
  endDate?: string | null;
  duration?: string | null;
  teachers?: string[];
  videoLink?: string | null;
  seoKeyword?: string | null;
};

export function parseCourseExtra(extra: CourseListItem["extra"]): CourseExtra {
  if (!extra || typeof extra !== "object") return {};
  return extra as CourseExtra;
}

function parseLooseDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Reference date for upcoming vs past — end date if set, else start. */
export function courseScheduleDate(extra: CourseExtra): Date | null {
  return parseLooseDate(extra.endDate) ?? parseLooseDate(extra.startDate);
}

export function isCourseUpcoming(course: CourseListItem, now = new Date()): boolean {
  const extra = parseCourseExtra(course.extra);
  const ref = courseScheduleDate(extra);
  if (!ref) return false;
  return ref >= now;
}

export function formatCourseDateRange(extra: CourseExtra): string | null {
  const start = parseLooseDate(extra.startDate);
  const end = parseLooseDate(extra.endDate);
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

export function courseTeachers(extra: CourseExtra): string[] {
  return extra.teachers?.filter(Boolean) ?? [];
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
