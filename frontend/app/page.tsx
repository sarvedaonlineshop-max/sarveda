import Link from "next/link";

import { NewsletterForm } from "@/components/home/NewsletterForm";
import { ProductCard } from "@/components/shop/ProductCard";
import { categoryEmoji } from "@/lib/category-emojis";
import { fetchCategoryTree, fetchProductList } from "@/lib/api";

export const revalidate = 120;

export default async function HomePage() {
  const [categories, featured] = await Promise.all([
    fetchCategoryTree({ next: { revalidate: 600 } }),
    fetchProductList({}, { next: { revalidate: 120 } }, { limit: 6 })
  ]);

  const topCategories = categories.slice(0, 12);

  return (
    <div className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative flex min-h-[80vh] flex-col justify-center overflow-hidden bg-gradient-to-b from-stone-900 to-stone-800 px-4 py-16 sm:px-6 lg:px-8">
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-[clamp(10rem,35vw,22rem)] leading-none text-stone-700/20"
          aria-hidden="true"
        >
          ☸
        </span>
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-stone-50 sm:text-5xl lg:text-6xl">
            From the Land of Yoga
          </h1>
          <p className="mt-4 font-serif text-xl italic text-amber-400 sm:text-2xl">to the World</p>
          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-stone-300 sm:text-lg">
            Thoughtfully curated instruments, botanicals, and ritual goods — honoring tradition while reaching hearts
            everywhere.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {[
              { label: "169+ products", detail: "Curated for practice" },
              { label: "38 with audio", detail: "Hear before you buy" },
              { label: "Ships worldwide", detail: "India · US · UK" }
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-left backdrop-blur-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">{item.label}</p>
                <p className="text-[11px] text-stone-400">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
            <Link
              href="/shop"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-amber-600 px-10 py-3 text-center text-sm font-semibold tracking-wide text-white shadow-lg transition-colors hover:bg-amber-500 sm:text-base"
            >
              Shop Now
            </Link>
            <Link
              href="/#courses"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border-2 border-stone-400 px-10 py-3 text-center text-sm font-semibold tracking-wide text-stone-200 transition-colors hover:border-amber-400 hover:text-amber-400 sm:text-base"
            >
              Explore Courses
            </Link>
          </div>
        </div>
      </section>

      {/* Promo banner */}
      <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700 sm:text-base">
        Use code <span className="font-semibold">WELCOME10</span> for 10% off your first order
      </div>

      {/* Categories */}
      <section className="border-b border-stone-100 bg-stone-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-serif text-xl font-semibold text-stone-900 sm:text-2xl">Shop by intention</h2>
          <div className="scrollbar-hide mt-6 flex gap-3 overflow-x-auto pb-2 pt-1">
            {topCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className="flex min-h-[48px] flex-shrink-0 items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:border-amber-700 hover:text-amber-800"
              >
                <span aria-hidden="true">{categoryEmoji(cat.slug)}</span>
                <span className="whitespace-nowrap">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="bg-stone-50 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <h2 className="font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">Featured offerings</h2>
            <p className="text-stone-500">Handpicked pieces our community loves.</p>
          </div>
          <ul className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {featured.items.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
          <div className="mt-12 text-center">
            <Link
              href="/shop"
              className="inline-flex min-h-[48px] min-w-[200px] items-center justify-center rounded-xl bg-stone-900 px-8 py-3 text-sm font-semibold tracking-wide text-amber-400 transition-colors hover:bg-amber-700 hover:text-white"
            >
              View all products
            </Link>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-y border-stone-100 bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 md:grid-cols-4 lg:gap-10">
          {[
            { t: "Authentic", d: "Rooted in tradition" },
            { t: "Sustainable", d: "Mindful sourcing" },
            { t: "Expert curated", d: "Chosen by practitioners" },
            { t: "Free shipping ₹999+", d: "Across India" }
          ].map((item) => (
            <div key={item.t} className="text-center">
              <p className="font-serif text-lg font-semibold text-stone-900">{item.t}</p>
              <p className="mt-1 text-sm text-stone-500">{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Courses teaser */}
      <section id="courses" className="scroll-mt-24 bg-stone-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">Courses & guided practice</h2>
          <p className="mt-4 text-stone-500">
            Deepen pranayama, mantra, and Ayurvedic living with teachers who carry these lineages with care. Full catalogue
            launches soon — leave your email below to hear first.
          </p>
        </div>
      </section>

      {/* Newsletter */}
      <section className="bg-stone-900 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 text-center">
          <h2 className="font-serif text-2xl font-semibold text-amber-400 sm:text-3xl">Stay close to the practice</h2>
          <p className="text-sm leading-relaxed text-stone-400 sm:text-base">
            Occasional notes on new arrivals, seasonal rituals, and wisdom from our teachers. No clutter — only what
            nourishes.
          </p>
          <NewsletterForm />
        </div>
      </section>
    </div>
  );
}
