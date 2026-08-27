import type { Metadata } from "next";

import { HomeExperienceSections } from "@/components/home/HomeExperienceSections";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeInstagram } from "@/components/home/HomeInstagram";
import { HomeInstrumentCategories } from "@/components/home/HomeInstrumentCategories";
import { HomeJournal } from "@/components/home/HomeJournal";
import { HomeNewsletter } from "@/components/home/HomeNewsletter";
import { HomeTrustPillars } from "@/components/home/HomeTrustPillars";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchCourses, fetchEvents, fetchBlogPosts } from "@/lib/api";
import { organizationJsonLd } from "@/lib/seo-product";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Sarveda — Yoga, Meditation, Ayurveda & Sound Healing",
  description:
    "Authentic yoga, meditation, Ayurveda, and sound healing products — curated by practitioners. Shop instruments, herbs, and mindful living goods.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/") }
};

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
    [courses, events, posts] = await Promise.all([
      fetchCourses({ next: { revalidate: 300 } }),
      fetchEvents({ next: { revalidate: 120 } }),
      fetchBlogPosts({ next: { revalidate: 120 } })
    ]);
  } catch {
    /* Keep buildable when API is unreachable */
  }

  return (
    <div className="overflow-x-hidden bg-brand-cream md:bg-brand-cream">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />

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
