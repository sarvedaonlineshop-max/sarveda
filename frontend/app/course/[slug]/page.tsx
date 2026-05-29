import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseEnrollActions } from "@/components/course/CourseEnrollActions";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchCourseBySlug, fetchCourseSlugs, skipBuildTimeStaticParams } from "@/lib/api";
import { breadcrumbJsonLd, courseJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const dynamicParams = true;
export const revalidate = 300;

export async function generateStaticParams() {
  if (skipBuildTimeStaticParams()) return [];
  const slugs = await fetchCourseSlugs({ next: { revalidate: 3600 } });
  return slugs.map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

function metaDescription(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const plain = htmlToPlainText(raw);
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await fetchCourseBySlug(params.slug, { next: { revalidate: 300 } });
  if (!course) return { title: "Course" };
  const title = course.seoTitle || course.title;
  const description = metaDescription(
    course.seoDescription || course.shortDescription || course.description
  );
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: course.imageUrl ? [{ url: course.imageUrl }] : undefined,
      siteName: "Sarveda"
    },
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/course/${params.slug}`) }
  };
}

export default async function CourseDetailPage({ params }: Props) {
  const course = await fetchCourseBySlug(params.slug, { next: { revalidate: 300 } });
  if (!course) notFound();

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Courses", url: absoluteUrl("/courses") },
    { name: course.title, url: absoluteUrl(`/course/${course.slug}`) }
  ];

  const extra = course.extra as {
    faqs?: Array<{ question: string; answer: string }>;
    videoLink?: string | null;
  } | null;
  const embedUrl = course.videoUrl || extra?.videoLink || null;

  return (
    <>
      <JsonLd data={[courseJsonLd(course), breadcrumbJsonLd(breadcrumbItems)]} />

      <div className="border-b border-[rgba(196,176,232,0.25)] bg-brand-bg">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Courses", href: "/courses" },
              { label: course.title }
            ]}
          />
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px] lg:gap-12">
          <div>
            <h1 className="display-text font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
              {course.title}
            </h1>
            {course.shortDescription ? (
              <p className="mt-4 text-lg text-brand-mid">{course.shortDescription}</p>
            ) : null}

            {course.imageUrl ? (
              <div className="mt-8 overflow-hidden rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white">
                <Image
                  src={course.imageUrl}
                  alt={course.title}
                  width={1200}
                  height={750}
                  className="h-auto w-full object-cover"
                  sizes="(max-width: 1024px) 100vw, 66vw"
                />
              </div>
            ) : null}

            {embedUrl ? (
              <div className="mt-8 aspect-video overflow-hidden rounded-2xl border border-[rgba(196,176,232,0.25)] bg-black">
                <iframe
                  src={embedUrl}
                  title={`${course.title} preview`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : null}

            {course.description ? (
              <div className="mt-10">
                <ProductRichText html={course.description} />
              </div>
            ) : null}

            {extra?.faqs?.length ? (
              <section className="mt-12">
                <h2 className="display-text font-serif text-2xl font-semibold text-brand-ink">FAQs</h2>
                <ul className="mt-4 space-y-4">
                  {extra.faqs.map((faq) => (
                    <li
                      key={faq.question}
                      className="rounded-xl border border-[rgba(196,176,232,0.25)] bg-white p-5"
                    >
                      <h3 className="display-text font-medium text-brand-ink">{faq.question}</h3>
                      <div className="mt-2 text-sm text-brand-mid">
                        <ProductRichText html={faq.answer} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <CourseEnrollActions item={course} pathPrefix="course" />
            <p className="mt-4 text-center text-sm text-brand-muted">
              <Link href="/courses" className="text-brand-violet underline hover:text-brand-violet-mid">
                ← All courses
              </Link>
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}
