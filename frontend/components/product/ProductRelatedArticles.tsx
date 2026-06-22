import Link from "next/link";

import { fetchBlogBySlug } from "@/lib/api";

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
        {articles.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/${post.slug}`}
              className="group block rounded-lg border border-stone-200 bg-white px-4 py-3 hover:border-[#c45a2a]/40"
            >
              <p className="font-medium text-stone-900 group-hover:text-[#c45a2a]">{post.title}</p>
              {post.excerpt ? (
                <p className="mt-1 line-clamp-2 text-sm text-stone-600">{post.excerpt}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
