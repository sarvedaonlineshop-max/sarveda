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
      className={`group relative block overflow-hidden rounded-sm bg-stone-900 shadow-md transition hover:shadow-xl ${heightClass}`}
    >
      {post.imageUrl ? (
        <Image
          src={post.imageUrl}
          alt={post.title}
          fill
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a2f] to-[#0f1a14]" />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.08) 80%, transparent 100%)"
        }}
      />

      <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#108967]">{category}</p>
        <h3 className="mt-2 font-serif text-lg font-semibold leading-snug md:text-xl">{post.title}</h3>
        {post.excerpt ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-white/85">{post.excerpt}</p>
        ) : null}
      </div>
    </Link>
  );
}
