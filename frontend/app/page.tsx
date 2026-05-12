import Link from "next/link";

import { HomeProductShowcase } from "@/components/home/HomeProductShowcase";
import { NewsletterForm } from "@/components/home/NewsletterForm";
import { ProductCard } from "@/components/shop/ProductCard";
import { categoryEmoji } from "@/lib/category-emojis";
import { fetchCategoryTree, fetchProductList } from "@/lib/api";

export const revalidate = 120;

export default async function HomePage() {
  const [categories, featured] = await Promise.all([
    fetchCategoryTree({ next: { revalidate: 600 } }),
    fetchProductList({}, { next: { revalidate: 120 } }, { limit: 8 })
  ]);

  const topCategories = categories.slice(0, 12);

  return (
    <div className="overflow-x-hidden">
      <HomeProductShowcase products={featured.items} />

      <section className="border-b border-stone-200 bg-white py-6 md:border-stone-100 md:bg-stone-50 md:py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-xl font-semibold text-stone-900 sm:text-2xl">Shop by intention</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:mt-6 md:flex md:flex-wrap">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                href={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:border-amber-700 hover:text-amber-800 md:rounded-full md:px-5 md:py-2.5"
              >
                <span aria-hidden="true">{categoryEmoji(category.slug)}</span>
                <span className="line-clamp-2 md:line-clamp-1">{category.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-stone-50 py-10 md:px-4 md:py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-2 px-4 text-left md:px-0">
            <h2 className="font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">Featured offerings</h2>
            <p className="text-stone-500">Handpicked pieces our community loves.</p>
          </div>

          <ul className="mt-6 grid grid-cols-2 gap-3 px-4 md:mt-10 md:grid-cols-2 md:gap-6 md:px-0 lg:grid-cols-3 lg:gap-8">
            {featured.items.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>

          <div className="mt-10 px-4 text-center md:px-0">
            <Link
              href="/shop"
              className="inline-flex min-h-[48px] min-w-[200px] items-center justify-center rounded-xl bg-stone-900 px-8 py-3 text-sm font-semibold tracking-wide text-amber-400 transition-colors hover:bg-amber-700 hover:text-white"
            >
              View all products
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-stone-100 bg-white px-4 py-10 sm:px-6 md:py-12 lg:px-8">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-5 md:grid-cols-4 md:gap-10">
          {[
            { t: "Returning customers", d: "Thousands shop with us again" },
            { t: "Authentic", d: "Rooted in tradition" },
            { t: "Expert curated", d: "Chosen by practitioners" },
            { t: "Free shipping ₹999+", d: "Across India" }
          ].map((item) => (
            <div key={item.t} className="text-center">
              <p className="font-serif text-base font-semibold text-stone-900 md:text-lg">{item.t}</p>
              <p className="mt-1 text-xs text-stone-500 md:text-sm">{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="courses" className="scroll-mt-24 bg-stone-50 px-4 py-14 sm:px-6 md:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">Courses & guided practice</h2>
          <p className="mt-4 text-sm text-stone-500 md:text-base">
            Deepen pranayama, mantra, and Ayurvedic living with teachers who carry these lineages with care. Full catalogue
            launches soon — leave your email below to hear first.
          </p>
        </div>
      </section>

      <section className="bg-stone-900 px-4 py-12 sm:px-6 md:py-14 lg:px-8">
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
