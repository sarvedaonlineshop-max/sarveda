export const COURSE_TEACHERS_SECTION_ID = "about-the-teachers";

export function courseTeacherAnchor(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `course-teacher-${slug || "profile"}`;
}
