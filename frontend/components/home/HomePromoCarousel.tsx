"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const slides = [
  {
    id: "welcome",
    eyebrow: "New here?",
    title: "WELCOME10 — 10% off your first ritual order",
    body: "Apply at checkout. Valid on curated yoga, Ayurveda, and sound pieces.",
    cta: { label: "Start shopping", href: "/shop" },
    tone: "from-brand-violet-deep via-brand-violet to-brand-violet-mid"
  },
  {
    id: "record",
    eyebrow: "Trusted at scale",
    title: "₹3,07,975 in a single day of sales",
    body: "Sound & instruments, Ayurveda herbs, yoga essentials, and eco-living — each category loved by practitioners.",
    cta: { label: "Shop bestsellers", href: "/shop" },
    tone: "from-brand-violet-deep via-brand-violet to-brand-violet-deep"
  },
  {
    id: "export",
    eyebrow: "From India to the world",
    title: "Shipped to India, US, UK & worldwide",
    body: "GST-inclusive pricing, careful packing, and tracking shared after dispatch.",
    cta: { label: "Explore global catalog", href: "/shop" },
    tone: "from-brand-violet-deep via-brand-sage to-brand-violet-deep"
  },
  {
    id: "unique",
    eyebrow: "Why Sarveda",
    title: "Hear before you buy on 38+ instruments",
    body: "Rooted in Indian wellness — authentic sourcing, practitioner curation, and ritual goods you will not find in generic marketplaces.",
    cta: { label: "View courses", href: "/courses" },
    tone: "from-brand-violet-deep via-brand-violet-mid to-brand-violet-deep"
  }
] as const;

export function HomePromoCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, []);

  const slide = slides[active];

  return (
    <section className="border-b border-brand-violet/40 bg-brand-violet-deep" aria-label="Promotions and highlights">
      <div className="relative overflow-hidden">
        <div
          className={`bg-gradient-to-r px-4 py-6 text-white transition-[background] duration-700 sm:px-6 md:px-8 md:py-8 ${slide.tone}`}
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-lavender/90">{slide.eyebrow}</p>
              <h2 className="display-text mt-2 font-serif text-xl font-semibold leading-snug sm:text-2xl md:text-3xl">{slide.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-lavender/90 md:text-base">{slide.body}</p>
            </div>
            <Link
              href={slide.cta.href}
              className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-brand-ink shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {slide.cta.label}
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 bg-brand-violet-deep px-4 py-3">
        {slides.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Show slide ${index + 1}`}
            aria-current={index === active}
            onClick={() => setActive(index)}
            className={`h-2 rounded-full transition-all ${
              index === active ? "w-7 bg-brand-gold" : "w-2 bg-brand-lavender-mid/50 hover:bg-brand-lavender"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
