"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CourseListItem } from "@/lib/course-types";
import {
  courseCardTypeLabel,
  formatCourseDuration,
  parseCourseExtra,
  parseCourseTeachers
} from "@/lib/content-meta";
import { formatINRFromPaise } from "@/lib/money";

import {
  CONTENT_CARD_HEIGHT,
  CONTENT_CARD_IMAGE_BAND,
  CONTENT_CARD_PANEL_BG
} from "./content-card-layout";
import { InstructorAvatars } from "./InstructorAvatars";

type Props = { course: CourseListItem; compact?: boolean };

function prettyDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function CourseCard({ course, compact = false }: Props) {
  const extra = parseCourseExtra(course.extra);
  const teachers = parseCourseTeachers(extra);
  const teacherNames = teachers.map((t) => t.name);
  const s = prettyDate(extra.startDate);
  const e = prettyDate(extra.endDate);
  const dateRange = s && e && s !== e ? `${s} – ${e}` : s ?? null;
  const duration = formatCourseDuration(extra);
  const tagLabel = courseCardTypeLabel(extra);
  const subtitle = course.shortDescription?.trim() || null;
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
      className={`group flex ${CONTENT_CARD_HEIGHT} w-full flex-col overflow-hidden rounded-xl shadow-card transition-shadow duration-300 hover:shadow-card-hover`}
      style={{
        opacity: 0,
        transform: "translateY(24px)",
        transition:
          "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease"
      }}
    >
      <div className={`relative ${CONTENT_CARD_IMAGE_BAND} shrink-0 overflow-hidden bg-[#EDE4D3]`}>
        <span className="absolute left-3 top-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center rounded-full border border-white/70 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-ink shadow-sm backdrop-blur-sm">
          {tagLabel}
        </span>
        {course.imageUrl ? (
          <img
            src={course.imageUrl}
            alt=""
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-brand-forest transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
      </div>

      <div
        className="relative flex min-h-0 flex-1 flex-col text-white"
        style={{ background: CONTENT_CARD_PANEL_BG }}
      >
        <InstructorAvatars
          seam
          people={teachers}
          className="absolute -top-[25px] left-3 z-10 sm:left-4"
        />

        {/* Never overflow-y:auto here — nested scroll traps page scroll on mobile. */}
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-2 pt-9 sm:px-5">
          <h3
            className={`font-serif font-semibold leading-snug text-white ${
              compact
                ? "line-clamp-2 text-[1.05rem] sm:text-[1.15rem]"
                : "line-clamp-2 text-[1.1rem] sm:text-[1.2rem]"
            }`}
          >
            {course.title}
          </h3>

          {subtitle ? (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-white/85 sm:text-[13px]">
              {subtitle}
            </p>
          ) : null}

          <div className="mt-4 min-w-0 space-y-1.5 border-l-[3px] border-white pl-3">
            {teacherNames.length ? (
              <p className="line-clamp-2 text-[13px] leading-snug text-white sm:text-[14px]">
                {teacherNames.join(", ")}
              </p>
            ) : null}
            {dateRange || duration ? (
              <p className="line-clamp-2 text-[13px] leading-snug text-white/90 sm:text-[14px]">
                {[dateRange, duration].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-end justify-between gap-3 border-t border-white/15 px-4 pb-4 pt-3 sm:px-5">
          <p className="text-sm font-semibold tabular-nums text-white/95">
            {course.isFree || course.priceInPaise === 0 ? "Free" : formatINRFromPaise(course.priceInPaise)}
          </p>
          <span className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-sm bg-[#e87e04] px-5 text-sm font-medium uppercase tracking-wide text-white transition-colors group-hover:bg-[#d47103]">
            Explore
          </span>
        </div>
      </div>
    </Link>
  );
}
