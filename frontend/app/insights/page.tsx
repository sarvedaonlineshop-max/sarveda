import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageListHero } from "@/components/layout/PageListHero";
import type { BlogListItem } from "@/lib/blog-types";
import { fetchBlogPosts } from "@/lib/api";
import { canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Insights",
  description: "Articles on yoga, meditation, Ayurveda, sound healing, and mindful living from Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/insights") }
};

const categoryPill =
  "rounded-full border border-[rgba(196,176,232,0.22)] bg-transparent px-4 py-2 text-xs text-[rgba(90,72,128,0.7)] transition-all hover:border-[rgba(196,176,232,0.4)] hover:bg-[rgba(91,62,155,0.08)] hover:text-brand-violet";

const categoryPillActive =
  "rounded-full border border-[#9B82CC] bg-[rgba(91,62,155,0.08)] px-4 py-2 text-xs text-brand-violet";

const INSIGHT_TOPICS = ["All articles", "Yoga", "Ayurveda", "Sound healing", "Mindful living"];

function formatPublishedDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "";
  }
}

function estimateReadTime(excerpt: string | null): string {
  const words = (excerpt ?? "").split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(3, Math.ceil(words / 45) + 2);
  return `${minutes} min read`;
}

function InsightGridCard({ post }: { post: BlogListItem }) {
  return (
    <Link
      href={`/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory transition-shadow hover:shadow-card-hover"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-brand-violet-light">
        {post.imageUrl ? (
          <Image
            src={post.imageUrl}
            alt={post.title}
            fill
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-brand-muted">Sarveda</div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        {post.publishedAt ? (
          <p className="text-[10px] font-normal uppercase tracking-[0.16em] text-brand-violet">
            {formatPublishedDate(post.publishedAt)}
          </p>
        ) : null}
        <h2 className="display-text mt-2 text-xl font-normal leading-snug text-brand-ink group-hover:text-brand-violet">
          {post.title}
        </h2>
        {post.excerpt ? (
          <p className="mt-2 line-clamp-3 text-sm font-light leading-relaxed text-brand-mid">{post.excerpt}</p>
        ) : null}
        <p className="mt-3 text-xs font-light text-brand-muted">{estimateReadTime(post.excerpt)}</p>
      </div>
    </Link>
  );
}

function FeaturedArticle({ post }: { post: BlogListItem }) {
  return (
    <Link
      href={`/${post.slug}`}
      className="group mb-12 grid overflow-hidden rounded-[18px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory transition-shadow hover:shadow-card-hover md:grid-cols-2"
    >
      <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[320px]">
        {post.imageUrl ? (
          <Image
            src={post.imageUrl}
            alt={post.title}
            fill
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center bg-brand-violet-light text-brand-muted">
            Sarveda
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center p-6 md:p-10">
        <p className="text-[10px] font-normal uppercase tracking-[0.16em] text-brand-violet">Featured</p>
        <h2 className="display-text mt-3 text-[34px] font-normal leading-tight text-brand-ink group-hover:text-brand-violet">
          {post.title}
        </h2>
        {post.excerpt ? (
          <p className="mt-4 text-sm font-light leading-[1.75] text-brand-mid">{post.excerpt}</p>
        ) : null}
        <p className="mt-4 text-xs font-light text-brand-muted">{estimateReadTime(post.excerpt)}</p>
        <span className="mt-6 text-xs font-medium uppercase tracking-[0.12em] text-brand-violet">
          Read article →
        </span>
      </div>
    </Link>
  );
}

export default async function InsightsPage() {
  const posts = await fetchBlogPosts({ cache: "no-store" });
  const [featured, ...rest] = posts;

  return (
    <>
      <PageListHero
        eyebrow="Journal"
        title={
          <>
            Insights & <span className="italic text-brand-lavender">stories</span>
          </>
        }
        subtitle="Stories and guides on yoga, Ayurveda, sound healing, and living with intention."
      />

      <main className="bg-brand-bg mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap gap-2">
          {INSIGHT_TOPICS.map((topic, i) => (
            <span key={topic} className={i === 0 ? categoryPillActive : categoryPill}>
              {topic}
            </span>
          ))}
        </div>

        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[rgba(196,176,232,0.35)] bg-brand-ivory p-12 text-center text-brand-mid">
            Articles are being updated.{" "}
            <Link href="/shop" className="font-medium text-brand-violet underline hover:text-brand-violet-mid">
              Browse the shop
            </Link>
          </p>
        ) : (
          <>
            {featured ? <FeaturedArticle post={featured} /> : null}
            <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <li key={post.id}>
                  <InsightGridCard post={post} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
