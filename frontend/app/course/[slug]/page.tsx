import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { CourseAboutTeachers } from "@/components/content/CourseAboutTeachers";
import { CourseCurriculumList } from "@/components/content/CourseCurriculumList";
import { CourseSessionsList } from "@/components/content/CourseSessionsList";
import { CourseEnrollActions } from "@/components/course/CourseEnrollActions";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchCourseBySlug, fetchCourseSlugs, skipBuildTimeStaticParams } from "@/lib/api";
import {
  courseTeachers,
  formatCourseDuration,
  isCourseUpcoming,
  parseCourseExtra,
  parseCourseSchedule,
  parseCourseSessions,
  parseCourseTeachers
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

function prettyDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await fetchCourseBySlug(params.slug, { next: { revalidate: 300 } });
  if (!course) return { title: "Course" };
  const title = course.seoTitle || course.title;
  const description = metaDescription(course.seoDescription || course.shortDescription || course.description);
  return {
    title, description,
    openGraph: { title, description, images: course.imageUrl ? [{ url: course.imageUrl }] : undefined, siteName: "Sarveda" },
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/course/${params.slug}`) }
  };
}

export default async function CourseDetailPage({ params }: Props) {
  const course = await fetchCourseBySlug(params.slug, { next: { revalidate: 300 } });
  if (!course) notFound();

  const extra = parseCourseExtra(course.extra);
  const teachers = courseTeachers(extra);
  const teacherProfiles = parseCourseTeachers(extra);
  const s = prettyDate(extra.startDate);
  const e = prettyDate(extra.endDate);
  const dateRange = s && e && s !== e ? `${s} – ${e}` : s ?? null;

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Courses", url: absoluteUrl("/courses") },
    { name: course.title, url: absoluteUrl(`/course/${course.slug}`) }
  ];

  const embedUrl = course.videoUrl || extra.videoLink || null;
  const faqs = extra.faqs;
  const scheduleRows = parseCourseSchedule(extra);
  const sessionRows = parseCourseSessions(extra);
  const curriculumModules = extra.curriculum ?? [];
  const durationLabel = formatCourseDuration(extra);
  const layout = extra.layoutTemplate ?? (sessionRows.length >= 2 ? "SESSIONS" : "STANDARD");
  const registrationOpen = isCourseUpcoming(course);

  const programmeRows = [
    teachers.length > 0 && { label: "Facilitators", value: teachers.join(", ") },
    dateRange && { label: "When", value: dateRange },
    durationLabel && { label: "Duration", value: durationLabel },
    extra.mode && { label: "Mode", value: extra.mode },
    extra.venue && { label: "Venue", value: extra.venue },
    extra.timings && { label: "Timings", value: extra.timings }
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div style={{ background: "var(--brand-cream)" }}>
      <JsonLd data={[courseJsonLd(course), breadcrumbJsonLd(breadcrumbItems)]} />

      {/* Hero image — full bleed with forest gradient overlay */}
      {course.imageUrl && (
        <div className="relative w-full overflow-hidden" style={{ height: "clamp(280px,45vw,520px)" }}>
          <Image src={course.imageUrl} alt={course.title} fill className="object-cover" priority unoptimized />
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to bottom, rgba(15,26,20,0.25) 0%, rgba(15,26,20,0.65) 60%, var(--brand-cream) 100%)"
          }} />
          {/* Title on hero */}
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-6 pb-10 lg:px-12">
            <span style={{ display:"inline-block", background:"var(--brand-gold)", color:"#fff", fontSize:"9px", fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", padding:"5px 12px", marginBottom:"14px" }}>Course</span>
            <h1 className="font-serif" style={{ color:"#fffbf5", fontSize:"clamp(1.7rem,4vw,2.8rem)", fontWeight:700, lineHeight:1.15, maxWidth:"700px", textShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
              {course.title}
            </h1>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div style={{ borderBottom:"1px solid var(--brand-cream-dark)", background:"var(--brand-ivory)" }}>
        <div className="mx-auto max-w-7xl px-6 py-3 lg:px-12">
          <nav style={{ display:"flex", gap:"6px", alignItems:"center", fontSize:"12px", color:"var(--brand-muted)" }}>
            <Link href="/" style={{ color:"var(--brand-muted)" }}>Home</Link>
            <span>/</span>
            <Link href="/courses" style={{ color:"var(--brand-muted)" }}>Courses</Link>
            <span>/</span>
            <span style={{ color:"var(--brand-ink)" }}>{course.title}</span>
          </nav>
        </div>
      </div>

      {/* No image fallback title */}
      {!course.imageUrl && (
        <div style={{ background:"linear-gradient(160deg,var(--brand-forest),var(--brand-night))", borderBottom:"3px solid var(--brand-gold)" }}>
          <div className="mx-auto max-w-7xl px-6 py-14 lg:px-12">
            <span style={{ display:"inline-block", background:"var(--brand-gold)", color:"#fff", fontSize:"9px", fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", padding:"5px 12px", marginBottom:"14px" }}>Course</span>
            <h1 className="font-serif" style={{ color:"#fffbf5", fontSize:"clamp(1.8rem,4vw,3rem)", fontWeight:700, lineHeight:1.15 }}>{course.title}</h1>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[1fr_340px]">

          {/* Left */}
          <div>
            {course.shortDescription && (
              <p style={{ color:"var(--brand-muted)", fontSize:"1.1rem", lineHeight:1.8, marginBottom:"32px", maxWidth:"620px" }}>
                {course.shortDescription}
              </p>
            )}

            {programmeRows.length > 0 && (
              <div style={{ border:"1px solid var(--brand-cream-dark)", background:"var(--brand-ivory)", padding:"24px 28px", marginBottom:"40px" }}>
                <p style={{ color:"var(--brand-gold)", fontSize:"9px", fontWeight:700, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:"20px" }}>
                  Programme Details
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:"0" }}>
                  {programmeRows.map((row, i) => (
                    <div key={row.label} style={{ display:"flex", gap:"20px", alignItems:"flex-start", padding:"14px 0", borderBottom: i < programmeRows.length - 1 ? "1px solid var(--brand-cream-dark)" : "none" }}>
                      <span style={{ color:"var(--brand-muted)", fontSize:"11px", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", minWidth:"90px", paddingTop:"2px" }}>{row.label}</span>
                      <span style={{ color:"var(--brand-ink)", fontSize:"14px", lineHeight:1.6 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {extra.aboutTheCourse?.trim() && (
              <section style={{ marginBottom:"40px" }}>
                <h2 className="font-serif" style={{ color:"var(--brand-forest)", fontSize:"1.5rem", fontWeight:700, marginBottom:"16px" }}>
                  About the Course
                </h2>
                <div className="course-rich-text" style={{ color:"var(--brand-ink)", lineHeight:1.85, fontSize:"15px" }}>
                  <ProductRichText html={extra.aboutTheCourse} />
                </div>
              </section>
            )}

            <CourseAboutTeachers teachers={teacherProfiles} />

            {layout === "SESSIONS" && sessionRows.length > 0 ? (
              <CourseSessionsList sessions={sessionRows} />
            ) : null}

            {layout === "CURRICULUM" && curriculumModules.length > 0 ? (
              <CourseCurriculumList modules={curriculumModules} />
            ) : null}

            {scheduleRows.length > 0 && (
              <section style={{ marginBottom:"40px" }}>
                <h2 className="font-serif" style={{ color:"var(--brand-forest)", fontSize:"1.5rem", fontWeight:700, marginBottom:"20px" }}>
                  Schedule
                </h2>
                <div style={{ overflowX:"auto", border:"1px solid var(--brand-cream-dark)" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"14px", background:"var(--brand-ivory)" }}>
                    <thead>
                      <tr style={{ background:"var(--brand-forest)", color:"#fffbf5", textAlign:"left" }}>
                        {["Dates", "Mode", "Location", "Timings", "Duration"].map((h) => (
                          <th key={h} style={{ padding:"12px 14px", fontSize:"11px", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleRows.map((row, i) => {
                        const rs = prettyDate(row.startDate);
                        const re = prettyDate(row.endDate);
                        const dates = rs && re && rs !== re ? `${rs} – ${re}` : rs ?? re ?? "—";
                        return (
                          <tr key={i} style={{ borderTop:"1px solid var(--brand-cream-dark)" }}>
                            <td style={{ padding:"12px 14px", color:"var(--brand-ink)" }}>{dates}</td>
                            <td style={{ padding:"12px 14px", color:"var(--brand-muted)" }}>{row.mode || "—"}</td>
                            <td style={{ padding:"12px 14px", color:"var(--brand-muted)" }}>{row.location || "—"}</td>
                            <td style={{ padding:"12px 14px", color:"var(--brand-muted)" }}>{row.timings || "—"}</td>
                            <td style={{ padding:"12px 14px", color:"var(--brand-muted)" }}>{row.duration || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Video */}
            {embedUrl && (
              <div className="mb-10 overflow-hidden" style={{ aspectRatio:"16/9", border:"1px solid var(--brand-cream-dark)" }}>
                <iframe src={embedUrl} title={`${course.title} preview`} className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            )}

            {extra.courseIncludes?.trim() && (
              <section style={{ marginBottom:"40px" }}>
                <h2 className="font-serif" style={{ color:"var(--brand-forest)", fontSize:"1.5rem", fontWeight:700, marginBottom:"16px" }}>
                  What&apos;s Included
                </h2>
                <div className="course-rich-text" style={{ color:"var(--brand-ink)", lineHeight:1.85, fontSize:"15px" }}>
                  <ProductRichText html={extra.courseIncludes} />
                </div>
              </section>
            )}

            {/* Description */}
            {course.description && (
              <div className="course-rich-text">
                <style>{`
                  .course-rich-text { color: var(--brand-ink); line-height: 1.85; font-size: 15px; }
                  .course-rich-text h2 { font-family: var(--font-playfair,serif); color:var(--brand-forest); font-size:1.4rem; font-weight:700; margin-top:2rem; margin-bottom:0.6rem; }
                  .course-rich-text h3 { font-family: var(--font-playfair,serif); color:var(--brand-forest); font-size:1.1rem; font-weight:700; margin-top:1.5rem; margin-bottom:0.5rem; }
                  .course-rich-text p { margin-bottom:1rem; }
                  .course-rich-text ul, .course-rich-text ol { padding-left:1.25rem; margin-bottom:1rem; }
                  .course-rich-text li { margin-bottom:0.4rem; }
                  .course-rich-text strong { color:var(--brand-forest); }
                  .course-rich-text a { color:var(--brand-gold); text-decoration:underline; }
                `}</style>
                <ProductRichText html={course.description} />
              </div>
            )}

            {/* FAQs */}
            {faqs?.length ? (
              <section style={{ marginTop:"48px" }}>
                <h2 className="font-serif" style={{ color:"var(--brand-forest)", fontSize:"1.5rem", fontWeight:700, marginBottom:"20px" }}>
                  Frequently Asked Questions
                </h2>
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  {faqs.map((faq) => (
                    <div key={faq.question} style={{ border:"1px solid var(--brand-cream-dark)", background:"var(--brand-ivory)", padding:"18px 22px" }}>
                      <h3 style={{ color:"var(--brand-forest)", fontSize:"15px", fontWeight:700, marginBottom:"8px" }}>{faq.question}</h3>
                      <div style={{ color:"var(--brand-muted)", fontSize:"14px", lineHeight:1.7 }}>
                        <ProductRichText html={faq.answer} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside>
            <div style={{ position:"sticky", top:"100px", border:"1px solid var(--brand-cream-dark)", background:"var(--brand-ivory)", boxShadow:"0 4px 18px rgba(44,36,32,0.08)" }}>
              {registrationOpen && (course.priceInPaise > 0 || course.isFree) && (
                <div style={{ padding:"20px 24px", borderBottom:"1px solid var(--brand-cream-dark)", background:"linear-gradient(135deg,var(--brand-forest),var(--brand-night))" }}>
                  <p style={{ color:"var(--brand-gold-pale)", fontSize:"9px", fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:"6px" }}>Investment</p>
                  <p className="font-serif" style={{ color:"#fffbf5", fontSize:"2rem", fontWeight:700 }}>
                    {course.isFree ? "Free" : `₹${(course.priceInPaise / 100).toLocaleString("en-IN")}`}
                  </p>
                  {!course.isFree && <p style={{ color:"rgba(253,246,237,0.6)", fontSize:"11px", marginTop:"2px" }}>GST inclusive</p>}
                </div>
              )}
              <div style={{ padding:"20px 24px" }}>
                <CourseEnrollActions
                  item={course}
                  pathPrefix="course"
                  registrationClosed={!registrationOpen}
                />
                <Link href="/courses" style={{ display:"block", textAlign:"center", marginTop:"14px", color:"var(--brand-muted)", fontSize:"13px" }}>
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
