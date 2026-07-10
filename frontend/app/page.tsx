import type { Metadata } from "next";
import Link from "next/link";

import { HomeExperienceSections } from "@/components/home/HomeExperienceSections";
import { HomeHero } from "@/components/home/HomeHero";
import { JsonLd } from "@/components/seo/JsonLd";
import { NewsletterForm }      from "@/components/home/NewsletterForm";
import { ProductCard }         from "@/components/shop/ProductCard";
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
function TrustIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const TRUST = [
  {
    icon: (
      <TrustIcon>
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
      </TrustIcon>
    ),
    title: "100% Authentic",
    body: "Every product sourced directly from verified practitioners and artisans."
  },
  {
    icon: (
      <TrustIcon>
        <path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" />
        <path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
        <path d="m2 15 6 6" />
        <path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z" />
      </TrustIcon>
    ),
    title: "Expert Curated",
    body: "Chosen by yoga teachers, Vaidyas, and sound healers — not algorithms."
  },
  {
    icon: (
      <TrustIcon>
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35a1 1 0 0 0-.78-.38H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </TrustIcon>
    ),
    title: "Free Shipping ₹999+",
    body: "Pan-India delivery. International shipping to US, UK and worldwide."
  },
  {
    icon: (
      <TrustIcon>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </TrustIcon>
    ),
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
        <svg key={i} className={`h-4 w-4 ${i < count ? "text-brand-gold" : "text-brand-cream-dark"}`}
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
      <section className="border-b border-brand-cream-dark/60 bg-white py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">
                Find your path
              </p>
              <h2 className="mt-2 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">
                Shop by intention
              </h2>
            </div>
            <Link href="/shop"
              className="hidden text-sm font-medium text-brand-gold hover:text-brand-forest transition-colors md:block"
            >
              View all →
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5 md:mt-8">
            {topCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/product-category/${cat.slug}`}
                className="flex min-h-[44px] items-center rounded-full border border-brand-forest/15 px-5 py-2 text-sm font-medium text-brand-forest transition-all duration-200 hover:border-brand-forest hover:bg-brand-forest hover:text-brand-cream"
              >
                <span className="line-clamp-1">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Products ───────────────────────────────────────── */}
      <section className="bg-brand-cream py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">
              Handpicked for you
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">
              Featured offerings
            </h2>
          </div>

          {/* Divider */}
          <div className="divider-gold my-8" />

          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featured.items.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>

          <div className="mt-12 text-center">
            <Link
              href="/shop"
              className="inline-flex min-h-[52px] min-w-[220px] items-center justify-center gap-2 rounded-full bg-brand-forest px-8 text-sm font-semibold tracking-wide text-brand-cream transition-colors hover:bg-brand-night"
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
      <section className="border-y border-brand-cream-dark/60 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">
              Our promise
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">
              Why practitioners choose Sarveda
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((item) => (
              <div
                key={item.title}
                className="flex h-full flex-col items-center rounded-2xl border border-brand-cream-dark bg-white p-8 text-center transition-shadow hover:shadow-card"
              >
                <span className="mb-4 text-brand-gold">{item.icon}</span>
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
      <section className="bg-brand-cream py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">
              From the community
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">
              What practitioners say
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {testimonialCards.map((t) => (
              <blockquote
                key={t.author}
                className="flex flex-col gap-5 rounded-2xl border border-brand-cream-dark bg-white p-8 shadow-card"
              >
                <StarRow count={t.stars} />
                <p className="font-serif text-base leading-relaxed text-brand-ink">
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
        className="scroll-mt-24 bg-brand-night py-20 md:py-24"
      >
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">
            Stay close
          </p>
          <h2 className="mt-3 font-serif text-2xl font-semibold text-brand-cream sm:text-3xl">
            Stay close to the practice
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-brand-cream/60 sm:text-base">
            Occasional notes on new arrivals, seasonal rituals, and wisdom from our teachers.
            No clutter — only what nourishes.
          </p>
          <div className="mt-8">
            <NewsletterForm />
          </div>
          <p className="mt-4 text-xs text-brand-cream/40">
            Join 4,200+ practitioners. Unsubscribe anytime.
          </p>
        </div>
      </section>

    </div>
  );
}
