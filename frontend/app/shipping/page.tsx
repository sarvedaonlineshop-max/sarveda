import type { Metadata } from "next";

import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { getLegalPage } from "@/lib/legal-pages";
import { canonical, isProductionSite } from "@/lib/site";

const page = getLegalPage("shipping");

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Shipping Policy",
    description: "Shipping timelines, delivery zones, and shipping terms for Sarveda orders.",
    alternates: { canonical: canonical("/shipping") },
    robots: isProductionSite()
      ? { index: true, follow: true }
      : { index: false, follow: false }
  };
}

export default function ShippingPage() {
  return <PolicyDocument title={page.title} html={page.html} />;
}
