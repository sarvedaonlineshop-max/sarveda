import Image from "next/image";
import Link from "next/link";

import { fetchBlogBySlug } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media-cdn";

type Props = {
  slugs: string[];
};

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function articleExcerpt(post: { excerpt: string | null; content?: string | null }): string | null {
  const fromExcerpt = post.excerpt?.trim();
  if (fromExcerpt) return fromExcerpt;
  const fromContent = post.content ? stripHtmlToText(post.content) : "";
  if (!fromContent) return null;
  if (fromContent.length <= 180) return fromContent;
  return `${fromContent.slice(0, 180).replace(/\s+\S*$/, "")}…`;
}

function formatArticleDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export async function ProductRelatedArticles({ slugs }: Props) {
  const unique = Array.from(new Set(slugs.map((s) => s.trim()).filter(Boolean)));
  if (!unique.length) return null;

  const rows = await Promise.all(
    unique.slice(0, 6).map((slug) => fetchBlogBySlug(slug, { next: { revalidate: 300 } }))
  );
  const articles = rows.filter((post): post is NonNullable<typeof post> => Boolean(post));
  if (!articles.length) return null;

  return (
    <section className="border-t border-stone-200 pt-8">
      <h2 className="font-serif text-xl font-semibold text-stone-900">Related articles</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {articles.map((post) => {
          const thumb = post.imageUrl ? resolveMediaUrl(post.imageUrl) : null;
          const excerpt = articleExcerpt(post);
          const dateLabel = formatArticleDate(post.publishedAt);
          return (
            <li key={post.slug}>
              <Link
                href={`/${post.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
              >
                <div className="relative aspect-[16/9] w-full bg-stone-100">
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-medium uppercase tracking-wide text-stone-400">
                      Article
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                  <p className="font-medium text-stone-900 group-hover:text-emerald-800">{post.title}</p>
                  {excerpt ? <p className="line-clamp-3 text-sm leading-5 text-stone-600">{excerpt}</p> : null}
                  {dateLabel ? <p className="mt-auto pt-1 text-xs text-stone-500">{dateLabel}</p> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
