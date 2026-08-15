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
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="page-shell py-5">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Offers", href: "/shop" },
              { label: offer.title }
            ]}
          />
        </div>
      </div>
      <main className="page-shell py-8">
        <h1 className="font-serif text-3xl font-semibold text-stone-900">{offer.title}</h1>
        {offer.description ? (
          <p className="mt-8 max-w-2xl text-lg text-stone-700">{offer.description}</p>
        ) : null}
      </main>
    </>
  );
}
