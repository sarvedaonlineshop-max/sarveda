import Image from "next/image";
import Link from "next/link";

import type { BlogListItem } from "@/lib/blog-types";

function Flourish() {
  return (
    <svg viewBox="0 0 120 20" className="mx-auto mt-3 h-4 w-28 text-brand-gold" fill="none" aria-hidden>
      <path
        d="M8 10h28M84 10h28M52 10c-6-8 6-8 0 0 6 8-6 8 0 0M60 10c-6-8 6-8 0 0 6 8-6 8 0 0M68 10c-6-8 6-8 0 0 6 8-6 8 0 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="60" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
}

type Props = { posts: BlogListItem[] };

export function HomeJournal({ posts }: Props) {
  const cards = posts.slice(0, 3);
  if (cards.length === 0) return null;

  return (
    <section className="bg-[#f9f6f0] py-14 md:py-16 lg:py-20" aria-labelledby="home-journal-heading">
      <div className="page-shell">
        <div className="text-center">
          <h2
            id="home-journal-heading"
            className="font-serif text-[1.65rem] font-semibold tracking-tight text-brand-ink sm:text-3xl md:text-[2.15rem]"
          >
            From the <span className="text-brand-gold">Journal</span>
          </h2>
          <Flourish />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-brand-ink/70 sm:text-[0.95rem]">
            Practical guides and teachings on sound, yoga, mindfulness and conscious living.
          </p>
        </div>

        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-7">
          {cards.map((post) => {
            const category = post.seoKeyword?.trim() || "Insights";
            const date = formatDate(post.publishedAt);
            return (
              <li key={post.id}>
                <Link href={`/${post.slug}`} className="group flex h-full flex-col">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-brand-cream">
                    {post.imageUrl ? (
                      <Image
                        src={post.imageUrl}
                        alt={post.title}
                        fill
                        sizes="(max-width: 1024px) 90vw, 28vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 bg-brand-forest/20" />
                    )}
                  </div>
                  <p className="mt-4 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-brand-sage">
                    {category}
                  </p>
                  <h3 className="mt-1.5 font-serif text-lg font-semibold leading-snug text-brand-ink group-hover:text-brand-forest sm:text-xl">
                    {post.title}
                  </h3>
                  {post.excerpt ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-brand-ink/65">
                      {post.excerpt}
                    </p>
                  ) : null}
                  {date ? (
                    <p className="mt-3 text-xs text-brand-muted">{date}</p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-10 text-center md:mt-12">
          <Link
            href="/insights"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#3d2e24] px-8 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-[#2c211a]"
          >
            Explore our Latest Insights
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
