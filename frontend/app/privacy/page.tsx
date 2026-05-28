import type { Metadata } from "next";

import { canonical, isProductionSite } from "@/lib/site";

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
  return (
    <main className="min-h-[60vh] bg-stone-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="font-serif text-3xl font-semibold text-stone-900">Privacy Policy</h1>
        <p className="mt-4 text-stone-600">Content coming soon.</p>
      </div>
    </main>
  );
}
