import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchCmsPageBySlug, fetchCmsPageSlugs } from "@/lib/api";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const dynamicParams = true;
export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await fetchCmsPageSlugs({ next: { revalidate: 3600 } });
  return slugs.map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

function metaDescription(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const plain = htmlToPlainText(raw);
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await fetchCmsPageBySlug(params.slug, { next: { revalidate: 300 } });
  if (!page) return { title: "Page" };
  const title = page.seoTitle || page.title;
  const description = metaDescription(page.seoDescription || page.content);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: page.imageUrl ? [{ url: page.imageUrl }] : undefined,
      siteName: "Sarveda"
    },
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/${params.slug}`) }
  };
}

export default async function CmsPageRoute({ params }: Props) {
  const page = await fetchCmsPageBySlug(params.slug, { next: { revalidate: 300 } });
  if (!page) notFound();

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    { name: page.title, url: absoluteUrl(`/${page.slug}`) }
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />

      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-6 lg:px-8">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: page.title }]} />
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
          {page.title}
        </h1>
        {page.imageUrl ? (
          <div className="mt-8 overflow-hidden rounded-2xl border border-stone-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.imageUrl} alt="" className="w-full object-cover" />
          </div>
        ) : null}
        {page.content ? (
          <div className="mt-10 max-w-3xl">
            <ProductRichText html={page.content} />
          </div>
        ) : null}
      </main>
    </>
  );
}
