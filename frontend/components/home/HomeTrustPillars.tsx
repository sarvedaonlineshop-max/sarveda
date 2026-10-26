import Image from "next/image";

import { HomeAboutVideo } from "./HomeAboutVideo";

/**
 * Homepage section 2 — “Thoughtfully Curated. Globally Trusted.”
 * Desktop: copy and trust icons in the left column, about film in the right column.
 */

const PILLARS = [
  {
    src: "/images/home/trust-customers.png",
    alt: "",
    lines: ["100,000+", "Customers Worldwide"]
  },
  {
    src: "/images/home/trust-shipping.png",
    alt: "",
    lines: ["Shipped to 60+", "Countries"]
  },
  {
    src: "/images/home/trust-curation.png",
    alt: "",
    lines: ["Curated by Musicians,", "Sound Therapists & Yoga Practitioners"]
  },
  {
    src: "/images/home/trust-collection.png",
    alt: "",
    lines: ["India's Largest Collection", "of Sound Healing Instruments"]
  }
] as const;

export function HomeTrustPillars() {
  return (
    <section
      className="overflow-hidden border-b border-brand-cream-dark/50 bg-[#f9f6f0]"
      aria-labelledby="home-curated-heading"
    >
      <div className="page-shell flex flex-col gap-4 pb-8 pt-3 sm:gap-5 sm:pb-10 sm:pt-4 md:pb-12 md:pt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:gap-y-5 lg:pb-14 lg:pt-8 xl:gap-x-14">
        <h2
          id="home-curated-heading"
          className="hidden font-serif text-[1.65rem] font-semibold leading-tight tracking-tight text-brand-ink sm:text-3xl md:text-[2rem] lg:col-start-1 lg:row-start-1 lg:block lg:pr-2 lg:text-[2.35rem] xl:pr-4"
        >
          Thoughtfully Curated.{" "}
          <span className="text-brand-gold">Globally Trusted.</span>
        </h2>

        <p className="order-1 text-sm leading-relaxed text-brand-ink/80 sm:text-[0.95rem] md:text-base md:leading-relaxed lg:order-none lg:col-start-1 lg:row-start-2 lg:pr-2 xl:pr-4">
          At Sarveda, we believe sound has the power to restore, transform, and reconnect us
          with ourselves. We curate sound healing instruments, musical instruments, yoga and
          meditation essentials, and conscious lifestyle products. Working closely with
          artisans, musicians, and wellness practitioners across India, we deliver thoughtfully
          selected products to customers in over 60 countries. Beyond products, we&apos;re a
          growing learning community offering courses, workshops, and experiences in sound,
          yoga, and meditation.
        </p>

        <HomeAboutVideo className="order-2 w-full lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-start" />

        <ul className="order-3 grid grid-cols-4 gap-x-2 gap-y-3 sm:gap-x-3 md:gap-x-4 lg:order-none lg:col-start-1 lg:row-start-3 lg:gap-x-4 lg:pr-2 xl:gap-x-6 xl:pr-4">
          {PILLARS.map((pillar) => (
            <li key={pillar.lines[0]} className="flex min-w-0 flex-col items-center text-center">
              <div className="relative mb-1.5 h-8 w-full max-w-[3.75rem] sm:mb-2 sm:h-10 sm:max-w-[4.5rem] md:h-11 md:max-w-[5rem] lg:mb-3 lg:h-14 lg:max-w-[6.5rem] xl:h-16 xl:max-w-[7.5rem]">
                <Image
                  src={pillar.src}
                  alt={pillar.alt}
                  fill
                  sizes="(max-width: 1024px) 80px, 120px"
                  className="object-contain object-center"
                />
              </div>
              <p className="text-[0.58rem] font-semibold leading-snug text-brand-ink sm:text-[0.65rem] md:text-[0.72rem] lg:text-[0.8rem] xl:text-[0.85rem]">
                {pillar.lines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
