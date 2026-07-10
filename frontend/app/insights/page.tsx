import type { Metadata } from "next";
import Link from "next/link";

import { InsightCard } from "@/components/content/InsightCard";
import { ContentCardGrid } from "@/components/content/ContentListingSection";
import { EnquiryPanelForm } from "@/components/enquiries/EnquiryPanelForm";
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
      <div className="border-b border-brand-cream-dark/60 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">
            From our teachers
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            Insights
          </h1>
          <p className="mt-3 max-w-2xl text-brand-muted">
            Stories and guides on yoga, Ayurveda, sound healing, and living with intention.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-brand-cream-dark bg-white p-12 text-center text-brand-muted">
            Articles are being updated.{" "}
            <Link href="/shop" className="font-medium text-brand-gold underline hover:text-brand-forest">
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
        <section className="mt-16 rounded-2xl border border-brand-cream-dark bg-white p-6 shadow-card sm:p-8">
          <EnquiryPanelForm
            source="INSIGHTS"
            title="Questions or story ideas?"
            subtitle="Reach our editorial team — we reply by email."
          />
        </section>
      </main>
    </>
  );
}
