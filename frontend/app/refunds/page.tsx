import type { Metadata } from "next";

import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { getLegalPage } from "@/lib/legal-pages";
import { canonical, isProductionSite } from "@/lib/site";

const page = getLegalPage("refunds");

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Refund Policy",
    description: "Sarveda refund and return policy details for eligible products and orders.",
    alternates: { canonical: canonical("/refunds") },
    robots: isProductionSite()
      ? { index: true, follow: true }
      : { index: false, follow: false }
  };
}

export default function RefundsPage() {
  return <PolicyDocument title={page.title} html={page.html} />;
}
