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
import { formatINRFromPaise } from "@/lib/money";
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

type DetailRow = { label: string; value: string; helper?: string };

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

function SectionShell({
  eyebrow,
  title,
  children,
  className = ""
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[2rem] border border-[#eadfcf] bg-white/82 p-6 shadow-[0_22px_70px_rgba(28,53,42,0.07)] backdrop-blur-sm sm:p-8 ${className}`}>
      {eyebrow ? (
        <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.26em] text-[#b98a3e]">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-serif text-[1.85rem] font-semibold leading-tight tracking-[-0.04em] text-[#10201a] sm:text-[2.2rem]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function HeroStat({ label, value }: DetailRow) {
  return (
    <div className="rounded-2xl border border-white/55 bg-white/78 px-4 py-4 shadow-[0_14px_38px_rgba(28,53,42,0.08)] backdrop-blur-md">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#9a7a43]">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[#10201a]">{value}</p>
    </div>
  );
}

function ProgrammeCard({ row }: { row: DetailRow }) {
  return (
    <div className="rounded-2xl border border-[#eadfcf] bg-[#fffaf2] p-5 shadow-[0_12px_34px_rgba(28,53,42,0.045)]">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#a1742f]">{row.label}</p>
      <p className="mt-2 text-[0.98rem] font-semibold leading-6 text-[#10201a]">{row.value}</p>
      {row.helper ? <p className="mt-1 text-xs leading-5 text-[#65766c]">{row.helper}</p> : null}
    </div>
  );
}

function AnchorPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-[38px] items-center rounded-full border border-[#dfcfb9] bg-white/80 px-4 text-xs font-bold uppercase tracking-[0.15em] text-[#8b6428] shadow-[0_8px_22px_rgba(28,53,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#b98a3e] hover:bg-white"
    >
      {children}
    </a>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await fetchCourseBySlug(params.slug, { next: { revalidate: 300 } });
  if (!course) return { title: "Course" };
  const title = course.seoTitle || course.title;
  const description = metaDescription(course.seoDescription || course.shortDescription || course.description);
  return {
    title,
    description,
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
  const layout =
    extra.layoutTemplate ??
    (sessionRows.length >= 2 ? "SESSIONS" : curriculumModules.length >= 2 ? "CURRICULUM" : "STANDARD");
  const showMainDescription =
    layout === "CUSTOM" ||
    layout === "STANDARD" ||
    (layout === "SESSIONS" && sessionRows.length === 0) ||
    (layout === "CURRICULUM" && curriculumModules.length === 0);
  const showScheduleTable =
    scheduleRows.length > 0 &&
    !(layout === "SESSIONS" && sessionRows.length > 0) &&
    !(
      layout === "CURRICULUM" &&
      curriculumModules.length > 0 &&
      curriculumModules.some((m) => m.startDate || m.endDate)
    );

  const registrationOpen = isCourseUpcoming(course);
  const priceLabel = course.isFree
    ? "Free"
    : course.priceInPaise > 0
      ? formatINRFromPaise(course.priceInPaise)
      : "Enquire";

  const programmeRows = [
    teachers.length > 0 && { label: "Facilitators", value: teachers.join(", "), helper: "Guided by experienced Sarveda teachers." },
    dateRange && { label: "Dates", value: dateRange, helper: "Your learning journey timeline." },
    durationLabel && { label: "Duration", value: durationLabel, helper: "Designed for focused practice." },
    extra.mode && { label: "Mode", value: extra.mode, helper: "Join in the format listed here." },
    extra.venue && { label: "Venue", value: extra.venue, helper: "Location details for this intake." },
    extra.timings && { label: "Timings", value: extra.timings, helper: "Session timing for participants." }
  ].filter(Boolean) as DetailRow[];

  const heroStats = [
    dateRange && { label: "Starts", value: dateRange },
    durationLabel && { label: "Duration", value: durationLabel },
    extra.mode && { label: "Mode", value: extra.mode }
  ].filter(Boolean) as DetailRow[];

  const sectionLinks = [
    (extra.aboutTheCourse?.trim() || course.description) && { href: "#about", label: "About" },
    programmeRows.length > 0 && { href: "#programme", label: "Programme" },
    (sessionRows.length > 0 || curriculumModules.length > 0 || showScheduleTable) && { href: "#curriculum", label: "Curriculum" },
    teacherProfiles.length > 0 && { href: "#teachers", label: "Teachers" },
    faqs?.length && { href: "#faqs", label: "FAQs" }
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  const courseRichTextCss = `
    .course-rich-text { color: #34483e; line-height: 1.9; font-size: 16px; overflow-wrap: anywhere; word-break: break-word; max-width: 100%; }
    .course-rich-text h2 { font-family: var(--font-fraunces,serif); color:#10201a; font-size:1.6rem; font-weight:700; margin-top:2.2rem; margin-bottom:0.75rem; letter-spacing:-0.035em; }
    .course-rich-text h3 { font-family: var(--font-fraunces,serif); color:#143b2a; font-size:1.25rem; font-weight:700; margin-top:1.7rem; margin-bottom:0.6rem; }
    .course-rich-text p { margin-bottom:1rem; }
    .course-rich-text ul, .course-rich-text ol { padding-left:1.25rem; margin-bottom:1rem; }
    .course-rich-text li { margin-bottom:0.55rem; }
    .course-rich-text strong { color:#10201a; }
    .course-rich-text a { color:#9a6f2d; text-decoration:underline; text-underline-offset:3px; overflow-wrap:anywhere; }
    .course-rich-text img, .course-rich-text video, .course-rich-text iframe { max-width:100% !important; height:auto !important; border-radius:24px; }
    .course-rich-text table { display:block; max-width:100%; overflow-x:auto; }
    .course-rich-text pre { overflow-x:auto; max-width:100%; white-space:pre-wrap; }
  `;

  return (
    <div className="overflow-x-hidden bg-[#f7f0e6] text-[#10201a]">
      <JsonLd data={[courseJsonLd(course), breadcrumbJsonLd(breadcrumbItems)]} />
      <style>{courseRichTextCss}</style>

      <section className="relative overflow-hidden border-b border-[#e7dcc9] bg-[radial-gradient(circle_at_18%_10%,rgba(220,236,212,0.9),transparent_30%),linear-gradient(135deg,#fffaf2_0%,#f5ecd8_46%,#eaf4e9_100%)]">
        <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-[#d9ead4]/70 blur-3xl" />
        <div className="pointer-events-none absolute right-[-8rem] top-20 h-[30rem] w-[30rem] rounded-full bg-[#e5f1e2]/90 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-12rem] left-[38%] h-[28rem] w-[28rem] rounded-full bg-[#e6c173]/18 blur-3xl" />

        <div className="page-shell relative py-5 sm:py-7">
          <nav className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-[#66766c]">
            <Link href="/" className="hover:text-[#166D46]">Home</Link>
            <span>/</span>
            <Link href="/courses" className="hover:text-[#166D46]">Courses</Link>
            <span>/</span>
            <span className="min-w-0 truncate text-[#10201a]">{course.title}</span>
          </nav>
        </div>

        <div className="page-shell relative grid gap-10 pb-14 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,430px)] lg:items-center lg:pb-20 lg:pt-8 xl:gap-14">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e1c990] bg-white/74 px-4 py-2 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-[#9a6f2d] shadow-[0_14px_35px_rgba(28,53,42,0.07)] backdrop-blur-sm">
              Sarveda Course
            </div>
            <h1 className="mt-7 max-w-4xl font-serif text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.06em] text-[#10201a] sm:text-[4rem] lg:text-[5.1rem]">
              {course.title}
            </h1>
            {course.shortDescription ? (
              <p className="mt-6 max-w-3xl text-lg leading-8 text-[#4f6257] sm:text-xl">
                {course.shortDescription}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="#enroll"
                className="inline-flex min-h-[54px] items-center justify-center rounded-full bg-[#166D46] px-7 text-sm font-bold text-white shadow-[0_18px_45px_rgba(22,109,70,0.25)] transition hover:-translate-y-0.5 hover:bg-[#145a3a]"
              >
                Enrol now
              </Link>
              <Link
                href="#curriculum"
                className="inline-flex min-h-[54px] items-center justify-center rounded-full border border-[#b98a3e] bg-white/72 px-7 text-sm font-bold text-[#8b6428] shadow-[0_12px_34px_rgba(28,53,42,0.06)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                View curriculum
              </Link>
            </div>

            {heroStats.length > 0 ? (
              <div className="mt-9 grid max-w-3xl gap-3 sm:grid-cols-3">
                {heroStats.map((row) => <HeroStat key={row.label} label={row.label} value={row.value} />)}
              </div>
            ) : null}
          </div>

          <div id="enroll" className="lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/86 shadow-[0_35px_100px_rgba(28,53,42,0.16)] backdrop-blur-xl">
              <div className="relative h-56 overflow-hidden bg-[#143426] sm:h-64">
                {course.imageUrl ? (
                  <Image src={course.imageUrl} alt={course.title} fill className="object-cover" priority unoptimized />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(217,179,111,0.35),transparent_32%),linear-gradient(135deg,#143426,#06130f)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#07120e]/78 via-[#07120e]/18 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-[#10201a]">{priceLabel}</span>
                  {registrationOpen ? (
                    <span className="rounded-full bg-[#dff5e9] px-3 py-1.5 text-xs font-bold text-[#0e6a42]">Registration open</span>
                  ) : (
                    <span className="rounded-full bg-[#fff0d2] px-3 py-1.5 text-xs font-bold text-[#8b6428]">Future intake enquiry</span>
                  )}
                </div>
              </div>

              <div className="p-6 sm:p-7">
                {(course.priceInPaise > 0 || course.isFree) && (
                  <div className="mb-5 rounded-2xl border border-[#eadfcf] bg-[#fffaf2] p-4">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#a1742f]">Investment</p>
                    <p className="mt-1 font-sans text-3xl font-semibold tracking-tight text-[#10201a] tabular-nums">
                      {priceLabel}
                    </p>
                    {!course.isFree && course.priceInPaise > 0 ? (
                      <p className="mt-1 text-xs text-[#65766c]">GST inclusive. Secure checkout available.</p>
                    ) : null}
                  </div>
                )}

                <CourseEnrollActions
                  item={course}
                  pathPrefix="course"
                  payLabel={course.priceInPaise > 0 ? `Pay and enrol ${formatINRFromPaise(course.priceInPaise)}` : undefined}
                  registrationClosed={!registrationOpen}
                  embedded
                />

                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#eadfcf] pt-5 text-xs text-[#65766c]">
                  <p><span className="font-bold text-[#10201a]">Secure</span><br />Encrypted checkout</p>
                  <p><span className="font-bold text-[#10201a]">Support</span><br />WhatsApp / email help</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {sectionLinks.length > 0 ? (
        <div className="sticky top-0 z-20 border-b border-[#eadfcf] bg-[#fffaf2]/90 backdrop-blur-xl">
          <div className="page-shell flex gap-2 overflow-x-auto py-3">
            {sectionLinks.map((link) => <AnchorPill key={link.href} href={link.href}>{link.label}</AnchorPill>)}
          </div>
        </div>
      ) : null}

      <main className="page-shell py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-8">
            {(layout === "CUSTOM" && showMainDescription && course.description) ? (
              <SectionShell eyebrow="Overview" title="About this learning journey" className="course-rich-text" >
                <ProductRichText html={course.description} />
              </SectionShell>
            ) : null}

            {layout !== "CUSTOM" && extra.aboutTheCourse?.trim() ? (
              <div id="about">
                <SectionShell eyebrow="Overview" title="About the course">
                  <div className="course-rich-text">
                    <ProductRichText html={extra.aboutTheCourse} />
                  </div>
                </SectionShell>
              </div>
            ) : null}

            {layout !== "CUSTOM" && showMainDescription && course.description ? (
              <div id="about">
                <SectionShell eyebrow="Overview" title="What you will experience">
                  <div className="course-rich-text">
                    <ProductRichText html={course.description} />
                  </div>
                </SectionShell>
              </div>
            ) : null}

            {programmeRows.length > 0 ? (
              <div id="programme">
                <SectionShell eyebrow="Programme" title="Everything at a glance">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {programmeRows.map((row) => <ProgrammeCard key={row.label} row={row} />)}
                  </div>
                </SectionShell>
              </div>
            ) : null}

            {embedUrl ? (
              <SectionShell eyebrow="Preview" title="Watch the course introduction">
                <div className="overflow-hidden rounded-[1.5rem] border border-[#eadfcf] bg-black shadow-[0_18px_55px_rgba(28,53,42,0.14)]" style={{ aspectRatio: "16/9" }}>
                  <iframe
                    src={embedUrl}
                    title={`${course.title} preview`}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </SectionShell>
            ) : null}

            {extra.courseIncludes?.trim() ? (
              <SectionShell eyebrow="Included" title="What is included">
                <div className="course-rich-text">
                  <ProductRichText html={extra.courseIncludes} />
                </div>
              </SectionShell>
            ) : null}

            <div id="curriculum" className="space-y-8">
              {layout === "SESSIONS" && sessionRows.length > 0 ? <CourseSessionsList sessions={sessionRows} /> : null}
              {layout === "CURRICULUM" && curriculumModules.length > 0 ? <CourseCurriculumList modules={curriculumModules} /> : null}

              {showScheduleTable ? (
                <SectionShell eyebrow="Schedule" title="Course schedule">
                  <div className="overflow-x-auto rounded-2xl border border-[#eadfcf] bg-white">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="bg-[#143426] text-left text-[#fffbf5]">
                          {["Dates", "Mode", "Location", "Timings", "Duration"].map((h) => (
                            <th key={h} className="px-4 py-4 text-[0.7rem] font-bold uppercase tracking-[0.16em] first:rounded-tl-2xl last:rounded-tr-2xl">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleRows.map((row, i) => {
                          const rs = prettyDate(row.startDate);
                          const re = prettyDate(row.endDate);
                          const dates = rs && re && rs !== re ? `${rs} – ${re}` : rs ?? re ?? "—";
                          return (
                            <tr key={i} className="border-t border-[#eadfcf]">
                              <td className="border-t border-[#eadfcf] px-4 py-4 font-semibold text-[#10201a]">{dates}</td>
                              <td className="border-t border-[#eadfcf] px-4 py-4 text-[#65766c]">{row.mode || "—"}</td>
                              <td className="border-t border-[#eadfcf] px-4 py-4 text-[#65766c]">{row.location || "—"}</td>
                              <td className="border-t border-[#eadfcf] px-4 py-4 text-[#65766c]">{row.timings || "—"}</td>
                              <td className="border-t border-[#eadfcf] px-4 py-4 text-[#65766c]">{row.duration || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </SectionShell>
              ) : null}
            </div>

            {faqs?.length ? (
              <div id="faqs">
                <SectionShell eyebrow="Questions" title="Frequently asked questions">
                  <div className="space-y-3">
                    {faqs.map((faq) => (
                      <details key={faq.question} className="group rounded-2xl border border-[#eadfcf] bg-[#fffaf2] p-5 open:bg-white">
                        <summary className="cursor-pointer list-none font-semibold text-[#10201a] marker:hidden">
                          <span className="inline-flex w-full items-center justify-between gap-4">
                            {faq.question}
                            <span className="text-xl text-[#b98a3e] transition group-open:rotate-45">+</span>
                          </span>
                        </summary>
                        <div className="course-rich-text mt-4 border-t border-[#eadfcf] pt-4 text-sm">
                          <ProductRichText html={faq.answer} />
                        </div>
                      </details>
                    ))}
                  </div>
                </SectionShell>
              </div>
            ) : null}

            <div id="teachers">{teacherProfiles.length > 0 ? <CourseAboutTeachers teachers={teacherProfiles} /> : null}</div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-[1.6rem] border border-[#eadfcf] bg-white/84 p-5 shadow-[0_18px_60px_rgba(28,53,42,0.08)] backdrop-blur-sm">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[#b98a3e]">Quick summary</p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-[#eadfcf] pb-3">
                    <span className="text-[#65766c]">Price</span>
                    <span className="font-semibold text-[#10201a]">{priceLabel}</span>
                  </div>
                  {dateRange ? (
                    <div className="flex justify-between gap-4 border-b border-[#eadfcf] pb-3">
                      <span className="text-[#65766c]">Dates</span>
                      <span className="text-right font-semibold text-[#10201a]">{dateRange}</span>
                    </div>
                  ) : null}
                  {durationLabel ? (
                    <div className="flex justify-between gap-4 border-b border-[#eadfcf] pb-3">
                      <span className="text-[#65766c]">Duration</span>
                      <span className="font-semibold text-[#10201a]">{durationLabel}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4">
                    <span className="text-[#65766c]">Status</span>
                    <span className="font-semibold text-[#166D46]">{registrationOpen ? "Open" : "Closed"}</span>
                  </div>
                </div>
                <Link href="#enroll" className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#166D46] px-5 text-sm font-bold text-white hover:bg-[#145a3a]">
                  Go to enrolment
                </Link>
              </div>
              <Link href="/courses" className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-[#dfcfb9] bg-white/70 px-5 text-sm font-semibold text-[#8b6428] hover:bg-white">
                ← Back to all courses
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}