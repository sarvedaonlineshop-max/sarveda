import Image from "next/image";
import Link from "next/link";

import { fetchBlogBySlug } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media-cdn";

type Props = {
  slugs: string[];
};

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
      <ul className="mt-4 space-y-3">
        {articles.map((post) => {
          const thumb = post.imageUrl ? resolveMediaUrl(post.imageUrl) : null;
          return (
            <li key={post.slug}>
              <Link
                href={`/${post.slug}`}
                className="group flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-2.5 pr-4 transition-colors hover:border-sky-300 hover:bg-sky-50/40"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-stone-100 sm:h-[4.5rem] sm:w-[4.5rem]">
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt=""
                      fill
                      sizes="72px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-medium uppercase tracking-wide text-stone-400">
                      Article
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sky-700 underline-offset-2 group-hover:underline">
                    {post.title}
                  </p>
                  {post.excerpt ? (
                    <p className="mt-1 line-clamp-2 text-sm text-stone-600">{post.excerpt}</p>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
