type CourseScheduleRow = {
  startDate?: string | null;
  endDate?: string | null;
};

type CourseExtraLike = {
  startDate?: string | null;
  endDate?: string | null;
  schedule?: CourseScheduleRow[] | null;
  curriculum?: Array<{ startDate?: string | null; endDate?: string | null }> | null;
};

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** End of calendar day in IST — a course stays active through the full local day. */
export function endOfIstCalendarDay(raw: string): Date | null {
  const trimmed = raw.trim();
  const match = ISO_DATE_ONLY.exec(trimmed);
  if (match) {
    const [, y, mo, d] = match;
    return new Date(`${y}-${mo}-${d}T23:59:59.999+05:30`);
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

function collectCourseDateStrings(extra: CourseExtraLike): {
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

  for (const row of extra.schedule ?? []) {
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

/** Latest schedule boundary (end date preferred, else start) for upcoming vs past. */
export function courseScheduleBoundary(extra: unknown): Date | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const row = extra as CourseExtraLike;
  const { endRaw, startRaw } = collectCourseDateStrings(row);
  const raw = endRaw ?? startRaw;
  if (!raw) return null;
  return endOfIstCalendarDay(raw);
}

export function isCourseUpcomingExtra(extra: unknown, now = new Date()): boolean {
  const ref = courseScheduleBoundary(extra);
  if (!ref) return false;
  return ref >= now;
}
