import Link from "next/link";

import type { BlogListItem } from "@/lib/blog-types";

type Props = {
  post: BlogListItem;
  compact?: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
}

export function InsightCard({ post }: Props) {
  const category = post.seoKeyword?.trim() || "Insights";
  const date = formatDate(post.publishedAt);

  return (
    <Link href={`/${post.slug}`} className="group flex h-full flex-col">
      <div className="overflow-hidden bg-[#f4efe6]">
        {post.imageUrl ? (
          <img
            src={post.imageUrl}
            alt={post.title}
            className="block h-auto w-full object-contain object-top"
          />
        ) : (
          <div className="aspect-[16/9] bg-brand-forest/20" />
        )}
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-sage">
        {category}
      </p>
      <h3 className="mt-1.5 font-serif text-xl font-semibold leading-snug text-brand-ink group-hover:text-brand-forest">
        {post.title}
      </h3>
      {post.excerpt ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-brand-ink/70">{post.excerpt}</p>
      ) : null}
      {date ? <p className="mt-3 text-xs text-brand-muted">{date}</p> : null}
    </Link>
  );
}
