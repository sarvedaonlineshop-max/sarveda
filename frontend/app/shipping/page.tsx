import type { Metadata } from "next";

import { canonical, isProductionSite } from "@/lib/site";

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
  return (
    <main className="min-h-[60vh] bg-brand-bg px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white p-8 shadow-sm">
        <h1 className="display-text font-serif text-3xl font-semibold text-brand-ink">Shipping Policy</h1>
        <p className="mt-4 text-brand-mid">Content coming soon.</p>
      </div>
    </main>
  );
}
