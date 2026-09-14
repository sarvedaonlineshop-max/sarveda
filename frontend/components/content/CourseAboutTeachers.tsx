import Image from "next/image";

import { ProductRichText } from "@/components/product/ProductRichText";
import type { CourseTeacher } from "@/lib/content-meta";

type Props = {
  teachers: CourseTeacher[];
};

export function CourseAboutTeachers({ teachers }: Props) {
  const list = teachers.filter(
    (t) => t.name.trim() && (t.bio?.trim() || t.imageUrl?.trim() || t.designation?.trim())
  );
  if (list.length === 0) return null;

  return (
    <section style={{ marginTop: "48px", marginBottom: "40px" }}>
      <h2
        className="font-serif"
        style={{
          color: "var(--brand-forest)",
          fontSize: "1.5rem",
          fontWeight: 700,
          marginBottom: "28px"
        }}
      >
        About the Teachers
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        {list.map((teacher) => (
          <article
            key={teacher.name}
            className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8"
          >
            <div
              className="relative shrink-0 overflow-hidden rounded-full"
              style={{
                width: "148px",
                height: "148px",
                background: "var(--brand-cream-dark)"
              }}
            >
              {teacher.imageUrl ? (
                <Image
                  src={teacher.imageUrl}
                  alt={teacher.name}
                  fill
                  className="object-cover"
                  sizes="148px"
                  unoptimized
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center font-serif text-3xl font-semibold"
                  style={{ color: "var(--brand-forest)" }}
                >
                  {teacher.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h3
                style={{
                  color: "#0F766E",
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  lineHeight: 1.3
                }}
              >
                {teacher.name}
              </h3>
              {teacher.designation ? (
                <p
                  className="mt-1 text-sm font-medium"
                  style={{ color: "var(--brand-gold)" }}
                >
                  {teacher.designation}
                </p>
              ) : null}
              {teacher.bio ? (
                <div
                  className="course-teacher-bio mt-3 text-[15px] leading-[1.75]"
                  style={{ color: "var(--brand-ink)" }}
                >
                  <style>{`
                    .course-teacher-bio p { margin-bottom: 0.85rem; }
                    .course-teacher-bio p:last-child { margin-bottom: 0; }
                    .course-teacher-bio strong { color: var(--brand-forest); }
                  `}</style>
                  <ProductRichText html={teacher.bio} />
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
