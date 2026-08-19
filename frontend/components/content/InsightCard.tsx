import Image from "next/image";
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

function categoryLabel(post: BlogListItem) {
  const raw = post.seoKeyword?.trim();
  if (!raw || raw.toLowerCase() === post.title.toLowerCase()) return "Music & Sound Therapy";
  if (raw.length > 42) return "Music & Sound Therapy";
  return raw;
}

export function InsightCard({ post }: Props) {
  const category = categoryLabel(post);
  const date = formatDate(post.publishedAt);

  return (
    <Link href={`/${post.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-brand-cream-dark bg-white shadow-card transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#f4efe6]">
        {post.imageUrl ? (
          <Image
            src={post.imageUrl}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-brand-forest/20" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-sage">
          {category}
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold leading-snug text-brand-ink group-hover:text-brand-forest">
          {post.title}
        </h3>
        {post.excerpt ? (
          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-brand-ink/70">{post.excerpt}</p>
        ) : null}
        {date ? <p className="mt-4 text-xs text-brand-muted">{date}</p> : null}
      </div>
    </Link>
  );
}
