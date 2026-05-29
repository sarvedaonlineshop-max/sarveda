import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageListHero } from "@/components/layout/PageListHero";
import { fetchCourses } from "@/lib/api";
import { formatINRFromPaise } from "@/lib/money";
import { canonical, isProductionSite } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Yoga, sound therapy, meditation, and wellness courses — online and in-person workshops at Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/courses") }
};

const courseGradients = [
  "linear-gradient(160deg, #22134A 0%, #5B3E9B 100%)",
  "linear-gradient(160deg, #3D5C3D 0%, #5A8C6B 100%)",
  "linear-gradient(135deg, #C8A460 0%, #5B3E9B 100%)",
];

function enrollmentLabel(mode: string) {
  if (mode === "ENQUIRY") return "Enquire to join";
  if (mode === "BOTH") return "Online · Pay or enquire";
  return "Online · Enroll now";
}

export default async function CoursesPage() {
  const courses = await fetchCourses({ next: { revalidate: 300 } });

  return (
    <>
      <PageListHero
        eyebrow="Learn with us"
        title={
          <>
            Courses & <span className="italic text-brand-lavender">guided practice</span>
          </>
        }
        subtitle="Deepen your practice with guided programmes in sound therapy, yoga, meditation, and mindful living — online or in person."
      />

      <main className="bg-brand-bg mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {courses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[rgba(196,176,232,0.35)] bg-brand-ivory p-12 text-center text-brand-mid">
            Courses are being updated. Please check back soon or{" "}
            <Link href="/shop" className="font-medium text-brand-violet underline hover:text-brand-violet-mid">
              browse the shop
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, index) => (
              <li key={course.id}>
                <Link
                  href={`/course/${course.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory transition-shadow hover:shadow-card-hover"
                >
                  <div
                    className="relative aspect-[16/10] overflow-hidden"
                    style={
                      course.imageUrl
                        ? undefined
                        : { background: courseGradients[index % courseGradients.length] }
                    }
                  >
                    {course.imageUrl ? (
                      <Image
                        src={course.imageUrl}
                        alt={course.title}
                        fill
                        className="object-cover transition duration-300 group-hover:scale-[1.02]"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center display-text text-2xl italic text-brand-lavender/80">
                        Sarveda
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-[10px] font-normal uppercase tracking-[0.14em] text-brand-violet">
                      Wellness course
                    </p>
                    <h2 className="display-text mt-2 text-xl font-normal leading-snug text-brand-ink group-hover:text-brand-violet">
                      {course.title}
                    </h2>
                    {course.shortDescription ? (
                      <p className="mt-2 line-clamp-3 text-sm font-light text-brand-mid">
                        {course.shortDescription}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] font-light text-brand-muted">
                      {enrollmentLabel(course.enrollmentMode)}
                    </p>
                    <p className="price-text mt-3 text-[15px] font-medium text-brand-ink">
                      {course.isFree || course.priceInPaise === 0
                        ? "Free"
                        : formatINRFromPaise(course.priceInPaise)}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <span className="flex flex-1 items-center justify-center rounded-lg bg-brand-violet py-2.5 text-[11px] font-medium uppercase tracking-wide text-white transition-colors group-hover:bg-brand-violet-mid">
                        Enroll
                      </span>
                      <span className="flex flex-1 items-center justify-center rounded-lg bg-brand-violet-light py-2.5 text-[11px] font-medium uppercase tracking-wide text-brand-violet-deep">
                        Explore
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
