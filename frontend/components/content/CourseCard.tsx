"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CourseListItem } from "@/lib/course-types";
import {
  courseTeachers,
  parseCourseExtra
} from "@/lib/content-meta";

type Props = {
  course: CourseListItem;
  compact?: boolean;
};

function formatDatePretty(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function CourseCard({ course, compact = false }: Props) {
  const extra = parseCourseExtra(course.extra);
  const teachers = courseTeachers(extra);
  const startLabel = formatDatePretty(extra.startDate);
  const endLabel = formatDatePretty(extra.endDate);
  const dateRange = startLabel && endLabel && startLabel !== endLabel
    ? `${startLabel} – ${endLabel}`
    : startLabel || null;

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

  const imgH = compact ? "200px" : "240px";

  return (
    <Link
      ref={ref}
      href={`/course/${course.slug}`}
      className="group flex flex-col overflow-hidden"
      style={{
        background: "#141414",
        border: "1px solid #222",
        opacity: 0,
        transform: "translateY(32px)",
        transition: "opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)"
      }}
    >
      {/* Image */}
      <div className="relative overflow-hidden" style={{ height: imgH, flexShrink: 0 }}>
        {course.imageUrl ? (
          <Image
            src={course.imageUrl}
            alt={course.title}
            fill
            className="object-cover"
            style={{ transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)" }}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#1e3a2f,#0f1a14)" }} />
        )}
        {/* hover scale via JS workaround since no CSS modules */}
        <style>{`.group:hover .course-img{transform:scale(1.05)}`}</style>
        <span className="course-img" style={{ display: "none" }} />

        {/* Gold badge */}
        <span
          style={{
            position: "absolute", top: 0, left: 0,
            background: "#C9A84C", color: "#0D0D0D",
            fontSize: "9px", fontWeight: 700,
            letterSpacing: "0.2em", textTransform: "uppercase",
            padding: "5px 10px"
          }}
        >
          Course
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 22px 24px", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>

        <h3
          className="font-serif"
          style={{ color: "#F0EBE1", fontSize: "1.15rem", fontWeight: 600, lineHeight: 1.35 }}
        >
          {course.title}
        </h3>

        {course.shortDescription && (
          <p style={{ color: "#8A7D6B", fontSize: "13px", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {course.shortDescription}
          </p>
        )}

        {/* Divider */}
        <div style={{ height: "1px", background: "#222", margin: "2px 0" }} />

        {/* Meta rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          {teachers.length > 0 && (
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "72px", paddingTop: "1px" }}>With</span>
              <span style={{ color: "#C8BCA8", fontSize: "13px" }}>
                {teachers.slice(0, 3).join(" · ")}{teachers.length > 3 ? ` +${teachers.length - 3}` : ""}
              </span>
            </div>
          )}
          {dateRange && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "72px" }}>When</span>
              <span style={{ color: "#C8BCA8", fontSize: "13px" }}>{dateRange}</span>
            </div>
          )}
          {extra.duration && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "72px" }}>Duration</span>
              <span style={{ color: "#C8BCA8", fontSize: "13px" }}>{extra.duration}</span>
            </div>
          )}
          {(course.priceInPaise > 0 || course.isFree) && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "72px" }}>Investment</span>
              <span style={{ color: "#F0EBE1", fontSize: "13px", fontWeight: 600 }}>
                {course.isFree ? "Free" : `₹${(course.priceInPaise / 100).toLocaleString("en-IN")}`}
              </span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{ marginTop: "auto", paddingTop: "14px" }}>
          <span
            style={{
              display: "inline-block",
              border: "1px solid #C9A84C",
              color: "#C9A84C",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              padding: "8px 18px",
              transition: "background 0.25s, color 0.25s"
            }}
            className="course-explore-btn"
          >
            Explore Programme →
          </span>
          <style>{`.group:hover .course-explore-btn{background:#C9A84C;color:#0D0D0D}`}</style>
        </div>
      </div>
    </Link>
  );
}
