"use client";

import Image from "next/image";
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2.5">
      <span className="min-w-[68px] shrink-0 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-brand-muted">
        {label}
      </span>
      <span className="min-w-0 break-words text-[13px] text-brand-ink">{value}</span>
    </div>
  );
}

export function CourseCard({ course, compact = false }: Props) {
  const extra = parseCourseExtra(course.extra);
  const teachers = parseCourseTeachers(extra);
  const teacherNames = teachers.map((t) => t.name);
  const s = prettyDate(extra.startDate);
  const e = prettyDate(extra.endDate);
  const dateRange = s && e && s !== e ? `${s} – ${e}` : s ?? null;
  const duration = formatCourseDuration(extra);
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.style.opacity = "1"; el.style.transform = "translateY(0)"; obs.disconnect(); }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Link
      ref={ref}
      href={`/course/${course.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-brand-cream-dark bg-brand-ivory shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
      style={{
        opacity: 0,
        transform: "translateY(24px)",
        transition:
          "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease"
      }}
    >
      <div className={`relative w-full shrink-0 overflow-visible bg-[#EDE4D3] ${compact ? "" : ""}`}>
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {course.imageUrl ? (
            <Image
              src={course.imageUrl}
              alt={course.title}
              fill
              className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              style={{ objectFit: "cover", objectPosition: "center" }}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 bg-brand-forest" />
          )}
          <span className="absolute left-2.5 top-2.5 z-10 inline-flex rounded-full border border-brand-gold/40 bg-brand-cream/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-gold">
            {course.isFree ? "Free" : "Paid"}
          </span>
        </div>
        <InstructorAvatars
          people={teachers}
          className="absolute bottom-0 right-3 z-10 translate-y-1/2"
        />
      </div>

      <div className={`flex min-w-0 flex-1 flex-col gap-3 p-5 ${teachers.length ? "pt-7" : ""}`}>
        <h3 className="break-words font-serif text-xl font-semibold leading-snug text-brand-ink md:text-[1.35rem]">
          {course.title}
        </h3>

        {course.shortDescription && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-brand-muted">
            {course.shortDescription}
          </p>
        )}

        <div className="h-px bg-brand-cream-dark" />

        <div className="flex flex-col gap-2">
          {teacherNames.length > 0 && (
            <MetaRow
              label="With"
              value={`${teacherNames.slice(0, 3).join(" · ")}${teacherNames.length > 3 ? ` +${teacherNames.length - 3}` : ""}`}
            />
          )}
          {dateRange && <MetaRow label="When" value={dateRange} />}
          {duration && <MetaRow label="Duration" value={duration} />}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="font-sans text-base font-semibold tabular-nums text-brand-forest">
            {course.isFree || course.priceInPaise === 0 ? "Free" : formatINRFromPaise(course.priceInPaise)}
          </p>
          <span className="inline-flex items-center rounded-full border border-brand-forest px-4 py-2 text-xs font-semibold text-brand-forest transition-colors group-hover:bg-brand-forest group-hover:text-brand-cream">
            Explore programme
          </span>
        </div>
      </div>
    </Link>
  );
}
