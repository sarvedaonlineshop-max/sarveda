"use client";

import { useState } from "react";

import type { CourseTeacher } from "@/lib/content-meta";
import { COURSE_TEACHERS_SECTION_ID, courseTeacherAnchor } from "@/lib/course-teacher-anchor";

function bioExcerpt(bio?: string | null): string {
  const text = (bio ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).trim()}…`;
}

function scrollToTeacher(name: string) {
  const target =
    document.getElementById(courseTeacherAnchor(name)) ??
    document.getElementById(COURSE_TEACHERS_SECTION_ID);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function CourseFacilitatorNames({ teachers }: { teachers: CourseTeacher[] }) {
  const [openName, setOpenName] = useState<string | null>(null);
  const list = teachers.filter((teacher) => teacher.name.trim());
  if (list.length === 0) return null;

  return (
    <span className="inline">
      {list.map((teacher, index) => {
        const excerpt = bioExcerpt(teacher.bio);
        const open = openName === teacher.name;
        return (
          <span
            key={`${teacher.name}-${index}`}
            className={`relative inline-block ${open ? "z-30" : ""}`}
            onMouseEnter={() => setOpenName(teacher.name)}
            onMouseLeave={() => setOpenName(null)}
            onFocus={() => setOpenName(teacher.name)}
            onBlur={() => setOpenName(null)}
          >
            <button
              type="button"
              onClick={() => scrollToTeacher(teacher.name)}
              className="font-bold underline decoration-1 underline-offset-[3px]"
              style={{ color: "var(--brand-forest)" }}
            >
              {teacher.name}
            </button>
            {index < list.length - 1 ? <span>, </span> : null}
            {open ? (
              <span
                className="absolute left-0 top-full z-40 mt-2 block w-[min(320px,78vw)] rounded-lg border border-stone-200 bg-white p-3 text-left shadow-xl"
                style={{ color: "var(--brand-ink)" }}
              >
                <span className="flex gap-3">
                  <span
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
                    style={{ background: "var(--brand-cream-dark)" }}
                  >
                    {teacher.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={teacher.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center font-serif text-xl font-semibold"
                        style={{ color: "var(--brand-forest)" }}
                      >
                        {teacher.name.charAt(0)}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold" style={{ color: "var(--brand-forest)" }}>
                      {teacher.name}
                    </span>
                    {teacher.designation ? (
                      <span className="mt-0.5 block text-xs font-medium" style={{ color: "var(--brand-gold)" }}>
                        {teacher.designation}
                      </span>
                    ) : null}
                    {excerpt ? (
                      <span className="mt-1 block text-xs leading-5 text-stone-600">{excerpt}</span>
                    ) : null}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => scrollToTeacher(teacher.name)}
                  className="mt-2 text-sm font-semibold underline underline-offset-2"
                  style={{ color: "var(--brand-forest)" }}
                >
                  Read more
                </button>
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
