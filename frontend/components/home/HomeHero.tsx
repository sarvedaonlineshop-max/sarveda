import Link from "next/link";

import { SarvedaLogoWatermark } from "@/components/brand/SarvedaLogo";
import heroBg from "../../../data/bg.png";

/**
 * Static homepage hero — single brand panel (~70vh), no product carousel.
 */
export function HomeHero() {
  return (
    <section
      className="relative flex min-h-[70vh] flex-col justify-end overflow-hidden border-b border-white/10"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(10, 22, 18, 0.82) 0%, rgba(15, 31, 24, 0.7) 38%, rgba(18, 34, 27, 0.55) 100%), url(${heroBg.src})`,
        backgroundSize: "cover",
        backgroundPosition: "center center"
      }}
      aria-label="Welcome to Sarveda"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(185,138,62,0.22) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(111,153,127,0.16) 0%, transparent 40%)"
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <SarvedaLogoWatermark height={320} className="opacity-[0.035]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-24 sm:px-6 md:pb-24 md:pt-32 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold-pale">
            Yoga · Meditation · Sound Healing
          </p>
          <h1 className="mt-6 font-serif text-4xl font-semibold leading-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Authentic wellness, curated for practitioners
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-brand-cream/75 sm:text-lg">
            Sarveda brings together singing bowls, meditation tools, mindful living goods, and
            practitioner-trusted essentials — rooted in Indian tradition, shipped worldwide.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/shop"
              className="inline-flex min-h-[52px] min-w-[180px] items-center justify-center gap-2 rounded-full bg-brand-gold px-8 text-sm font-bold tracking-wide text-brand-night transition-colors hover:bg-[#a37934]"
            >
              Shop all products
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/courses"
              className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-brand-cream/40 px-8 text-sm font-semibold text-brand-cream transition-colors hover:border-brand-cream/70 hover:bg-brand-cream/10"
            >
              Explore courses
            </Link>
          </div>
          <ul className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-cream/55">
            <li>169+ curated products</li>
            <li>India · US · UK · worldwide</li>
            <li>💳 Visa · Mastercard · PayPal · Stripe</li>
            <li>Audio samples on singing bowls</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
