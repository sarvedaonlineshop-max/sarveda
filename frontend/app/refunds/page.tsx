import type { Metadata } from "next";

import { canonical } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Refund Policy",
    description: "Sarveda refund and return policy details for eligible products and orders.",
    alternates: { canonical: canonical("/refunds") },
    robots: { index: true, follow: true }
  };
}

export default function RefundsPage() {
  return (
    <main className="min-h-[60vh] bg-stone-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="font-serif text-3xl font-semibold text-stone-900">Refund Policy</h1>
        <p className="mt-4 text-stone-600">Content coming soon.</p>
      </div>
    </main>
  );
}
