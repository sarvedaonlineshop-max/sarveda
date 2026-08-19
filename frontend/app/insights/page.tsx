import type { Metadata } from "next";
import Link from "next/link";

import { InsightCard } from "@/components/content/InsightCard";
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
      <div
        className="border-b-[3px] border-brand-gold"
        style={{ background: "linear-gradient(160deg, #157a4a 0%, #0f5c38 100%)" }}
      >
        <div className="page-shell-classic py-8 lg:py-10">
          <p className="sv-listing-hero-fade text-[10px] font-bold uppercase tracking-[0.22em] text-brand-gold-pale">
            From our teachers
          </p>
          <h1 className="sv-listing-hero-fade mt-2.5 font-serif text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-[#fffbf5]">
            Insights
          </h1>
          <p className="sv-listing-hero-fade-late mt-2.5 max-w-2xl text-base leading-relaxed text-white/75">
            Stories and guides on yoga, Ayurveda, sound healing, and living with intention.
          </p>
          <div className="sv-listing-hero-fade-late mt-3.5 h-0.5 w-12 bg-brand-gold" />
        </div>
      </div>

      <main className="page-shell-classic py-14">
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-brand-cream-dark bg-white p-12 text-center text-brand-muted">
            Articles are being updated.{" "}
            <Link href="/shop" className="font-medium text-brand-gold underline hover:text-brand-forest">
              Browse the shop
            </Link>
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2">
            {posts.map((post) => (
              <li key={post.id}>
                <InsightCard post={post} />
              </li>
            ))}
          </ul>
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
