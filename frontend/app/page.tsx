import type { Metadata } from "next";
import Link from "next/link";

import { HomeExperienceSections } from "@/components/home/HomeExperienceSections";
import { HomeHero } from "@/components/home/HomeHero";
import { JsonLd } from "@/components/seo/JsonLd";
import { NewsletterForm }      from "@/components/home/NewsletterForm";
import { ProductCard }         from "@/components/shop/ProductCard";
import { categoryEmoji }       from "@/lib/category-emojis";
import { fetchCategoryTree, fetchCourses, fetchEvents, fetchBlogPosts, fetchProductList, fetchTestimonials } from "@/lib/api";
import { organizationJsonLd } from "@/lib/seo-product";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Sarveda — Yoga, Meditation, Ayurveda & Sound Healing",
  description:
    "Authentic yoga, meditation, Ayurveda, and sound healing products — curated by practitioners. Shop instruments, herbs, and mindful living goods.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/") }
};

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sarveda",
    url: absoluteUrl("/")
  };
}

/* ── Static trust pillars ──────────────────────────────────────── */
const TRUST = [
  {
    icon: "🌿",
    title: "100% Authentic",
    body: "Every product sourced directly from verified practitioners and artisans."
  },
  {
    icon: "🙏",
    title: "Expert Curated",
    body: "Chosen by yoga teachers, Vaidyas, and sound healers — not algorithms."
  },
  {
    icon: "🚚",
    title: "Free Shipping ₹999+",
    body: "Pan-India delivery. International shipping to US, UK and worldwide."
  },
  {
    icon: "↩️",
    title: "Easy Returns",
    body: "Not what you expected? We make returns simple and stress-free."
  },
];

/* ── Testimonials ──────────────────────────────────────────────── */
const TESTIMONIALS = [
  {
    quote: "The singing bowl I ordered has become the anchor of my morning practice. The sound is extraordinary — I've tried many over the years and this is the finest.",
    author: "Priya S.",
    location: "Bengaluru",
    stars: 5,
  },
  {
    quote: "Finally found an Indian wellness brand I can trust from the UK. Fast delivery, beautifully packaged, and genuinely authentic Ayurvedic products.",
    author: "Meera K.",
    location: "London, UK",
    stars: 5,
  },
  {
    quote: "The Ashwagandha from Sarveda is unlike any supplement I've tried. I've recommended it to every student in my yoga classes.",
    author: "Anand R.",
    location: "Mumbai",
    stars: 5,
  },
];

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className={`h-4 w-4 ${i < count ? "text-brand-gold-mid" : "text-stone-300"}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
      ))}
    </div>
  );
}

export default async function HomePage() {
  let categories: Awaited<ReturnType<typeof fetchCategoryTree>> = [];
  let featured:   Awaited<ReturnType<typeof fetchProductList>> = {
    items: [],
    pagination: { page:1, limit:8, total:0, totalPages:0 }
  };
  let dbTestimonials: Awaited<ReturnType<typeof fetchTestimonials>> = [];
  let courses: Awaited<ReturnType<typeof fetchCourses>> = [];
  let events: Awaited<ReturnType<typeof fetchEvents>> = [];
  let posts: Awaited<ReturnType<typeof fetchBlogPosts>> = [];

  try {
    [categories, featured, dbTestimonials, courses, events, posts] = await Promise.all([
      fetchCategoryTree({ next: { revalidate: 600 } }),
      fetchProductList({}, { next: { revalidate: 120 } }, { limit: 8 }),
      fetchTestimonials({ next: { revalidate: 300 } }),
      fetchCourses({ next: { revalidate: 300 } }),
      fetchEvents({ cache: "no-store" }),
      fetchBlogPosts({ cache: "no-store" })
    ]);
  } catch {
    /* Keep buildable when API is unreachable */
  }

  const topCategories = categories.slice(0, 12);
  const testimonialCards =
    dbTestimonials.length > 0
      ? dbTestimonials.slice(0, 6).map((t) => ({
          quote: t.body || "",
          author: t.authorName,
          location: t.role || "Sarveda community",
          stars: 5 as const
        }))
      : TESTIMONIALS;

  return (
    <div className="overflow-x-hidden">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <HomeHero />

      {/* ── Category Pills ─────────────────────────────────────────── */}
      <section className="border-b border-stone-100 bg-white py-7 md:py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-xl font-semibold text-brand-ink sm:text-2xl">
              Shop by intention
            </h2>
            <Link href="/shop"
              className="hidden text-sm font-medium text-brand-sage hover:text-brand-forest transition-colors md:block"
            >
              View all →
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5 md:mt-6">
            {topCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/product-category/${cat.slug}`}
                className="flex min-h-[44px] items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 transition-all duration-200 hover:border-green-800 hover:bg-stone-50 hover:text-green-900 hover:shadow-sm"
              >
                <span aria-hidden="true">{categoryEmoji(cat.slug)}</span>
                <span className="line-clamp-1">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Products ───────────────────────────────────────── */}
      <section className="py-12 md:py-16" style={{ background: "#fdf6ed" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1.5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-sage">
                Handpicked for you
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">
                Featured offerings
              </h2>
            </div>
            <Link
              href="/shop"
              className="hidden text-sm font-medium text-brand-muted underline-offset-4 hover:text-brand-ink hover:underline transition-colors md:block"
            >
              Browse all {featured.pagination.total > 0 ? `${featured.pagination.total} ` : ""}products →
            </Link>
          </div>

          {/* Divider */}
          <div className="divider-gold my-6" />

          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4 lg:gap-8">
            {featured.items.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>

          <div className="mt-10 text-center">
            <Link
              href="/shop"
              className="inline-flex min-h-[52px] min-w-[220px] items-center justify-center gap-2 rounded-full text-sm font-bold tracking-wide text-brand-night shadow-gold transition-all hover:shadow-gold-lg hover:opacity-95"
              style={{ background:"linear-gradient(135deg,#e8b012 0%,#f5d88a 50%,#c8960a 100%)" }}
            >
              View all products
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why Sarveda ────────────────────────────────────────────── */}
      <section className="border-y border-stone-100 bg-white py-14 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-sage">
              Our promise
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">
              Why practitioners choose Sarveda
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
            {TRUST.map((item) => (
              <div
                key={item.title}
                className="flex flex-col items-center rounded-2xl p-5 text-center transition-shadow hover:shadow-card"
                style={{ background:"#fdf6ed" }}
              >
                <span className="mb-3 text-3xl">{item.icon}</span>
                <p className="font-serif text-base font-semibold text-brand-ink md:text-lg">
                  {item.title}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-brand-muted md:text-sm">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────── */}
      <section className="py-14 md:py-16" style={{ background:"#fdf6ed" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-sage">
              From the community
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">
              What practitioners say
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3 md:gap-8">
            {testimonialCards.map((t) => (
              <blockquote
                key={t.author}
                className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-6 shadow-card"
              >
                <StarRow count={t.stars} />
                <p className="text-sm leading-relaxed text-brand-ink">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <footer className="mt-auto">
                  <p className="font-semibold text-brand-ink text-sm">{t.author}</p>
                  <p className="text-xs text-brand-muted">{t.location}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <HomeExperienceSections courses={courses} events={events} posts={posts} />

      {/* ── Newsletter ─────────────────────────────────────────────── */}
      <section
        id="newsletter"
        className="scroll-mt-24 py-14 md:py-16"
        style={{ background:"#0f1a14" }}
      >
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-sage">
            Stay close
          </p>
          <h2 className="mt-3 font-serif text-2xl font-semibold text-brand-gold sm:text-3xl">
            Stay close to the practice
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-400 sm:text-base">
            Occasional notes on new arrivals, seasonal rituals, and wisdom from our teachers.
            No clutter — only what nourishes.
          </p>
          <div className="mt-8">
            <NewsletterForm />
          </div>
          <p className="mt-4 text-xs text-stone-600">
            Join 4,200+ practitioners. Unsubscribe anytime.
          </p>
        </div>
      </section>

    </div>
  );
}
