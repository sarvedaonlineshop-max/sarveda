import type { Metadata } from "next";
import Link from "next/link";
import { CourseCard } from "@/components/content/CourseCard";
import { fetchCourses } from "@/lib/api";
import { splitCourses } from "@/lib/content-meta";
import { canonical, isProductionSite } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Yoga, sound therapy, meditation, and wellness courses — online and in-person workshops at Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/courses") }
};

export default async function CoursesPage() {
  const courses = await fetchCourses({ next: { revalidate: 300 } });
  const { upcoming, past } = splitCourses(courses);

  return (
    <div className="min-h-screen" style={{ background: "#0D0D0D" }}>

      {/* Hero */}
      <section
        className="relative flex flex-col items-start justify-end overflow-hidden"
        style={{
          minHeight: "340px",
          background: "linear-gradient(135deg, #0f1a14 0%, #1a1200 50%, #0D0D0D 100%)",
          borderBottom: "1px solid #2A2A2A"
        }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, #C9A84C 0%, transparent 50%), radial-gradient(circle at 80% 20%, #C9A84C 0%, transparent 40%)"
          }}
        />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-16 lg:px-12">
          <p
            className="mb-4 text-xs font-bold uppercase tracking-widest"
            style={{ color: "#C9A84C", letterSpacing: "0.22em" }}
          >
            Sarveda Learning
          </p>
          <h1
            className="font-serif text-4xl font-semibold md:text-5xl lg:text-6xl"
            style={{ color: "#F0EBE1", lineHeight: 1.1 }}
          >
            Courses &amp; Programmes
          </h1>
          <p
            className="mt-5 max-w-xl text-base md:text-lg"
            style={{ color: "#A89880", lineHeight: 1.75 }}
          >
            Deepen your practice through guided immersions in sound therapy, yoga, and
            mindful living — online and in person.
          </p>
          <div
            className="mt-8 h-px w-16"
            style={{ background: "linear-gradient(to right, #C9A84C, transparent)" }}
          />
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-6 py-16 lg:px-12">

        {courses.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-24 text-center"
            style={{ border: "1px solid #2A2A2A", borderRadius: "2px" }}
          >
            <p className="font-serif text-xl" style={{ color: "#F0EBE1" }}>
              Courses are being updated
            </p>
            <p className="mt-2 text-sm" style={{ color: "#A89880" }}>
              Please check back soon or{" "}
              <Link
                href="/shop"
                className="underline"
                style={{ color: "#C9A84C" }}
              >
                browse the shop
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-20">

            {upcoming.length > 0 && (
              <CoursesSection title="Upcoming &amp; Ongoing" courses={upcoming} />
            )}

            {past.length > 0 && (
              <CoursesSection title="Past Courses" courses={past} muted />
            )}

          </div>
        )}
      </main>
    </div>
  );
}

function CoursesSection({
  title,
  courses,
  muted = false
}: {
  title: string;
  courses: Awaited<ReturnType<typeof fetchCourses>>;
  muted?: boolean;
}) {
  return (
    <section>
      <div className="mb-10 flex items-end gap-6">
        <div>
          <h2
            className="font-serif text-2xl font-semibold md:text-3xl"
            style={{ color: muted ? "#A89880" : "#F0EBE1" }}
            dangerouslySetInnerHTML={{ __html: title }}
          />
          <div
            className="mt-3 h-px w-12"
            style={{
              background: muted
                ? "linear-gradient(to right, #A89880, transparent)"
                : "linear-gradient(to right, #C9A84C, transparent)"
            }}
          />
        </div>
      </div>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course, i) => (
          <li
            key={course.id}
            className="course-card-animate"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <CourseCard course={course} />
          </li>
        ))}
      </ul>
    </section>
  );
}
