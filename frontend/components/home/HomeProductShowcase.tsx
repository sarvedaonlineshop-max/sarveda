"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ProductListItem } from "@/lib/types";

type Props = { products: ProductListItem[] };

const promos = [
  { badge: "WELCOME10", headline: "10% off your first order", sub: "Start your practice with intention" },
  { badge: "Trusted by thousands", headline: "Thousands return, season after season", sub: "Quality that practitioners recognise" },
  { badge: "Ships worldwide", headline: "India · US · UK · Worldwide", sub: "Delivered with care to your door" },
  { badge: "Hear before you buy", headline: "Audio samples on all singing bowls", sub: "Know the sound before it finds you" },
];

const heroStats = [
  { value: "38+", label: "Audio samples" },
  { value: "₹999+", label: "Free shipping" },
  { value: "Global", label: "Delivery" },
];

const heroGradient = "linear-gradient(160deg, #22134A 0%, #3A2070 60%, #5B3E9B 100%)";

const primaryBtnClass =
  "inline-flex min-h-[48px] min-w-[180px] items-center justify-center gap-2 rounded-sm bg-brand-violet px-7 py-3.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-all hover:-translate-y-px hover:bg-brand-violet-mid hover:shadow-violet";

const secondaryBtnClass =
  "inline-flex min-h-[48px] items-center justify-center rounded-sm border px-7 py-3.5 text-xs font-medium uppercase tracking-[0.12em] text-brand-lavender transition-colors hover:bg-[rgba(196,176,232,0.08)]";

function HeroStatsBar() {
  return (
    <div
      className="border-t"
      style={{ borderColor: "rgba(196,176,232,0.12)", background: heroGradient }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-3 divide-x" style={{ borderColor: "rgba(196,176,232,0.12)" }}>
        {heroStats.map((s) => (
          <div key={s.label} className="px-4 py-6 text-center md:py-8">
            <p className="display-text text-4xl font-light text-brand-lavender md:text-[40px]">{s.value}</p>
            <p className="mt-1 text-[11px] font-normal uppercase tracking-[0.12em] text-[rgba(196,176,232,0.45)]">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaticHero() {
  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: "rgba(196,176,232,0.12)" }} aria-label="Welcome">
      <div className="relative px-4 py-16 sm:px-6 md:px-8 md:py-24" style={{ background: heroGradient }}>
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(196,176,232,0.08) 0%, transparent 70%)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(196,176,232,0.08) 0%, transparent 70%)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <span
            className="inline-block rounded-sm border px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-brand-lavender"
            style={{ borderColor: "rgba(196,176,232,0.22)" }}
          >
            Yoga · Ayurveda · Sound
          </span>
          <h1 className="display-text mt-6 text-5xl font-light leading-[1.08] text-brand-violet-pale sm:text-6xl md:text-[68px]">
            Authentic wellness,{" "}
            <span className="italic text-brand-lavender">rooted in practice</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] font-light leading-[1.75] text-[rgba(196,176,232,0.75)] md:text-base">
            Curated yoga, meditation, Ayurveda, and sound healing — for practitioners in India and worldwide.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/shop" className={primaryBtnClass}>
              Shop the collection
            </Link>
            <Link href="/courses" className={secondaryBtnClass} style={{ borderColor: "rgba(196,176,232,0.35)" }}>
              Explore courses
            </Link>
          </div>
        </div>
      </div>
      <HeroStatsBar />
    </section>
  );
}

export function HomeProductShowcase({ products }: Props) {
  const slides = products.filter((p) => p.primaryImageUrl).slice(0, 6);
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
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const goTo = (i: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setActive(i);
    startTimer();
  };

  if (!slides.length) {
    return <StaticHero />;
  }

  const product = slides[active];
  const promo = promos[active % promos.length];
  const nameParts = product.name.trim().split(/\s+/);
  const accentWord = nameParts.length > 1 ? nameParts.pop()! : "";
  const nameLead = nameParts.length > 0 ? nameParts.join(" ") : product.name;

  return (
    <section className="relative border-b" style={{ borderColor: "rgba(196,176,232,0.12)" }} aria-label="Featured promotions">
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
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(34,19,74,0.92) 0%, rgba(34,19,74,0.55) 45%, rgba(34,19,74,0.2) 100%)",
              }}
            />
          </Link>
        ))}

        <div
          className="pointer-events-none absolute -right-20 top-8 h-72 w-72 rounded-full md:right-8 md:top-12"
          style={{ background: "radial-gradient(circle, rgba(196,176,232,0.08) 0%, transparent 70%)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 left-4 h-56 w-56 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(196,176,232,0.08) 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="absolute inset-x-0 bottom-0 px-4 pb-8 pt-20 sm:px-6 md:px-8 md:pb-10">
          <div className="relative mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <span
                key={promo.badge}
                className="inline-block rounded-sm border px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-brand-lavender"
                style={{ borderColor: "rgba(196,176,232,0.22)" }}
              >
                {promo.badge}
              </span>

              <h1
                key={product.name}
                className="display-text mt-4 text-5xl font-light leading-[1.08] text-brand-violet-pale sm:text-6xl md:text-[68px]"
              >
                {accentWord ? (
                  <>
                    {nameLead}{" "}
                    <span className="italic text-brand-lavender">{accentWord}</span>
                  </>
                ) : (
                  product.name
                )}
              </h1>

              <p key={promo.sub} className="mt-4 text-[15px] font-light leading-[1.75] text-[rgba(196,176,232,0.75)] md:text-base">
                {promo.sub}
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 md:items-end">
              <Link href={`/product/${product.slug}`} className={primaryBtnClass}>
                Shop this piece
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link href="/shop" className={secondaryBtnClass} style={{ borderColor: "rgba(196,176,232,0.35)" }}>
                View all products →
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute right-4 top-4 rounded-sm bg-[rgba(34,19,74,0.55)] px-2.5 py-1 text-[11px] font-medium text-brand-lavender backdrop-blur-sm md:right-8 md:top-8">
          {active + 1} / {slides.length}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 py-4" style={{ background: heroGradient }}>
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
              background: index === active ? "#C4B0E8" : "rgba(196,176,232,0.25)",
            }}
          />
        ))}
      </div>

      <HeroStatsBar />
    </section>
  );
}
