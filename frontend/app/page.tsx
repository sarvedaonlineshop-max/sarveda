import type { Metadata } from "next";
import Link from "next/link";

import { HomeProductShowcase } from "@/components/home/HomeProductShowcase";
import { JsonLd } from "@/components/seo/JsonLd";
import { NewsletterForm }      from "@/components/home/NewsletterForm";
import { ProductCard }         from "@/components/shop/ProductCard";
import { categoryEmoji }       from "@/lib/category-emojis";
import { fetchCategoryTree, fetchProductList, fetchTestimonials } from "@/lib/api";
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
        <svg
          key={i}
          className={`h-4 w-4 ${i < count ? "text-brand-gold" : "text-brand-violet-light"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

const sectionEyebrow = "text-[10px] font-normal uppercase tracking-[0.16em] text-brand-violet";
const sectionTitle =
  "display-text mt-2 text-4xl font-light text-brand-ink md:text-[40px]";
const categoryPill =
  "flex min-h-[44px] items-center gap-2 rounded-full border border-[rgba(196,176,232,0.22)] bg-transparent px-4 py-2 text-xs text-[rgba(90,72,128,0.7)] transition-all duration-200 hover:border-[rgba(196,176,232,0.4)] hover:bg-[rgba(91,62,155,0.08)] hover:text-brand-violet";
const primaryCta =
  "inline-flex min-h-[52px] min-w-[220px] items-center justify-center gap-2 rounded-sm bg-brand-violet px-8 text-xs font-medium uppercase tracking-[0.12em] text-white transition-all hover:-translate-y-px hover:bg-brand-violet-mid hover:shadow-violet";

export default async function HomePage() {
  let categories: Awaited<ReturnType<typeof fetchCategoryTree>> = [];
  let featured:   Awaited<ReturnType<typeof fetchProductList>> = {
    items: [],
    pagination: { page:1, limit:8, total:0, totalPages:0 }
  };
  let dbTestimonials: Awaited<ReturnType<typeof fetchTestimonials>> = [];

  try {
    [categories, featured, dbTestimonials] = await Promise.all([
      fetchCategoryTree({ next: { revalidate: 600 } }),
      fetchProductList({}, { next: { revalidate: 120 } }, { limit: 8 }),
      fetchTestimonials({ next: { revalidate: 300 } })
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
      <HomeProductShowcase products={featured.items} />

      {/* ── Category Pills ─────────────────────────────────────────── */}
      <section className="border-b border-[rgba(196,176,232,0.22)] bg-brand-ivory py-7 md:py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-baseline justify-between">
            <div>
              <p className={sectionEyebrow}>Browse</p>
              <h2 className={`${sectionTitle} mt-1`}>
                Shop by <span className="italic text-brand-violet">intention</span>
              </h2>
            </div>
            <Link
              href="/shop"
              className="hidden text-sm font-medium text-brand-violet transition-colors hover:text-brand-violet-mid md:block"
            >
              View all →
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5 md:mt-6">
            {topCategories.map((cat) => (
              <Link key={cat.id} href={`/product-category/${cat.slug}`} className={categoryPill}>
                <span aria-hidden="true">{categoryEmoji(cat.slug)}</span>
                <span className="line-clamp-1">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Products ───────────────────────────────────────── */}
      <section className="bg-brand-bg py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1.5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className={sectionEyebrow}>Handpicked for you</p>
              <h2 className={sectionTitle}>
                Featured <span className="italic text-brand-violet">offerings</span>
              </h2>
            </div>
            <Link
              href="/shop"
              className="hidden text-sm font-medium text-brand-mid underline-offset-4 transition-colors hover:text-brand-violet hover:underline md:block"
            >
              Browse all {featured.pagination.total > 0 ? `${featured.pagination.total} ` : ""}products →
            </Link>
          </div>

          <div className="divider-gold my-6" />

          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4 lg:gap-8">
            {featured.items.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>

          <div className="mt-10 text-center">
            <Link href="/shop" className={primaryCta}>
              View all products
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why Sarveda ────────────────────────────────────────────── */}
      <section className="border-y border-[rgba(196,176,232,0.22)] bg-brand-ivory py-14 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <p className={sectionEyebrow}>Our promise</p>
            <h2 className={sectionTitle}>
              Why practitioners choose <span className="italic text-brand-violet">Sarveda</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
            {TRUST.map((item) => (
              <div
                key={item.title}
                className="flex flex-col items-center rounded-2xl border border-[rgba(196,176,232,0.22)] bg-brand-bg p-5 text-center transition-shadow hover:shadow-card"
              >
                <span className="mb-3 text-3xl" aria-hidden>
                  {item.icon}
                </span>
                <p className="display-text text-lg font-normal text-brand-ink md:text-xl">{item.title}</p>
                <p className="mt-2 text-xs font-light leading-relaxed text-brand-mid md:text-sm">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────── */}
      <section className="bg-brand-bg py-14 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <p className={sectionEyebrow}>From the community</p>
            <h2 className={sectionTitle}>
              What practitioners <span className="italic text-brand-violet">say</span>
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3 md:gap-8">
            {testimonialCards.map((t) => (
              <blockquote
                key={t.author}
                className="flex flex-col gap-4 rounded-2xl border border-[rgba(196,176,232,0.25)] bg-brand-ivory p-6 shadow-card"
              >
                <StarRow count={t.stars} />
                <p className="text-sm font-light leading-relaxed text-brand-ink">&ldquo;{t.quote}&rdquo;</p>
                <footer className="mt-auto">
                  <p className="text-sm font-medium text-brand-ink">{t.author}</p>
                  <p className="text-xs text-brand-muted">{t.location}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* ── Courses teaser (dosha-banner styling) ───────────────────── */}
      <section
        id="courses"
        className="relative scroll-mt-24 overflow-hidden border-y py-16"
        style={{ background: "#5B3E9B", borderColor: "rgba(196,176,232,0.12)" }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-12 h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/70">Learn with us</p>
          <h2 className="display-text mt-3 text-4xl font-light text-white sm:text-5xl md:text-[52px]">
            Courses & <span className="italic text-brand-lavender">guided practice</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] font-light leading-relaxed text-white/70">
            Deepen pranayama, mantra, and Ayurvedic living with teachers who carry these lineages with care.
          </p>
          <Link
            href="/courses"
            className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-sm bg-white px-8 py-3.5 text-xs font-medium uppercase tracking-[0.12em] text-brand-violet-deep transition-opacity hover:opacity-95"
          >
            Browse courses
          </Link>
        </div>
      </section>

      {/* ── Newsletter ─────────────────────────────────────────────── */}
      <section
        id="newsletter"
        className="scroll-mt-24 py-14 md:py-16"
        style={{ background: "linear-gradient(160deg, #22134A 0%, #1A0F35 100%)" }}
      >
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <p className="text-[10px] uppercase tracking-[0.16em] text-brand-lavender">Stay close</p>
          <h2 className="display-text mt-3 text-4xl font-light text-brand-lavender sm:text-[40px]">
            Stay close to the <span className="italic text-brand-violet-pale">practice</span>
          </h2>
          <p className="mt-3 text-sm font-light leading-relaxed text-[rgba(196,176,232,0.55)] sm:text-base">
            Occasional notes on new arrivals, seasonal rituals, and wisdom from our teachers.
            No clutter — only what nourishes.
          </p>
          <div className="mt-8">
            <NewsletterForm />
          </div>
          <p className="mt-4 text-xs text-[rgba(196,176,232,0.35)]">
            Join 4,200+ practitioners. Unsubscribe anytime.
          </p>
        </div>
      </section>

    </div>
  );
}
