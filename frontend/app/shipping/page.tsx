import type { Metadata } from "next";

import { canonical } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Shipping Policy",
    description: "Shipping timelines, delivery zones, and shipping terms for Sarveda orders.",
    alternates: { canonical: canonical("/shipping") },
    robots: { index: true, follow: true }
  };
}

export default function ShippingPage() {
  return (
    <main className="min-h-[60vh] bg-stone-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="font-serif text-3xl font-semibold text-stone-900">Shipping Policy</h1>
        <p className="mt-4 text-stone-600">Content coming soon.</p>
      </div>
    </main>
  );
}
