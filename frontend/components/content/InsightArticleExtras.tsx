import Image from "next/image";
import Link from "next/link";

import { InsightShareBar } from "@/components/content/InsightShareBar";
import type { BlogListItem } from "@/lib/blog-types";
import { absoluteUrl } from "@/lib/site";

function insightTags(seoKeyword: string | null, title: string): string[] {
  const raw = seoKeyword?.trim();
  if (!raw || raw.toLowerCase() === title.toLowerCase()) {
    return ["Sound Healing"];
  }
  const parts = raw
    .split(/[,|/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.toLowerCase() !== title.toLowerCase());
  if (!parts.length) return ["Sound Healing"];
  return parts.slice(0, 3).map((part) =>
    part
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
  );
}

function RelatedCard({ post }: { post: BlogListItem }) {
  const subtitle = post.excerpt?.trim() || post.seoKeyword?.trim() || null;

  return (
    <Link
      href={`/${post.slug}`}
      className="group relative block aspect-[16/10] overflow-hidden rounded-xl bg-brand-forest"
    >
      {post.imageUrl ? (
        <Image
          src={post.imageUrl}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 40vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          unoptimized
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-center sm:p-6">
        <h3 className="font-serif text-lg font-semibold leading-snug text-white sm:text-xl">
          {post.title}
        </h3>
        {subtitle ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-white/80">{subtitle}</p>
        ) : null}
      </div>
    </Link>
  );
}

type Props = {
  slug: string;
  title: string;
  seoKeyword: string | null;
  related: BlogListItem[];
};

export function InsightArticleExtras({ slug, title, seoKeyword, related }: Props) {
  const url = absoluteUrl(`/${slug}`);
  const tags = insightTags(seoKeyword, title);

  return (
    <div className="mx-auto mt-12 max-w-3xl space-y-10">
      <InsightShareBar url={url} title={title} />

      <div className="border-t border-brand-cream-dark pt-8">
        <p className="font-sans text-sm font-semibold text-brand-ink">Tags:</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag}>
              <span className="inline-flex rounded-md bg-[#c45a2a] px-3 py-1.5 text-xs font-semibold text-white">
                {tag}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {related.length > 0 ? (
        <section className="border-t border-brand-cream-dark pt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="font-serif text-2xl font-semibold text-brand-ink">Related Insights</h2>
            <Link
              href="/insights"
              className="shrink-0 text-sm font-semibold text-brand-forest underline-offset-2 hover:underline"
            >
              View All
            </Link>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2">
            {related.map((post) => (
              <li key={post.id}>
                <RelatedCard post={post} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
