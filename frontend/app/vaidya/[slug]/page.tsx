import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchVaidyaBySlug } from "@/lib/api";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const vaidya = await fetchVaidyaBySlug(params.slug, { cache: "no-store" });
  if (!vaidya) return { title: "Vaidya" };
  const title = vaidya.seoTitle || vaidya.name;
  const description = vaidya.seoDescription || htmlToPlainText(vaidya.bio ?? "");
  return {
    title,
    description: description || undefined,
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/vaidya/${params.slug}`) }
  };
}

export default async function VaidyaPage({ params }: Props) {
  const vaidya = await fetchVaidyaBySlug(params.slug, { cache: "no-store" });
  if (!vaidya) notFound();

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Vaidyas", url: absoluteUrl("/vaidya") },
    { name: vaidya.name, url: absoluteUrl(`/vaidya/${vaidya.slug}`) }
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Vaidyas", href: "/vaidya" },
              { label: vaidya.name }
            ]}
          />
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[280px_1fr]">
          {vaidya.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vaidya.photoUrl}
              alt={vaidya.name}
              className="aspect-square w-full max-w-xs rounded-2xl object-cover"
            />
          ) : null}
          <div>
            <h1 className="font-serif text-3xl font-semibold text-stone-900">{vaidya.name}</h1>
            {vaidya.speciality ? <p className="mt-2 text-amber-800">{vaidya.speciality}</p> : null}
            {vaidya.bio ? (
              <div className="mt-8">
                <ProductRichText html={vaidya.bio} />
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
