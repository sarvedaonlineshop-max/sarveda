import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccordionDescription } from "@/components/product/AccordionDescription";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductAudio } from "@/components/product/ProductAudio";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductPurchaseSection } from "@/components/product/ProductPurchaseSection";
import { ProductRichText } from "@/components/product/ProductRichText";
import { RelatedProducts } from "@/components/product/RelatedProducts";
import { fetchAllProductSlugs, fetchProductBySlug } from "@/lib/api";

export const dynamicParams = true;
export const revalidate = 300;

export async function generateStaticParams() {
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
  const description = product.seoDescription || product.shortDescription || undefined;
  return {
    title,
    description,
    keywords: product.seoKeyword ? product.seoKeyword.split(",").map((keyword) => keyword.trim()) : undefined,
    openGraph: {
      title,
      description,
      images: product.images[0]?.url ? [{ url: product.images[0].url }] : undefined,
      siteName: "Sarveda"
    },
    alternates: {
      canonical: `https://sarveda.com/product/${params.slug}`
    }
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const product = await fetchProductBySlug(params.slug, { next: { revalidate: 300 } });
  if (!product) {
    notFound();
  }

  const primaryCategory = product.categories[0]?.category;

  return (
    <>
      <div className="hidden border-b border-stone-100 bg-stone-50 md:block">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              ...(primaryCategory
                ? [
                    {
                      label: primaryCategory.name,
                      href: `/shop?category=${encodeURIComponent(primaryCategory.slug)}`
                    }
                  ]
                : []),
              { label: product.name }
            ]}
          />
        </div>
      </div>

      <main className="mx-auto max-w-7xl md:px-4 md:py-8 lg:px-8">
        <div className="grid gap-0 md:gap-10 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-12">
          <ProductGallery images={product.images} productName={product.name} />

          <div className="flex flex-col gap-6 px-4 py-6 md:gap-8 md:px-0 md:py-0">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
                {product.name}
              </h1>
              {product.shortDescription ? (
                <ProductRichText html={product.shortDescription} className="mt-3 text-stone-600 md:text-lg" />
              ) : null}
            </div>

            {product.hasAudio && product.audioUrl ? (
              <ProductAudio audioUrl={product.audioUrl} title={product.name} />
            ) : null}

            <ProductPurchaseSection productName={product.name} variants={product.variants} />

            {product.description ? (
              <section className="rounded-none border-y border-stone-200 bg-white p-4 md:rounded-2xl md:border md:border-stone-100 md:p-6 md:shadow-sm">
                <h2 className="text-lg font-semibold text-stone-900">About</h2>
                <ProductRichText html={product.description} className="mt-4" />
              </section>
            ) : null}

            <section className="px-0 md:px-0">
              <h2 className="mb-4 text-lg font-semibold text-stone-900">Product details</h2>
              <AccordionDescription items={product.accordionItems} />
            </section>
          </div>
        </div>
      </main>

      <RelatedProducts excludeSlug={product.slug} categorySlug={primaryCategory?.slug} />
    </>
  );
}
