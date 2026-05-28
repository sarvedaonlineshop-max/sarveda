import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductDetailExperience } from "@/components/product/ProductDetailExperience";
import { RelatedProducts } from "@/components/product/RelatedProducts";
import { fetchAllProductSlugs, fetchProductBySlug, fetchRelatedProducts, skipBuildTimeStaticParams } from "@/lib/api";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

function productMetaDescription(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const plain = htmlToPlainText(raw);
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain;
}

export const dynamicParams = true;
export const revalidate = 300;

export async function generateStaticParams() {
  if (skipBuildTimeStaticParams()) return [];
  const slugs = await fetchAllProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

type Props = {
  params: { slug: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await fetchProductBySlug(params.slug, { next: { revalidate: 300 } });
  if (!product) {
    return { title: "Product" };
  }
  const title = product.seoTitle || product.name;
  const description = productMetaDescription(
    product.seoDescription || product.shortDescription || product.description
  );
  return {
    title,
    description,
    keywords: product.seoKeyword ? product.seoKeyword.split(",").map((keyword) => keyword.trim()) : undefined,
    openGraph: {
      // Next.js metadata validator only allows a fixed OpenGraph type set.
      // Keep product semantics in JSON-LD; use a supported OG type to avoid runtime 500s.
      type: "website",
      url: canonical(`/product/${params.slug}`),
      title,
      description,
      images: product.images[0]?.url ? [{ url: product.images[0].url }] : undefined,
      siteName: "Sarveda"
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: product.images[0]?.url ? [product.images[0].url] : ["/og-default.jpg"]
    },
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: {
      canonical: canonical(`/product/${params.slug}`)
    }
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const product = await fetchProductBySlug(params.slug, { next: { revalidate: 300 } });
  if (!product) {
    notFound();
  }

  const primaryCategory = product.categories[0]?.category;
  const pairWithItems = await fetchRelatedProducts(product.slug, primaryCategory?.slug, {
    next: { revalidate: 120 }
  });

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Shop", url: absoluteUrl("/shop") },
    ...(primaryCategory
      ? [
          {
            name: primaryCategory.name,
            url: absoluteUrl(`/product-category/${primaryCategory.slug}`)
          }
        ]
      : []),
    { name: product.name, url: absoluteUrl(`/product/${product.slug}`) }
  ];

  return (
    <>
      <JsonLd data={[productJsonLd(product), breadcrumbJsonLd(breadcrumbItems)]} />
      <div className="hidden border-b border-stone-100 bg-white md:block">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              ...(primaryCategory
                ? [
                    {
                      label: primaryCategory.name,
                      href: `/product-category/${primaryCategory.slug}`
                    }
                  ]
                : []),
              { label: product.name }
            ]}
          />
        </div>
      </div>

      <main className="bg-white">
        <ProductDetailExperience product={product} pairWithItems={pairWithItems} />
      </main>

      <RelatedProducts excludeSlug={product.slug} categorySlug={primaryCategory?.slug} />
    </>
  );
}
