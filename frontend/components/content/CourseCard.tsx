"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CourseListItem } from "@/lib/course-types";
import { courseTeachers, formatCourseDuration, parseCourseExtra } from "@/lib/content-meta";

type Props = { course: CourseListItem; compact?: boolean };

function prettyDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function CourseCard({ course, compact = false }: Props) {
  const extra = parseCourseExtra(course.extra);
  const teachers = courseTeachers(extra);
  const s = prettyDate(extra.startDate);
  const e = prettyDate(extra.endDate);
  const dateRange = s && e && s !== e ? `${s} – ${e}` : s ?? null;
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
      className="group flex flex-col overflow-hidden"
      style={{
        background: "var(--brand-ivory)",
        border: "1px solid var(--brand-cream-dark)",
        boxShadow: "0 2px 10px rgba(44,36,32,0.07)",
        opacity: 0,
        transform: "translateY(24px)",
        transition: "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease"
      }}
    >
      <style>{`.group:hover{box-shadow:0 10px 32px rgba(44,36,32,0.13)!important}.group:hover .ccard-img{transform:scale(1.04)}.group:hover .ccard-cta{background:var(--brand-forest);color:var(--brand-ivory)}`}</style>

      {/* Image */}
      <div
        className="relative w-full overflow-hidden"
        style={{ height: compact ? "240px" : "320px", flexShrink: 0 }}
      >
        {course.imageUrl ? (
          <Image src={course.imageUrl} alt={course.title} fill
            className="ccard-img object-cover object-center"
            style={{ transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)" }}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" unoptimized />
        ) : (
          <div className="ccard-img absolute inset-0" style={{ background: "var(--brand-forest)" }} />
        )}
        <span style={{
          position: "absolute", top: 0, left: 0,
          background: "var(--brand-gold)", color: "#fff",
          fontSize: "9px", fontWeight: 700, letterSpacing: "0.18em",
          textTransform: "uppercase", padding: "5px 12px"
        }}>{course.isFree ? "Free" : "Paid"}</span>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 22px 24px", flex: 1, display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>

        <h3 className="font-serif break-words" style={{ color: "var(--brand-ink)", fontSize: "1.15rem", fontWeight: 700, lineHeight: 1.3 }}>
          {course.title}
        </h3>

        {course.shortDescription && (
          <p style={{ color: "var(--brand-muted)", fontSize: "13px", lineHeight: 1.65,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {course.shortDescription}
          </p>
        )}

        {/* Thin divider */}
        <div style={{ height: "1px", background: "var(--brand-cream-dark)" }} />

        {/* Meta rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {teachers.length > 0 && (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2.5">
              <span style={{ color: "var(--brand-gold)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "68px", paddingTop: "2px", flexShrink: 0 }}>With</span>
              <span className="min-w-0 break-words" style={{ color: "var(--brand-ink)", fontSize: "13px" }}>
                {teachers.slice(0, 3).join(" · ")}{teachers.length > 3 ? ` +${teachers.length - 3}` : ""}
              </span>
            </div>
          )}
          {dateRange && (
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ color: "var(--brand-gold)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "68px" }}>When</span>
              <span style={{ color: "var(--brand-ink)", fontSize: "13px" }}>{dateRange}</span>
            </div>
          )}
          {formatCourseDuration(extra) && (
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ color: "var(--brand-gold)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "68px" }}>Duration</span>
              <span style={{ color: "var(--brand-ink)", fontSize: "13px" }}>{formatCourseDuration(extra)}</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{ marginTop: "auto", paddingTop: "10px" }}>
          <span className="ccard-cta" style={{
            display: "inline-block",
            border: "1px solid var(--brand-forest)",
            color: "var(--brand-forest)",
            background: "transparent",
            fontSize: "10px", fontWeight: 700,
            letterSpacing: "0.16em", textTransform: "uppercase",
            padding: "9px 20px",
            transition: "background 0.25s, color 0.25s"
          }}>
            Explore Programme →
          </span>
        </div>
      </div>
    </Link>
  );
}
