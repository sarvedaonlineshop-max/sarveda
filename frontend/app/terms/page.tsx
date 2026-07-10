import type { Metadata } from "next";

import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { getLegalPage } from "@/lib/legal-pages";
import { canonical, isProductionSite } from "@/lib/site";

const page = getLegalPage("terms");

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Terms of Service",
    description: "Read the terms and conditions for using Sarveda's website and services.",
    alternates: { canonical: canonical("/terms") },
    robots: isProductionSite()
      ? { index: true, follow: true }
      : { index: false, follow: false }
  };
}

export default function TermsPage() {
  return <PolicyDocument title={page.title} html={page.html} />;
}
