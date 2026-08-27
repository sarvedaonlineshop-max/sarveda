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

import { InstructorAvatars } from "./InstructorAvatars";

type Props = { course: CourseListItem; compact?: boolean };

/** Fixed card height so carousel / grid rows stay even. */
const CONTENT_CARD_HEIGHT = "h-[36rem] sm:h-[38rem]";
const IMAGE_BAND = "h-[15.5rem] sm:h-[17rem]";

function prettyDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function plainText(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function courseExplanation(course: CourseListItem, aboutTheCourse?: string | null): string | null {
  return plainText(course.shortDescription) || plainText(aboutTheCourse);
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
  const explanation = courseExplanation(course, extra.aboutTheCourse);
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
      className={`group flex ${CONTENT_CARD_HEIGHT} flex-col overflow-hidden rounded-xl shadow-card transition-shadow duration-300 hover:shadow-card-hover`}
      style={{
        opacity: 0,
        transform: "translateY(24px)",
        transition:
          "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease"
      }}
    >
      <div className={`relative ${IMAGE_BAND} shrink-0 overflow-hidden bg-[#EDE4D3]`}>
        <span className="absolute left-3 top-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center rounded-full border border-brand-gold/70 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-ink shadow-sm backdrop-blur-sm">
          {tagLabel}
        </span>
        {course.imageUrl ? (
          <img
            src={course.imageUrl}
            alt={course.title}
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-brand-forest transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col bg-[#166D46] text-white">
        <InstructorAvatars
          seam
          people={teachers}
          className="absolute -top-[25px] right-2.5 z-10"
        />

        <div
          className={
            compact
              ? "min-h-0 flex-1 overflow-hidden px-4 pb-2 pt-5"
              : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.45)_transparent]"
          }
          onWheel={compact ? undefined : (e) => e.stopPropagation()}
          onTouchMove={compact ? undefined : (e) => e.stopPropagation()}
        >
          <h3 className="font-serif text-[1.2rem] font-semibold leading-snug text-white sm:text-[1.3rem]">
            {course.title}
          </h3>

          {explanation ? (
            <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-white/85 sm:text-[14px]">
              {explanation}
            </p>
          ) : null}

          <div className="mt-3 min-w-0 border-l-4 border-white/90 pl-3">
            {teacherNames.map((name) => (
              <p key={name} className="text-[14px] leading-snug text-white sm:text-[15px]">
                {name}
              </p>
            ))}
            {dateRange ? <p className="mt-1 text-[14px] text-white/90 sm:text-[15px]">{dateRange}</p> : null}
            {duration ? <p className="text-[14px] text-white sm:text-[15px]">{duration}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-end justify-between gap-3 border-t border-white/15 px-4 pb-4 pt-3">
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
