import type { Metadata } from "next";
import dynamic from "next/dynamic";

import { HomeHero } from "@/components/home/HomeHero";
import { HomeTrustPillars } from "@/components/home/HomeTrustPillars";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchCourses, fetchEvents, fetchBlogPosts } from "@/lib/api";
import type { CourseListItem } from "@/lib/course-types";
import { organizationJsonLd } from "@/lib/seo-product";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

const HomeInstrumentCategories = dynamic(
  () =>
    import("@/components/home/HomeInstrumentCategories").then((m) => m.HomeInstrumentCategories),
  { ssr: true }
);
const HomeExperienceSections = dynamic(
  () => import("@/components/home/HomeExperienceSections").then((m) => m.HomeExperienceSections),
  { ssr: true }
);
const HomeJournal = dynamic(
  () => import("@/components/home/HomeJournal").then((m) => m.HomeJournal),
  { ssr: true }
);
const HomeInstagram = dynamic(
  () => import("@/components/home/HomeInstagram").then((m) => m.HomeInstagram),
  { ssr: true }
);
const HomeNewsletter = dynamic(
  () => import("@/components/home/HomeNewsletter").then((m) => m.HomeNewsletter),
  { ssr: true }
);

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Sarveda — Music, Sound Healing, Yoga & Meditation",
  description:
    "Authentic music, sound healing, yoga and meditation products — curated by practitioners. Shop instruments and mindful living goods.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/") }
};

/** Card dates and instructor photos only — drop bios, FAQs, and curriculum from the homepage payload. */
function courseForHome(course: CourseListItem): CourseListItem {
  const extra = course.extra;
  if (!extra || typeof extra !== "object") return course;
  const slim: Record<string, unknown> = {};
  for (const key of ["startDate", "endDate", "duration", "durationHours", "mode", "venue", "schedule", "sessions", "curriculum"]) {
    if (extra[key] != null) slim[key] = extra[key];
  }
  if (Array.isArray(extra.teachers)) {
    slim.teachers = extra.teachers.map((teacher) => {
      if (!teacher || typeof teacher !== "object") return teacher;
      const row = teacher as Record<string, unknown>;
      return {
        name: typeof row.name === "string" ? row.name : "",
        imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : null
      };
    });
  }
  return { ...course, extra: slim };
}

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sarveda",
    url: absoluteUrl("/")
  };
}

export default async function HomePage() {
  let courses: Awaited<ReturnType<typeof fetchCourses>> = [];
  let events: Awaited<ReturnType<typeof fetchEvents>> = [];
  let posts: Awaited<ReturnType<typeof fetchBlogPosts>> = [];

  try {
    const [courseRows, eventRows, postRows] = await Promise.all([
      fetchCourses({ next: { revalidate: 300 } }),
      fetchEvents({ next: { revalidate: 120 } }),
      fetchBlogPosts({ next: { revalidate: 120 } })
    ]);
    // Keep the home rail light — full catalogs blow HTML + mentor/image work on mobile LCP.
    courses = courseRows.map(courseForHome).slice(0, 8);
    events = eventRows.slice(0, 6);
    posts = postRows.slice(0, 3);
  } catch {
    /* Keep buildable when API is unreachable */
  }

  return (
    <div className="overflow-x-hidden bg-brand-cream md:bg-brand-cream">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />

      {/* No entrance fades on the homepage — opacity:0 until JS/CSS runs was crushing mobile LCP. */}
      <HomeHero />
      <HomeTrustPillars />
      <HomeInstrumentCategories />
      <HomeExperienceSections courses={courses} events={events} />
      <HomeJournal posts={posts} />
      <HomeInstagram />
      <HomeNewsletter />
    </div>
  );
}
