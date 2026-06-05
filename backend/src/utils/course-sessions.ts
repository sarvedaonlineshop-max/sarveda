function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export type CourseLayoutTemplate = "STANDARD" | "SESSIONS" | "CURRICULUM";

export type CourseSession = {
  sessionId: string;
  name: string;
  mentorId?: string | null;
  teacherName?: string | null;
  content: string;
  scheduledAt?: string | null;
  scheduleNote?: string | null;
};

export type CourseCurriculumModule = {
  name: string;
  hours?: number | null;
  priceInr?: number | null;
  priceUsd?: number | null;
  startDate?: string | null;
  endDate?: string | null;
};

export function detectLayoutTemplate(input: {
  sessionCount: number;
  curriculumCount: number;
}): CourseLayoutTemplate {
  if (input.sessionCount >= 2) return "SESSIONS";
  if (input.curriculumCount >= 2) return "CURRICULUM";
  return "STANDARD";
}

export function parseSessionsFromHtml(html: string): CourseSession[] {
  if (!html?.trim()) return [];

  const sessions: CourseSession[] = [];
  const re = /<h3[^>]*>\s*Session\s+(\d+)\s*:\s*([^<]+)<\/h3>/gi;
  const headers: Array<{ sessionId: string; name: string; end: number; next: number }> = [];
  let m: RegExpExecArray | null;
  const matches: RegExpExecArray[] = [];
  while ((m = re.exec(html))) matches.push(m);

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const end = match.index + match[0].length;
    const next = matches[i + 1]?.index ?? html.length;
    const block = html.slice(end, next).trim();

    let teacherName: string | null = null;
    let contentStart = 0;
    const byMatch = block.match(/^\s*(?:<p[^>]*>)?\s*By\s+([^<\n]+)/i);
    if (byMatch) {
      teacherName = byMatch[1]!.replace(/<[^>]+>/g, "").trim();
      contentStart = byMatch[0].length;
    } else {
      const plainTeacher = block.match(/^\s*([A-Za-z][A-Za-z.\s&]{1,48})\s*(?:\n|<)/);
      if (plainTeacher && !plainTeacher[1]!.toLowerCase().startsWith("an ")) {
        teacherName = plainTeacher[1]!.trim();
        contentStart = plainTeacher[0].length;
      }
    }

    sessions.push({
      sessionId: match[1]!.trim(),
      name: decodeHtmlEntities(match[2]!.trim()),
      teacherName,
      content: block.slice(contentStart).trim(),
      scheduledAt: null,
      scheduleNote: null
    });
  }

  return sessions;
}

export function parseSessionScheduleLines(text: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!text?.trim()) return map;
  const re =
    /Session\s+(\d+)\s*[–-]\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?,?\s*([^\n<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    map.set(parseInt(m[1]!, 10), m[0]!.replace(/\s+/g, " ").trim());
  }
  return map;
}

export function applySessionSchedules(
  sessions: CourseSession[],
  scheduleText: string | null | undefined
): CourseSession[] {
  if (!scheduleText?.trim()) return sessions;
  const lines = parseSessionScheduleLines(scheduleText);
  return sessions.map((s) => {
    const note = lines.get(parseInt(s.sessionId, 10));
    return note ? { ...s, scheduleNote: note } : s;
  });
}

export function parseCurriculumFromMeta(
  meta: Record<string, string | undefined>
): CourseCurriculumModule[] {
  const modules: CourseCurriculumModule[] = [];
  for (let i = 0; i < 20; i++) {
    const name = meta[`curriculum_${i}_topic_name`]?.trim();
    if (!name) continue;
    const hoursRaw = meta[`curriculum_${i}_no_of_hours`];
    const inrRaw = meta[`curriculum_${i}_cost_in_inr`];
    const usdRaw = meta[`curriculum_${i}_cost_in_usd`];
    modules.push({
      name,
      hours: hoursRaw ? parseFloat(hoursRaw) || null : null,
      priceInr: inrRaw ? parseInt(inrRaw.replace(/[^\d]/g, ""), 10) || null : null,
      priceUsd: usdRaw ? parseFloat(usdRaw.replace(/,/g, "")) || null : null,
      startDate: meta[`curriculum_${i}_topic_start_date`]?.trim() || null,
      endDate: meta[`curriculum_${i}_topic_end_date`]?.trim() || null
    });
  }
  return modules;
}
