import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchOfferBySlug } from "@/lib/api";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const offer = await fetchOfferBySlug(params.slug, { cache: "no-store" });
  if (!offer) return { title: "Offer" };
  const title = offer.seoTitle || offer.title;
  const description = offer.seoDescription || htmlToPlainText(offer.description ?? "");
  return {
    title,
    description: description || undefined,
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/offers/${params.slug}`) }
  };
}

export default async function OfferPage({ params }: Props) {
  const offer = await fetchOfferBySlug(params.slug, { cache: "no-store" });
  if (!offer) notFound();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/") },
          { name: offer.title, url: absoluteUrl(`/offers/${offer.slug}`) }
        ])}
      />
      <div className="border-b border-[rgba(196,176,232,0.25)] bg-brand-bg">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Offers", href: "/shop" },
              { label: offer.title }
            ]}
          />
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="display-text font-serif text-3xl font-semibold text-brand-ink">{offer.title}</h1>
        {offer.description ? (
          <p className="mt-8 max-w-2xl text-lg text-brand-mid">{offer.description}</p>
        ) : null}
      </main>
    </>
  );
}
