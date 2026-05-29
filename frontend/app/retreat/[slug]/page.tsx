import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchRetreatBySlug } from "@/lib/api";
import { formatINRFromPaise } from "@/lib/money";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const retreat = await fetchRetreatBySlug(params.slug, { cache: "no-store" });
  if (!retreat) return { title: "Retreat" };
  const title = retreat.seoTitle || retreat.title;
  const description = retreat.seoDescription || htmlToPlainText(retreat.description ?? "");
  return {
    title,
    description: description || undefined,
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/retreat/${params.slug}`) }
  };
}

export default async function RetreatPage({ params }: Props) {
  const retreat = await fetchRetreatBySlug(params.slug, { cache: "no-store" });
  if (!retreat) notFound();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/") },
          { name: "Retreats", url: absoluteUrl("/retreat") },
          { name: retreat.title, url: absoluteUrl(`/retreat/${retreat.slug}`) }
        ])}
      />
      <div className="border-b border-[rgba(196,176,232,0.25)] bg-brand-bg">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Retreats", href: "/retreat" },
              { label: retreat.title }
            ]}
          />
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {retreat.imageUrl ? (
          <div className="mb-8 overflow-hidden rounded-2xl border border-[rgba(196,176,232,0.25)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={retreat.imageUrl} alt="" className="max-h-[420px] w-full object-cover" />
          </div>
        ) : null}
        <h1 className="display-text font-serif text-3xl font-semibold text-brand-ink md:text-4xl">{retreat.title}</h1>
        <p className="mt-3 text-brand-mid">
          {[retreat.location, retreat.duration].filter(Boolean).join(" · ")}
          {retreat.priceInPaise
            ? ` · ${formatINRFromPaise(retreat.priceInPaise)}`
            : " · Enquire for pricing"}
        </p>
        {retreat.description ? (
          <div className="mt-10 max-w-3xl">
            <ProductRichText html={retreat.description} />
          </div>
        ) : null}
      </main>
    </>
  );
}
