import type { Metadata } from "next";

import { ContactPageClient } from "@/components/contact/ContactPageClient";
import { canonical, isProductionSite } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Contact Us",
    description: "Get help with your Sarveda order, delivery, or product questions.",
    alternates: { canonical: canonical("/contact") },
    robots: isProductionSite()
      ? { index: true, follow: true }
      : { index: false, follow: false }
  };
}

export default function ContactPage() {
  return <ContactPageClient />;
}
