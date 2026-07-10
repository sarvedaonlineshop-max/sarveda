import type { Metadata } from "next";

import { AboutPageContent } from "@/components/about/AboutPageContent";
import { aboutPage } from "@/lib/about-content";
import { canonical, isProductionSite } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: aboutPage.metaTitle,
    description: aboutPage.metaDescription,
    alternates: { canonical: canonical("/about") },
    robots: isProductionSite()
      ? { index: true, follow: true }
      : { index: false, follow: false }
  };
}

export default function AboutPage() {
  return <AboutPageContent />;
}
