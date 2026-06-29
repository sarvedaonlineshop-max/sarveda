import Link from "next/link";

import { SarvedaLogoWatermark } from "@/components/brand/SarvedaLogo";

/**
 * Static homepage hero — single brand panel (~70vh), no product carousel.
 */
export function HomeHero() {
  return (
    <section
      className="relative flex min-h-[70vh] flex-col justify-end overflow-hidden border-b border-white/10"
      style={{ background: "linear-gradient(160deg, #0f1a14 0%, #1a2e24 45%, #0f1a14 100%)" }}
      aria-label="Welcome to Sarveda"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(232,176,18,0.25) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(120,160,130,0.2) 0%, transparent 40%)"
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <SarvedaLogoWatermark height={320} className="opacity-[0.07]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-16 sm:px-6 md:pb-16 md:pt-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-sage">
            Yoga · Meditation · Sound Healing
          </p>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Authentic wellness, curated for practitioners
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-stone-300 sm:text-lg">
            Sarveda brings together singing bowls, meditation tools, mindful living goods, and
            practitioner-trusted essentials — rooted in Indian tradition, shipped worldwide.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/shop"
              className="inline-flex min-h-[52px] min-w-[180px] items-center justify-center gap-2 rounded-full px-8 text-sm font-bold tracking-wide text-brand-night shadow-gold transition-all hover:shadow-gold-lg hover:opacity-95"
              style={{
                background: "linear-gradient(135deg,#e8b012 0%,#f5d88a 50%,#c8960a 100%)"
              }}
            >
              Shop all products
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/courses"
              className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-white/25 px-8 text-sm font-semibold text-stone-200 transition-colors hover:border-white/40 hover:bg-white/5"
            >
              Explore courses
            </Link>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-400">
            <li>169+ curated products</li>
            <li>India · US · UK · worldwide</li>
            <li>Free shipping ₹999+ in India</li>
            <li>Audio samples on singing bowls</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
