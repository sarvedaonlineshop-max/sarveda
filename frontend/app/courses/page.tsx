import type { Metadata } from "next";
import Link from "next/link";
import { CourseCard } from "@/components/content/CourseCard";
import { fetchCourses } from "@/lib/api";
import { splitCourses } from "@/lib/content-meta";
import { canonical, isProductionSite } from "@/lib/site";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Courses",
  description: "Yoga, sound therapy, meditation, and wellness courses — online and in-person workshops at Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/courses") }
};

export default async function CoursesPage() {
  const courses = await fetchCourses({ next: { revalidate: 120 } });
  const { upcoming, past } = splitCourses(courses);

  return (
    <div style={{ background: "var(--brand-cream)" }}>

      {/* Hero banner */}
      <section style={{
        background: "linear-gradient(160deg, #157a4a 0%, #0f5c38 100%)",
        borderBottom: "3px solid var(--brand-gold)"
      }}>
        <div className="page-shell-classic py-8 lg:py-10">
          <p className="sv-listing-hero-fade" style={{ color: "var(--brand-gold-pale)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: "10px" }}>
            Sarveda Learning
          </p>
          <h1 className="font-serif sv-listing-hero-fade" style={{ color: "#fffbf5", fontSize: "clamp(1.75rem, 4vw, 2.75rem)", fontWeight: 700, lineHeight: 1.1 }}>
            Courses &amp; Programmes
          </h1>
          <p className="sv-listing-hero-fade-late" style={{ color: "rgba(253,246,237,0.78)", fontSize: "1rem", lineHeight: 1.65, marginTop: "10px", maxWidth: "540px" }}>
            Deepen your practice through guided immersions in sound therapy, yoga, and mindful living — online and in person.
          </p>
          <div className="sv-listing-hero-fade-late" style={{ marginTop: "14px", height: "2px", width: "48px", background: "var(--brand-gold)" }} />
        </div>
      </section>

      <main className="page-shell-classic py-14">
        {courses.length === 0 ? (
          <div style={{ border: "1px dashed var(--brand-cream-dark)", padding: "64px 24px", textAlign: "center", borderRadius: "2px" }}>
            <p className="font-serif" style={{ color: "var(--brand-ink)", fontSize: "1.2rem" }}>Courses are being updated</p>
            <p style={{ color: "var(--brand-muted)", fontSize: "14px", marginTop: "8px" }}>
              Please check back soon or{" "}
              <Link href="/store" style={{ color: "var(--brand-gold)", textDecoration: "underline" }}>browse the shop</Link>.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "56px" }}>
            {upcoming.length > 0 && <CoursesSection title="Upcoming & Ongoing" courses={upcoming} />}
            {past.length > 0 && <CoursesSection title="Past Courses" courses={past} past />}
          </div>
        )}
      </main>
    </div>
  );
}

type SectionProps = {
  title: string;
  courses: Awaited<ReturnType<typeof fetchCourses>>;
  past?: boolean;
};

function CoursesSection({ title, courses, past = false }: SectionProps) {
  return (
    <section>
      <div style={{ marginBottom: "32px" }}>
        <h2 className="font-serif" style={{ color: past ? "var(--brand-muted)" : "var(--brand-forest)", fontSize: "1.75rem", fontWeight: 700 }}>
          {title}
        </h2>
        <div style={{ marginTop: "10px", height: "2px", width: "40px", background: past ? "var(--brand-cream-dark)" : "var(--brand-gold)" }} />
      </div>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course, i) => (
          <li key={course.id} style={{ animationDelay: `${i * 80}ms` }}>
            <CourseCard course={course} />
          </li>
        ))}
      </ul>
    </section>
  );
}
