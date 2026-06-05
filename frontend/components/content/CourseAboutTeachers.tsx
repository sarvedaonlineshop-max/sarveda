import Image from "next/image";

import { ProductRichText } from "@/components/product/ProductRichText";
import type { CourseTeacher } from "@/lib/content-meta";

type Props = {
  teachers: CourseTeacher[];
};

export function CourseAboutTeachers({ teachers }: Props) {
  const list = teachers.filter(
    (t) => t.name.trim() && (t.bio?.trim() || t.imageUrl?.trim())
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
      <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>
        {list.map((teacher) => (
          <article
            key={teacher.name}
            className="flex flex-col gap-6 sm:flex-row sm:items-start"
            style={{
              border: "1px solid var(--brand-cream-dark)",
              background: "var(--brand-ivory)",
              padding: "24px 28px"
            }}
          >
            <div
              className="relative shrink-0 overflow-hidden rounded-full"
              style={{
                width: "120px",
                height: "120px",
                border: "3px solid var(--brand-gold-pale)",
                background: "var(--brand-cream-dark)"
              }}
            >
              {teacher.imageUrl ? (
                <Image
                  src={teacher.imageUrl}
                  alt={teacher.name}
                  fill
                  className="object-cover"
                  sizes="120px"
                  unoptimized
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center font-serif text-2xl font-semibold"
                  style={{ color: "var(--brand-forest)" }}
                >
                  {teacher.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3
                className="font-serif"
                style={{ color: "var(--brand-forest)", fontSize: "1.25rem", fontWeight: 700 }}
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
                  className="course-teacher-bio mt-3 text-sm leading-relaxed"
                  style={{ color: "var(--brand-muted)" }}
                >
                  <style>{`
                    .course-teacher-bio p { margin-bottom: 0.75rem; }
                    .course-teacher-bio p:last-child { margin-bottom: 0; }
                    .course-teacher-bio strong { color: var(--brand-ink); }
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
