import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { CourseEnrollActions } from "@/components/course/CourseEnrollActions";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchCourseBySlug, fetchCourseSlugs, skipBuildTimeStaticParams } from "@/lib/api";
import {
  courseTeachers,
  parseCourseExtra
} from "@/lib/content-meta";
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

function formatDatePretty(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
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
      title, description,
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

  const extra = parseCourseExtra(course.extra);
  const teachers = courseTeachers(extra);
  const startLabel = formatDatePretty(extra.startDate);
  const endLabel = formatDatePretty(extra.endDate);
  const dateRange = startLabel && endLabel && startLabel !== endLabel
    ? `${startLabel} – ${endLabel}`
    : startLabel || null;

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Courses", url: absoluteUrl("/courses") },
    { name: course.title, url: absoluteUrl(`/course/${course.slug}`) }
  ];

  const embedUrl = course.videoUrl || extra.videoLink || null;
  const faqs = (course.extra as { faqs?: Array<{ question: string; answer: string }> } | null)?.faqs;

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh" }}>
      <JsonLd data={[courseJsonLd(course), breadcrumbJsonLd(breadcrumbItems)]} />

      {/* Full-bleed hero image */}
      {course.imageUrl && (
        <div className="relative w-full overflow-hidden" style={{ height: "clamp(300px, 50vw, 560px)" }}>
          <Image
            src={course.imageUrl}
            alt={course.title}
            fill
            className="object-cover"
            priority
            unoptimized
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom, rgba(13,13,13,0.2) 0%, rgba(13,13,13,0.7) 70%, #0D0D0D 100%)" }}
          />
          {/* Title overlay on hero */}
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-6 pb-10 lg:px-12">
            <p style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: "12px" }}>
              Course
            </p>
            <h1
              className="font-serif"
              style={{ color: "#F0EBE1", fontSize: "clamp(1.8rem, 4vw, 3rem)", fontWeight: 600, lineHeight: 1.15, maxWidth: "720px" }}
            >
              {course.title}
            </h1>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div style={{ borderBottom: "1px solid #1E1E1E" }}>
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
          <nav style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "12px", color: "#A89880" }}>
            <Link href="/" style={{ color: "#A89880" }} className="hover:text-[#C9A84C]">Home</Link>
            <span style={{ color: "#444" }}>/</span>
            <Link href="/courses" style={{ color: "#A89880" }} className="hover:text-[#C9A84C]">Courses</Link>
            <span style={{ color: "#444" }}>/</span>
            <span style={{ color: "#F0EBE1" }}>{course.title}</span>
          </nav>
        </div>
      </div>

      {/* No hero image fallback title */}
      {!course.imageUrl && (
        <div className="mx-auto max-w-7xl px-6 pt-12 lg:px-12">
          <p style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: "12px" }}>
            Course
          </p>
          <h1 className="font-serif" style={{ color: "#F0EBE1", fontSize: "clamp(1.8rem, 4vw, 3rem)", fontWeight: 600, lineHeight: 1.15 }}>
            {course.title}
          </h1>
        </div>
      )}

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[1fr_340px]">

          {/* Left column */}
          <div>
            {course.shortDescription && (
              <p style={{ color: "#A89880", fontSize: "1.1rem", lineHeight: 1.75, marginBottom: "32px", maxWidth: "640px" }}>
                {course.shortDescription}
              </p>
            )}

            {/* Meta card */}
            {(teachers.length > 0 || dateRange || extra.duration) && (
              <div
                style={{
                  border: "1px solid #2A2A2A",
                  background: "#141414",
                  padding: "24px 28px",
                  marginBottom: "40px"
                }}
              >
                <p style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "20px" }}>
                  Programme Details
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {teachers.length > 0 && (
                    <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", paddingBottom: "16px", borderBottom: "1px solid #1E1E1E" }}>
                      <span style={{ color: "#A89880", fontSize: "11px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "100px", paddingTop: "2px" }}>Facilitators</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {teachers.map((name) => (
                          <span key={name} style={{ color: "#F0EBE1", fontSize: "14px" }}>{name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {dateRange && (
                    <div style={{ display: "flex", gap: "20px", alignItems: "center", paddingBottom: "16px", borderBottom: "1px solid #1E1E1E" }}>
                      <span style={{ color: "#A89880", fontSize: "11px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "100px" }}>When</span>
                      <span style={{ color: "#F0EBE1", fontSize: "14px" }}>{dateRange}</span>
                    </div>
                  )}
                  {extra.duration && (
                    <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                      <span style={{ color: "#A89880", fontSize: "11px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", minWidth: "100px" }}>Duration</span>
                      <span style={{ color: "#F0EBE1", fontSize: "14px" }}>{extra.duration}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Video embed */}
            {embedUrl && (
              <div className="mb-10 overflow-hidden" style={{ aspectRatio: "16/9", border: "1px solid #2A2A2A" }}>
                <iframe
                  src={embedUrl}
                  title={`${course.title} preview`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}

            {/* Description */}
            {course.description && (
              <div
                className="course-rich-text"
                style={{ color: "#C8BCA8", lineHeight: 1.8 }}
              >
                <style>{`
                  .course-rich-text h2, .course-rich-text h3 { color: #F0EBE1; font-family: var(--font-serif, serif); margin-top: 2rem; margin-bottom: 0.75rem; }
                  .course-rich-text h2 { font-size: 1.5rem; }
                  .course-rich-text h3 { font-size: 1.2rem; }
                  .course-rich-text p { margin-bottom: 1rem; }
                  .course-rich-text ul, .course-rich-text ol { padding-left: 1.25rem; margin-bottom: 1rem; }
                  .course-rich-text li { margin-bottom: 0.4rem; }
                  .course-rich-text strong { color: #F0EBE1; }
                  .course-rich-text a { color: #C9A84C; text-decoration: underline; }
                `}</style>
                <ProductRichText html={course.description} />
              </div>
            )}

            {/* FAQs */}
            {faqs?.length ? (
              <section style={{ marginTop: "48px" }}>
                <h2
                  className="font-serif"
                  style={{ color: "#F0EBE1", fontSize: "1.6rem", fontWeight: 600, marginBottom: "24px" }}
                >
                  Frequently Asked Questions
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {faqs.map((faq) => (
                    <div
                      key={faq.question}
                      style={{ border: "1px solid #2A2A2A", background: "#141414", padding: "20px 24px" }}
                    >
                      <h3 style={{ color: "#F0EBE1", fontSize: "15px", fontWeight: 600, marginBottom: "10px" }}>
                        {faq.question}
                      </h3>
                      <div style={{ color: "#A89880", fontSize: "14px", lineHeight: 1.7 }}>
                        <ProductRichText html={faq.answer} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* Right sidebar */}
          <aside>
            <div
              style={{
                position: "sticky",
                top: "100px",
                border: "1px solid #2A2A2A",
                background: "#141414"
              }}
            >
              {/* Price strip */}
              {(course.priceInPaise > 0 || course.isFree) && (
                <div style={{ padding: "20px 24px", borderBottom: "1px solid #2A2A2A" }}>
                  <p style={{ color: "#A89880", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px" }}>
                    Investment
                  </p>
                  <p
                    className="font-serif"
                    style={{ color: "#F0EBE1", fontSize: "1.8rem", fontWeight: 600 }}
                  >
                    {course.isFree
                      ? "Free"
                      : `₹${(course.priceInPaise / 100).toLocaleString("en-IN")}`}
                  </p>
                  {!course.isFree && (
                    <p style={{ color: "#A89880", fontSize: "11px", marginTop: "2px" }}>GST inclusive</p>
                  )}
                </div>
              )}
              <div style={{ padding: "20px 24px" }}>
                <CourseEnrollActions item={course} pathPrefix="course" />
                <Link
                  href="/courses"
                  style={{ display: "block", textAlign: "center", marginTop: "16px", color: "#A89880", fontSize: "13px" }}
                  className="hover:text-[#C9A84C]"
                >
                  ← Back to all courses
                </Link>
              </div>
            </div>
          </aside>

        </div>
      </main>
    </div>
  );
}
