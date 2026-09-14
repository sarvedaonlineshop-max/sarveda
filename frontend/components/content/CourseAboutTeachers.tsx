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
    <section className="rounded-[2rem] border border-[#eadfcf] bg-white/82 p-6 shadow-[0_22px_70px_rgba(28,53,42,0.07)] backdrop-blur-sm sm:p-8">
      <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.26em] text-[#b98a3e]">
        Guides
      </p>
      <h2 className="font-serif text-[1.85rem] font-semibold leading-tight tracking-[-0.04em] text-[#10201a] sm:text-[2.2rem]">
        Meet your teachers
      </h2>
      <div className="mt-7 space-y-5">
        {list.map((teacher) => (
          <article
            key={teacher.name}
            className="flex flex-col gap-5 rounded-[1.35rem] border border-[#eadfcf] bg-[#fffaf2] p-5 shadow-[0_12px_34px_rgba(28,53,42,0.045)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_50px_rgba(28,53,42,0.08)] sm:flex-row sm:items-start sm:p-6"
          >
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full border-4 border-[#f1d9a8] bg-[#efe3d0] shadow-[0_12px_35px_rgba(28,53,42,0.10)]">
              {teacher.imageUrl ? (
                <Image
                  src={teacher.imageUrl}
                  alt={teacher.name}
                  fill
                  className="object-cover"
                  sizes="112px"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-serif text-3xl font-semibold text-[#143426]">
                  {teacher.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-2xl font-semibold leading-tight tracking-[-0.035em] text-[#10201a]">
                {teacher.name}
              </h3>
              {teacher.designation ? (
                <p className="mt-1 text-sm font-bold text-[#a1742f]">{teacher.designation}</p>
              ) : null}
              {teacher.bio ? (
                <div className="course-teacher-bio mt-4 text-sm leading-7 text-[#34483e]">
                  <style>{`
                    .course-teacher-bio p { margin-bottom: 0.75rem; }
                    .course-teacher-bio p:last-child { margin-bottom: 0; }
                    .course-teacher-bio strong { color: #10201a; }
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