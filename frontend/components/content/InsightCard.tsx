import Image from "next/image";
import Link from "next/link";

import type { BlogListItem } from "@/lib/blog-types";

type Props = {
  post: BlogListItem;
  compact?: boolean;
};

export function InsightCard({ post, compact = false }: Props) {
  const category = post.seoKeyword?.trim() || "Insights";
  const heightClass = compact ? "min-h-[340px]" : "min-h-[400px] md:min-h-[440px]";

  return (
    <Link
      href={`/${post.slug}`}
      className={`group relative block overflow-hidden rounded-3xl bg-brand-night shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover ${heightClass}`}
    >
      {post.imageUrl ? (
        <Image
          src={post.imageUrl}
          alt={post.title}
          fill
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-forest-gradient" />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(16,32,26,0.92) 0%, rgba(16,32,26,0.45) 50%, rgba(16,32,26,0.08) 80%, transparent 100%)"
        }}
      />

      <div className="absolute inset-x-0 bottom-0 p-5 text-brand-cream md:p-6">
        <span className="inline-flex rounded-full border border-brand-gold-pale/30 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-gold-pale backdrop-blur-sm">
          {category}
        </span>
        <h3 className="mt-3 font-serif text-xl font-semibold leading-snug tracking-tight md:text-[1.35rem]">{post.title}</h3>
        {post.excerpt ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-brand-cream/80">{post.excerpt}</p>
        ) : null}
      </div>
    </Link>
  );
}
