"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { ProductListItem } from "@/lib/types";

type Props = {
  products: ProductListItem[];
};

const promos = [
  { badge: "WELCOME10", line: "10% off your first order" },
  { badge: "Returning customers", line: "Thousands shop with us again for ritual quality" },
  { badge: "Ships worldwide", line: "India · US · UK · worldwide delivery" },
  { badge: "Hear before you buy", line: "Audio samples on select instruments" }
];

export function HomeProductShowcase({ products }: Props) {
  const slides = products.filter((product) => product.primaryImageUrl).slice(0, 6);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!slides.length) {
    return null;
  }

  const product = slides[active];
  const promo = promos[active % promos.length];

  return (
    <section className="border-b border-stone-800 bg-stone-950" aria-label="Featured promotions">
      <div className="relative aspect-[4/5] w-full overflow-hidden sm:aspect-[16/10] md:aspect-[21/9]">
        {slides.map((slide, index) => (
          <Link
            key={slide.id}
            href={`/product/${slide.slug}`}
            className={`absolute inset-0 transition-opacity duration-700 ${
              index === active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={index !== active}
          >
            <Image
              src={slide.primaryImageUrl as string}
              alt={slide.name}
              fill
              className="object-cover"
              sizes="100vw"
              priority={index === 0}
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/35 to-stone-900/10" />
          </Link>
        ))}

        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 pt-16 sm:px-6 md:px-8 md:pb-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-900">
                {promo.badge}
              </span>
              <h1 className="mt-3 font-serif text-2xl font-semibold leading-tight text-white sm:text-4xl md:text-5xl">
                {product.name}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-stone-200 sm:text-base">{promo.line}</p>
            </div>
            <Link
              href={`/product/${product.slug}`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-stone-900 shadow-lg"
            >
              Shop this piece
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 bg-stone-950 px-4 py-3">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Show slide ${index + 1}`}
            aria-current={index === active}
            onClick={() => setActive(index)}
            className={`h-2 rounded-full transition-all ${
              index === active ? "w-7 bg-amber-400" : "w-2 bg-stone-600 hover:bg-stone-400"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
