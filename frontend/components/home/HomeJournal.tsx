import Image from "next/image";
import Link from "next/link";

import { SectionFlourish } from "@/components/brand/SectionFlourish";
import type { BlogListItem } from "@/lib/blog-types";

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
    <section className="bg-[#F7F7F2] py-14 md:py-16 lg:py-20" aria-labelledby="home-journal-heading">
      <div className="page-shell">
        <div className="text-center">
          <h2
            id="home-journal-heading"
            className="font-serif text-[1.65rem] font-semibold tracking-tight sm:text-3xl md:text-[2.15rem]"
          >
            <span style={{ color: "#166D46" }}>From the</span>{" "}
            <span className="text-brand-gold">Journal</span>
          </h2>
          <SectionFlourish />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[#4a453c] sm:text-[0.95rem]">
            Practical guides and teachings on sound, yoga, mindfulness and conscious living.
          </p>
        </div>

        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-7">
          {cards.map((post) => {
            const category = post.seoKeyword?.trim() || "Insights";
            const date = formatDate(post.publishedAt);
            return (
              <li key={post.id}>
                <Link
                  href={`/${post.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-card transition-shadow hover:shadow-card-hover"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-brand-cream">
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
                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-brand-sage">
                      {category}
                    </p>
                    <h3 className="mt-1.5 font-serif text-lg font-semibold leading-snug text-brand-ink group-hover:text-brand-forest sm:text-xl">
                      {post.title}
                    </h3>
                    {post.excerpt ? (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#4a453c]">
                        {post.excerpt}
                      </p>
                    ) : null}
                    {date ? <p className="mt-3 text-xs text-brand-muted">{date}</p> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-10 text-center md:mt-12">
          <Link
            href="/insights"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold tracking-wide text-white transition-colors hover:brightness-95"
            style={{ backgroundColor: "#166D46" }}
          >
            Explore our Latest Insights
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
