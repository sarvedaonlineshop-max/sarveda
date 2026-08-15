import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentHeroBanner } from "@/components/content/ContentHeroBanner";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductRichText } from "@/components/product/ProductRichText";
import { CorporateProgramPage } from "@/components/cms/CorporateProgramPage";
import { CorporateWellnessPage } from "@/components/cms/CorporateWellnessPage";
import { getCorporateProgramPage, isCorporateProgramSlug } from "@/lib/corporate-program-pages-data";
import { JsonLd } from "@/components/seo/JsonLd";
import type { BlogDetail } from "@/lib/blog-types";
import type { CmsPage } from "@/lib/cms-types";
import {
  fetchBlogBySlug,
  fetchBlogSlugs,
  fetchCmsPageBySlug,
  fetchCmsPageSlugs,
  skipBuildTimeStaticParams
} from "@/lib/api";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const dynamicParams = true;
export const revalidate = 300;

export async function generateStaticParams() {
  if (skipBuildTimeStaticParams()) return [];
  const [cmsSlugs, blogSlugs] = await Promise.all([
    fetchCmsPageSlugs({ next: { revalidate: 3600 } }),
    fetchBlogSlugs({ next: { revalidate: 3600 } })
  ]);
  const slugs = Array.from(new Set([...cmsSlugs, ...blogSlugs]));
  return slugs.map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

type ContentPage = {
  slug: string;
  title: string;
  content: string | null;
  imageUrl: string | null;
  template: string | null;
  extra: Record<string, unknown> | null;
  seoTitle: string | null;
  seoDescription: string | null;
  kind: "cms" | "blog";
  publishedAt: string | null;
};

function metaDescription(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const plain = htmlToPlainText(raw);
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain;
}

function fromCmsPage(page: CmsPage): ContentPage {
  return {
    slug: page.slug,
    title: page.title,
    content: page.content,
    imageUrl: page.imageUrl,
    template: page.template,
    extra: page.extra,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    kind: "cms",
    publishedAt: null
  };
}

function fromBlogPost(post: BlogDetail): ContentPage {
  return {
    slug: post.slug,
    title: post.title,
    content: post.content,
    imageUrl: post.imageUrl,
    template: null,
    extra: null,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    kind: "blog",
    publishedAt: post.publishedAt
  };
}

function isCorporateWellnessPage(page: CmsPage): boolean {
  return page.slug === "corporate-wellness" || Boolean(page.template?.includes("corporate-wellness"));
}

async function resolveContent(slug: string): Promise<{ page: ContentPage; cmsPage: CmsPage | null } | null> {
  const cmsPage = await fetchCmsPageBySlug(slug, { next: { revalidate: 300 } });
  if (cmsPage) return { page: fromCmsPage(cmsPage), cmsPage };
  const post = await fetchBlogBySlug(slug, { next: { revalidate: 300 } });
  if (post) return { page: fromBlogPost(post), cmsPage: null };
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const program = getCorporateProgramPage(params.slug);
  const resolved = await resolveContent(params.slug);
  if (!resolved && program) {
    const title = `${program.title} | Corporate Wellness`;
    return {
      title,
      description: program.hero.subtitle,
      openGraph: { title, description: program.hero.subtitle, siteName: "Sarveda" },
      robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
      alternates: { canonical: canonical(`/${params.slug}`) }
    };
  }
  if (!resolved) return { title: "Page" };
  const content = resolved.page;
  const title = content.seoTitle || content.title;
  const description = metaDescription(content.seoDescription || content.content);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: content.imageUrl ? [{ url: content.imageUrl }] : undefined,
      siteName: "Sarveda"
    },
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/${params.slug}`) }
  };
}

function formatPublishedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}

export default async function SlugContentPage({ params }: Props) {
  const programData = getCorporateProgramPage(params.slug);
  const resolved = await resolveContent(params.slug);
  if (!resolved && !programData) notFound();

  const content = resolved?.page;
  const cmsPage = resolved?.cmsPage ?? null;

  const isProgram = Boolean(programData && (cmsPage ? isCorporateProgramSlug(cmsPage.slug) : true));

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    ...(isProgram && programData
      ? [
          { name: "Corporate Wellness", url: absoluteUrl("/corporate-wellness") },
          { name: programData.title, url: absoluteUrl(`/${params.slug}`) }
        ]
      : content?.kind === "blog"
        ? [
            { name: "Insights", url: absoluteUrl("/insights") },
            { name: content.title, url: absoluteUrl(`/${content.slug}`) }
          ]
        : content
          ? [{ name: content.title, url: absoluteUrl(`/${content.slug}`) }]
          : [])
  ];

  const uiBreadcrumbs =
    isProgram && programData
      ? [
          { label: "Home", href: "/" },
          { label: "Corporate Wellness", href: "/corporate-wellness" },
          { label: programData.title }
        ]
      : content?.kind === "blog"
        ? [
            { label: "Home", href: "/" },
            { label: "Insights", href: "/insights" },
            { label: content.title }
          ]
        : content
          ? [{ label: "Home", href: "/" }, { label: content.title }]
          : [{ label: "Home", href: "/" }];

  if (programData && isProgram) {
    return (
      <>
        <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
        <div className="border-b border-brand-cream-dark/60 bg-white">
          <div className="page-shell py-5 md:py-6">
            <Breadcrumbs items={uiBreadcrumbs} />
          </div>
        </div>
        <CorporateProgramPage data={programData} />
      </>
    );
  }

  if (!content) notFound();

  if (cmsPage && isCorporateWellnessPage(cmsPage)) {
    return (
      <>
        <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
        <div className="border-b border-brand-cream-dark/60 bg-white">
          <div className="page-shell py-5 md:py-6">
            <Breadcrumbs items={uiBreadcrumbs} />
          </div>
        </div>
        <CorporateWellnessPage page={cmsPage} />
      </>
    );
  }

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />

      {content.kind === "blog" && content.imageUrl ? (
        <ContentHeroBanner src={content.imageUrl} alt={content.title} />
      ) : null}

      <div className="border-b border-brand-cream-dark/60 bg-white">
        <div className="page-shell py-5 md:py-6">
          <Breadcrumbs items={uiBreadcrumbs} />
        </div>
      </div>

      <main className="page-shell py-10 md:py-14">
        <div className={content.kind === "blog" ? "mx-auto max-w-prose" : undefined}>
          {content.kind === "blog" ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">
              <Link href="/insights" className="hover:underline">
                Insights
              </Link>
              {content.publishedAt ? (
                <>
                  {" "}
                  · {formatPublishedDate(content.publishedAt)}
                </>
              ) : null}
            </p>
          ) : null}
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            {content.title}
          </h1>
          {content.kind !== "blog" && content.imageUrl ? (
            <div className="mt-8 overflow-hidden rounded-2xl border border-brand-cream-dark bg-[#EDE4D3]">
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src={content.imageUrl}
                  alt={`${content.title} cover image`}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 896px, 100vw"
                />
              </div>
            </div>
          ) : null}
          {content.content ? (
            <div className="mt-10 max-w-prose">
              <ProductRichText html={content.content} className="leading-8" />
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
