import type { Metadata } from "next";
import Link from "next/link";

import { InsightCard } from "@/components/content/InsightCard";
import { ContentCardGrid } from "@/components/content/ContentListingSection";
import { fetchBlogPosts } from "@/lib/api";
import { canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Insights",
  description: "Articles on yoga, Ayurveda, meditation, sound healing, and conscious living from Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/insights") }
};

export default async function InsightsPage() {
  const posts = await fetchBlogPosts({ cache: "no-store" });

  return (
    <>
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            Insights
          </h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Stories and guides on yoga, Ayurveda, sound healing, and living with intention.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Articles are being updated.{" "}
            <Link href="/shop" className="font-medium text-amber-800 underline">
              Browse the shop
            </Link>
          </p>
        ) : (
          <ContentCardGrid>
            {posts.map((post) => (
              <li key={post.id}>
                <InsightCard post={post} />
              </li>
            ))}
          </ContentCardGrid>
        )}
      </main>
    </>
  );
}
