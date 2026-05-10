import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccordionDescription } from "@/components/product/AccordionDescription";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductAudio } from "@/components/product/ProductAudio";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductPurchaseSection } from "@/components/product/ProductPurchaseSection";
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
    keywords: product.seoKeyword ? product.seoKeyword.split(",").map((k) => k.trim()) : undefined,
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
      <div className="border-b border-stone-100 bg-stone-50">
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

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-12">
          <ProductGallery images={product.images} productName={product.name} />

          <div className="flex flex-col gap-8">
            <div>
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
                {product.name}
              </h1>
              {product.shortDescription ? (
                <p className="mt-4 text-lg leading-relaxed text-stone-500">{product.shortDescription}</p>
              ) : null}
            </div>

            {product.hasAudio && product.audioUrl ? (
              <ProductAudio audioUrl={product.audioUrl} title={product.name} />
            ) : null}

            <ProductPurchaseSection
              productSlug={product.slug}
              productName={product.name}
              variants={product.variants}
              primaryImageUrl={product.images[0]?.url ?? null}
            />

            {product.description ? (
              <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
                <h2 className="font-serif text-xl font-semibold text-stone-900">About</h2>
                <RichProductBody html={product.description} />
              </section>
            ) : null}

            <section>
              <h2 className="mb-4 font-serif text-xl font-semibold text-stone-900">Details</h2>
              <AccordionDescription items={product.accordionItems} />
            </section>
          </div>
        </div>
      </main>

      <RelatedProducts excludeSlug={product.slug} categorySlug={primaryCategory?.slug} />
    </>
  );
}

function RichProductBody({ html }: { html: string }) {
  const looksHtml = /<[a-z][\s\S]*>/i.test(html.trim());
  if (looksHtml) {
    return (
      <div
        className="mt-4 prose prose-stone max-w-none prose-p:text-stone-600 prose-headings:font-serif prose-headings:text-stone-900"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <p className="mt-4 whitespace-pre-wrap leading-relaxed text-stone-600">{html}</p>;
}
