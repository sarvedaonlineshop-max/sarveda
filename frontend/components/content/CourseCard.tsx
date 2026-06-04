"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CourseListItem } from "@/lib/course-types";
import {
  courseTeachers,
  formatCourseDateRange,
  parseCourseExtra
} from "@/lib/content-meta";

type Props = {
  course: CourseListItem;
  compact?: boolean;
};

export function CourseCard({ course, compact = false }: Props) {
  const extra = parseCourseExtra(course.extra);
  const teachers = courseTeachers(extra);
  const dates = formatCourseDateRange(extra);
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const minH = compact ? "320px" : "420px";

  return (
    <>
      <style>{`
        .sarveda-course-card {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease;
        }
        .sarveda-course-card.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .sarveda-course-card:hover {
          box-shadow: 0 20px 60px rgba(0,0,0,0.7);
        }
        .sarveda-course-card:hover .card-img {
          transform: scale(1.04);
        }
        .sarveda-course-card:hover .explore-btn {
          background: #C9A84C;
          color: #0D0D0D;
        }
        .sarveda-course-card:hover .gold-label {
          letter-spacing: 0.28em;
        }
        .card-img {
          transition: transform 0.6s cubic-bezier(0.22,1,0.36,1);
        }
        .explore-btn {
          transition: background 0.25s ease, color 0.25s ease;
        }
        .gold-label {
          transition: letter-spacing 0.3s ease;
        }
        .teacher-dot::before {
          content: "";
          display: inline-block;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #C9A84C;
          margin-right: 6px;
          vertical-align: middle;
          flex-shrink: 0;
        }
      `}</style>

      <Link
        ref={ref}
        href={`/course/${course.slug}`}
        className="sarveda-course-card group relative flex flex-col overflow-hidden"
        style={{
          minHeight: minH,
          background: "#141414",
          border: "1px solid #2A2A2A",
          borderRadius: "2px",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {/* Image area */}
        <div className="relative overflow-hidden" style={{ flex: "0 0 auto", height: compact ? "200px" : "260px" }}>
          {course.imageUrl ? (
            <Image
              src={course.imageUrl}
              alt={course.title}
              fill
              className="card-img object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized
            />
          ) : (
            <div
              className="card-img absolute inset-0"
              style={{
                background: "linear-gradient(135deg, #1e3a2f 0%, #0f1a14 50%, #1a1200 100%)"
              }}
            />
          )}
          {/* Subtle bottom fade into card body */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: "60px",
              background: "linear-gradient(to bottom, transparent, #141414)"
            }}
          />
          {/* Gold label badge */}
          <div className="absolute left-0 top-0">
            <p
              className="gold-label px-3 py-1.5 text-[9px] font-bold uppercase"
              style={{
                letterSpacing: "0.22em",
                color: "#0D0D0D",
                background: "#C9A84C"
              }}
            >
              Course
            </p>
          </div>
        </div>

        {/* Card body */}
        <div
          className="flex flex-col"
          style={{
            flex: 1,
            padding: "20px 22px 22px",
            borderTop: "1px solid #2A2A2A"
          }}
        >
          <h3
            className="font-serif text-lg font-semibold leading-snug md:text-xl"
            style={{ color: "#F0EBE1" }}
          >
            {course.title}
          </h3>

          {course.shortDescription && (
            <p
              className="mt-2 text-sm leading-relaxed line-clamp-2"
              style={{ color: "#A89880" }}
            >
              {course.shortDescription}
            </p>
          )}

          {/* Teachers */}
          {teachers.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {teachers.slice(0, 3).map((name) => (
                <li
                  key={name}
                  className="teacher-dot flex items-center text-sm"
                  style={{ color: "#C8BCA8" }}
                >
                  {name}
                </li>
              ))}
              {teachers.length > 3 && (
                <li className="text-xs" style={{ color: "#A89880" }}>
                  +{teachers.length - 3} more
                </li>
              )}
            </ul>
          )}

          {/* Meta: dates + duration */}
          {(dates || extra.duration) && (
            <div
              className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
              style={{ color: "#A89880" }}
            >
              {dates && (
                <span style={{ color: "#C9A84C" }}>{dates}</span>
              )}
              {extra.duration && (
                <span
                  style={{
                    border: "1px solid #2A2A2A",
                    padding: "2px 8px",
                    borderRadius: "1px"
                  }}
                >
                  {extra.duration}
                </span>
              )}
            </div>
          )}

          {/* Spacer + CTA */}
          <div className="mt-auto pt-5">
            <div
              className="explore-btn inline-block px-5 py-2 text-xs font-bold uppercase"
              style={{
                letterSpacing: "0.16em",
                border: "1px solid #C9A84C",
                color: "#C9A84C",
                borderRadius: "1px"
              }}
            >
              Explore →
            </div>
          </div>
        </div>
      </Link>
    </>
  );
}
