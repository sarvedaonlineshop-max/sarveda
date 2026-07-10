import type { Metadata } from "next";

import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { getLegalPage } from "@/lib/legal-pages";
import { canonical, isProductionSite } from "@/lib/site";

const page = getLegalPage("privacy");

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Privacy Policy",
    description: "Read Sarveda's privacy policy and how we handle your personal data.",
    alternates: { canonical: canonical("/privacy") },
    robots: isProductionSite()
      ? { index: true, follow: true }
      : { index: false, follow: false }
  };
}

export default function PrivacyPage() {
  return <PolicyDocument title={page.title} html={page.html} />;
}
