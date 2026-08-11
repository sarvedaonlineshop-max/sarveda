"use client";

import Image from "next/image";
import { useRef } from "react";

const PARTNERS = [
  { src: "/images/home/partners/paypal.png", alt: "PayPal", wide: true },
  { src: "/images/home/partners/publicis-groupe.png", alt: "Publicis Groupe" },
  { src: "/images/home/partners/times-group.png", alt: "The Times Group" },
  { src: "/images/home/partners/veeam.png", alt: "Veeam", wide: true },
  { src: "/images/home/partners/rotary.png", alt: "Rotary", wide: true },
  {
    src: "/images/home/partners/international-yoga-festival.png",
    alt: "International Yoga Festival",
    wide: true
  },
  {
    src: "/images/home/partners/world-peace-festival.png",
    alt: "World Peace Festival Society",
    wide: true
  }
] as const;

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

export function HomeTrustedPartners() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(320, el.clientWidth * 0.6), behavior: "smooth" });
  }

  return (
    <section className="bg-[#f9f6f0] py-14 md:py-16" aria-labelledby="home-partners-heading">
      <div className="mx-auto w-[90%] max-w-[1600px] md:w-[80%]">
        <div className="text-center">
          <h2
            id="home-partners-heading"
            className="font-serif text-[1.65rem] font-semibold tracking-tight text-brand-ink sm:text-3xl md:text-[2.15rem]"
          >
            Trusted by Leading Organizations
          </h2>
          <Flourish />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-brand-ink/65 sm:text-[0.95rem]">
            We&apos;re honoured to partner with forward-thinking organizations that value
            well-being, creativity, and meaningful impact.
          </p>
        </div>

        <div className="relative mt-10 md:mt-12">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="absolute -left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-brand-gold transition hover:text-brand-forest sm:-left-4 md:-left-6"
            aria-label="Scroll partners left"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="absolute -right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-brand-gold transition hover:text-brand-forest sm:-right-4 md:-right-6"
            aria-label="Scroll partners right"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div
            ref={scrollerRef}
            className="flex gap-6 overflow-x-auto scroll-smooth px-2 py-4 [scrollbar-width:none] sm:gap-10 sm:px-4 [&::-webkit-scrollbar]:hidden"
          >
            {PARTNERS.map((p) => (
              <div
                key={p.alt}
                className={`relative flex h-16 shrink-0 items-center justify-center sm:h-20 ${
                  "wide" in p && p.wide ? "w-40 sm:w-52" : "w-28 sm:w-36"
                }`}
              >
                <Image
                  src={p.src}
                  alt={p.alt}
                  fill
                  sizes="208px"
                  className="object-contain object-center"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
