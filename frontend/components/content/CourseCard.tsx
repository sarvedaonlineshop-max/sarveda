"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CourseListItem } from "@/lib/course-types";
import { formatCourseDuration, parseCourseExtra, parseCourseTeachers } from "@/lib/content-meta";
import { formatINRFromPaise } from "@/lib/money";

import { InstructorAvatars } from "./InstructorAvatars";

type Props = { course: CourseListItem; compact?: boolean };

function prettyDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function CourseCard({ course }: Props) {
  const extra = parseCourseExtra(course.extra);
  const teachers = parseCourseTeachers(extra);
  const teacherNames = teachers.map((t) => t.name);
  const s = prettyDate(extra.startDate);
  const e = prettyDate(extra.endDate);
  const dateRange = s && e && s !== e ? `${s} – ${e}` : s ?? null;
  const duration = formatCourseDuration(extra);
  const tagLabel = duration?.trim() || "Course";
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Link
      ref={ref}
      href={`/course/${course.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl shadow-card transition-shadow duration-300 hover:shadow-card-hover"
      style={{
        opacity: 0,
        transform: "translateY(24px)",
        transition:
          "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease"
      }}
    >
      <div className="relative overflow-hidden bg-[#EDE4D3]">
        <span className="absolute left-3 top-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center rounded-full border border-brand-gold/70 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-ink shadow-sm backdrop-blur-sm">
          {tagLabel}
        </span>
        {course.imageUrl ? (
          <img
            src={course.imageUrl}
            alt={course.title}
            className="block h-auto w-full object-contain object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="aspect-[4/5] bg-brand-forest transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col bg-[#2d7ac2] px-4 pb-5 pt-6 text-white">
        <InstructorAvatars
          seam
          people={teachers}
          className="absolute -top-[25px] right-2.5 z-10"
        />
        <h3 className="font-serif text-[1.35rem] font-semibold leading-snug text-white">
          {course.title}
        </h3>

        <div className="mt-4 flex flex-1 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 border-l-4 border-white pl-3">
            {teacherNames.map((name) => (
              <p key={name} className="text-[15px] leading-snug text-white">
                {name}
              </p>
            ))}
            {dateRange ? <p className="mt-1 text-[15px] text-white/90">{dateRange}</p> : null}
            {duration ? <p className="text-[15px] text-white">{duration}</p> : null}
          </div>
          <span className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-sm bg-[#e87e04] px-6 text-sm font-medium uppercase tracking-wide text-white transition-colors group-hover:bg-[#d47103]">
            Explore
          </span>
        </div>

        <p className="mt-3 text-sm font-semibold tabular-nums text-white/95">
          {course.isFree || course.priceInPaise === 0 ? "Free" : formatINRFromPaise(course.priceInPaise)}
        </p>
      </div>
    </Link>
  );
}
