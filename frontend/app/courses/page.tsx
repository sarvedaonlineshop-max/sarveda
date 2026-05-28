import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

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

export default async function CoursesPage() {
  const courses = await fetchCourses({ next: { revalidate: 300 } });

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

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {courses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Courses are being updated. Please check back soon or{" "}
            <Link href="/shop" className="font-medium text-amber-800 underline">
              browse the shop
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/course/${course.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-stone-100">
                    {course.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <Image
                        src={course.imageUrl}
                        alt={course.title}
                        fill
                        className="object-cover transition duration-300 group-hover:scale-[1.02]"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">
                        Sarveda
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-serif text-lg font-semibold text-stone-900 group-hover:text-amber-900">
                      {course.title}
                    </h2>
                    {course.shortDescription ? (
                      <p className="mt-2 line-clamp-3 text-sm text-stone-600">{course.shortDescription}</p>
                    ) : null}
                    <p className="mt-auto pt-4 text-sm font-medium text-stone-800">
                      {course.priceInPaise > 0
                        ? formatINRFromPaise(course.priceInPaise)
                        : "Enquire for details"}
                      {course.enrollmentMode === "BOTH" ? (
                        <span className="ml-2 text-xs font-normal text-stone-500">· Pay or enquire</span>
                      ) : null}
                    </p>
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
