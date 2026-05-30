import type { Metadata } from "next";
import Link from "next/link";

import { CourseCard } from "@/components/content/CourseCard";
import { ContentCardGrid, ContentListingSection } from "@/components/content/ContentListingSection";
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
    <>
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            Courses
          </h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Deepen your practice with guided programmes in sound therapy, yoga, meditation, and mindful
            living — online or in person.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-6 lg:px-8">
        {courses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Courses are being updated. Please check back soon or{" "}
            <Link href="/shop" className="font-medium text-amber-800 underline">
              browse the shop
            </Link>
            .
          </p>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <ContentListingSection title="Upcoming & Ongoing Courses">
                <ContentCardGrid>
                  {upcoming.map((course) => (
                    <li key={course.id}>
                      <CourseCard course={course} />
                    </li>
                  ))}
                </ContentCardGrid>
              </ContentListingSection>
            ) : null}

            {past.length > 0 ? (
              <ContentListingSection title="Past Courses">
                <ContentCardGrid>
                  {past.map((course) => (
                    <li key={course.id}>
                      <CourseCard course={course} />
                    </li>
                  ))}
                </ContentCardGrid>
              </ContentListingSection>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
