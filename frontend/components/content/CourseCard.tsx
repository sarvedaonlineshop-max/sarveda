import Image from "next/image";
import Link from "next/link";

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
  const heightClass = compact ? "min-h-[360px]" : "min-h-[420px] md:min-h-[480px]";

  return (
    <Link
      href={`/course/${course.slug}`}
      className={`group relative block overflow-hidden rounded-sm bg-stone-900 shadow-md transition hover:shadow-xl ${heightClass}`}
    >
      {course.imageUrl ? (
        <Image
          src={course.imageUrl}
          alt={course.title}
          fill
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a2f] to-[#0f1a14]" />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 42%, rgba(0,0,0,0.12) 72%, transparent 100%)"
        }}
      />

      <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f5d88a]">Course</p>
        <h3 className="mt-2 font-serif text-lg font-semibold leading-snug md:text-xl">{course.title}</h3>

        {teachers.length > 0 ? (
          <ul className="mt-3 space-y-0.5 text-sm text-white/90">
            {teachers.slice(0, 4).map((name) => (
              <li key={name}>{name}</li>
            ))}
            {teachers.length > 4 ? <li className="text-white/70">+{teachers.length - 4} more</li> : null}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
          {dates ? <span>{dates}</span> : null}
          {extra.duration ? (
            <span>{dates ? "· " : ""}{extra.duration}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
