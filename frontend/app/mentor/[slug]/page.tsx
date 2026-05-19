import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchMentorBySlug } from "@/lib/api";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const mentor = await fetchMentorBySlug(params.slug, { cache: "no-store" });
  if (!mentor) return { title: "Mentor" };
  const title = mentor.seoTitle || mentor.name;
  const description = mentor.seoDescription || htmlToPlainText(mentor.bio ?? "");
  return {
    title,
    description: description || undefined,
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/mentor/${params.slug}`) }
  };
}

export default async function MentorPage({ params }: Props) {
  const mentor = await fetchMentorBySlug(params.slug, { cache: "no-store" });
  if (!mentor) notFound();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/") },
          { name: "Mentors", url: absoluteUrl("/mentor") },
          { name: mentor.name, url: absoluteUrl(`/mentor/${mentor.slug}`) }
        ])}
      />
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Mentors", href: "/mentor" },
              { label: mentor.name }
            ]}
          />
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[280px_1fr]">
          {mentor.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mentor.photoUrl}
              alt={mentor.name}
              className="aspect-square w-full max-w-xs rounded-2xl object-cover"
            />
          ) : null}
          <div>
            <h1 className="font-serif text-3xl font-semibold text-stone-900">{mentor.name}</h1>
            {mentor.expertise ? <p className="mt-2 text-amber-800">{mentor.expertise}</p> : null}
            {mentor.bio ? (
              <div className="mt-8">
                <ProductRichText html={mentor.bio} />
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
