"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ProductListItem } from "@/lib/types";

type Props = { products: ProductListItem[] };

const promos = [
  { badge: "WELCOME10",          headline: "10% off your first order",            sub: "Start your practice with intention" },
  { badge: "Trusted by thousands", headline: "Thousands return, season after season", sub: "Quality that practitioners recognise" },
  { badge: "Ships worldwide",    headline: "India · US · UK · Worldwide",          sub: "Delivered with care to your door" },
  { badge: "Hear before you buy",headline: "Audio samples on all singing bowls",   sub: "Know the sound before it finds you" },
];

export function HomeProductShowcase({ products }: Props) {
  const slides   = products.filter((p) => p.primaryImageUrl).slice(0, 6);
  const [active, setActive] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setActive((c) => (c + 1) % slides.length);
    }, 5500);
  };

  useEffect(() => {
    if (slides.length <= 1) return;
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const goTo = (i: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setActive(i);
    startTimer();
  };

  if (!slides.length) return null;

  const product = slides[active];
  const promo   = promos[active % promos.length];

  return (
    <section
      className="relative border-b border-white/8"
      style={{ background: "#0f1a14" }}
      aria-label="Featured promotions"
    >
      {/* Slides */}
      <div className="relative aspect-[4/5] w-full overflow-hidden sm:aspect-[16/10] md:aspect-[21/9]">
        {slides.map((slide, index) => (
          <Link
            key={slide.id}
            href={`/product/${slide.slug}`}
            className={`absolute inset-0 transition-opacity duration-900 ${
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
            {/* Rich layered overlay */}
            <div className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(10,20,14,0.95) 0%, rgba(10,20,14,0.55) 40%, rgba(10,20,14,0.10) 80%, transparent 100%)"
              }}
            />
            {/* Vignette sides */}
            <div className="absolute inset-0"
              style={{
                background: "radial-gradient(ellipse at center, transparent 40%, rgba(10,20,14,0.35) 100%)"
              }}
            />
          </Link>
        ))}

        {/* Content overlay */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-8 pt-20 sm:px-6 md:px-8 md:pb-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-end md:justify-between">

            {/* Left: text */}
            <div className="max-w-xl">
              {/* Promo badge */}
              <span
                key={promo.badge}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ background:"rgba(200,150,10,0.18)", border:"1px solid rgba(200,150,10,0.45)", color:"#f5d88a" }}
              >
                ✦ {promo.badge}
              </span>

              {/* Product name */}
              <h1
                key={product.name}
                className="mt-3 font-serif text-3xl font-semibold leading-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
                style={{ textShadow: "0 2px 20px rgba(0,0,0,0.4)" }}
              >
                {product.name}
              </h1>

              {/* Sub line */}
              <p
                key={promo.sub}
                className="mt-3 text-sm leading-relaxed text-stone-300 sm:text-base"
              >
                {promo.sub}
              </p>
            </div>

            {/* Right: CTA */}
            <div className="flex flex-col items-start gap-3 md:items-end">
              <Link
                href={`/product/${product.slug}`}
                className="inline-flex min-h-[52px] min-w-[180px] items-center justify-center gap-2 rounded-full px-8 text-sm font-bold tracking-wide text-brand-night shadow-gold transition-all hover:shadow-gold-lg"
                style={{ background:"linear-gradient(135deg,#e8b012 0%,#f5d88a 50%,#c8960a 100%)" }}
              >
                Shop this piece
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </Link>

              <Link
                href="/shop"
                className="text-sm font-medium text-stone-400 underline-offset-4 hover:text-stone-200 hover:underline transition-colors"
              >
                View all products →
              </Link>
            </div>
          </div>
        </div>

        {/* Slide counter */}
        <div className="absolute right-4 top-4 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium text-stone-300 backdrop-blur-sm md:right-8 md:top-8">
          {active + 1} / {slides.length}
        </div>
      </div>

      {/* Dot navigation */}
      <div className="flex items-center justify-center gap-2 py-4">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Slide ${index + 1}`}
            aria-current={index === active}
            onClick={() => goTo(index)}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: index === active ? "2rem" : "0.5rem",
              background: index === active ? "#e8b012" : "rgba(255,255,255,0.2)"
            }}
          />
        ))}
      </div>
    </section>
  );
}
