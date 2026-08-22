import Image from "next/image";

/**
 * Homepage section 2 — “Thoughtfully Curated. Globally Trusted.”
 * Original pillar icons from data/Homepage-Images + studio photo.
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
      className="border-b border-brand-cream-dark/50 bg-[#f9f6f0]"
      aria-labelledby="home-curated-heading"
    >
      <div className="page-shell pb-8 pt-3 sm:pb-10 sm:pt-4 md:pb-12 md:pt-6 lg:pb-14 lg:pt-8">
        <div className="grid grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] items-start gap-3 sm:grid-cols-2 sm:gap-5 md:gap-8 lg:gap-12">
          <div className="min-w-0">
            <h2
              id="home-curated-heading"
              className="font-serif text-[1.05rem] font-semibold leading-[1.2] tracking-tight text-brand-ink sm:text-2xl md:text-[2rem] lg:text-[2.35rem] lg:leading-tight"
            >
              Thoughtfully Curated.{" "}
              <span className="text-brand-gold">Globally Trusted.</span>
            </h2>

            <p className="mt-2.5 text-[0.72rem] leading-relaxed text-brand-ink/80 sm:mt-4 sm:text-sm md:mt-5 md:text-base md:leading-relaxed">
              At Sarveda, we believe sound has the power to restore, transform, and reconnect us
              with ourselves. We curate sound healing instruments, musical instruments, yoga and
              meditation essentials, and conscious lifestyle products. Working closely with
              artisans, musicians, and wellness practitioners across India, we deliver thoughtfully
              selected products to customers in over 60 countries. Beyond products, we&apos;re a
              growing learning community offering courses, workshops, and experiences in sound,
              yoga, and meditation.
            </p>

            <ul className="mt-4 grid grid-cols-4 gap-x-1.5 gap-y-0 sm:mt-6 sm:gap-x-3 md:mt-8 md:gap-x-4">
              {PILLARS.map((pillar) => (
                <li key={pillar.lines[0]} className="flex min-w-0 flex-col items-center text-center">
                  <div className="relative mb-1 h-7 w-full max-w-[2.75rem] sm:mb-1.5 sm:h-9 sm:max-w-[4rem] md:h-11 md:max-w-[5rem]">
                    <Image
                      src={pillar.src}
                      alt={pillar.alt}
                      fill
                      sizes="80px"
                      className="object-contain object-center"
                    />
                  </div>
                  <p className="text-[0.5rem] font-semibold leading-snug text-brand-ink sm:text-[0.62rem] md:text-[0.72rem]">
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

          <div className="relative min-w-0 self-start">
            <div className="relative aspect-[5/4] max-h-[7.25rem] overflow-hidden rounded-xl sm:max-h-[9.5rem] sm:rounded-2xl md:max-h-[12rem] lg:max-h-none lg:aspect-[3/2] lg:rounded-[1.75rem]">
              <Image
                src="/images/home/curated-trusted-studio.jpg"
                alt="Practitioners meditating together in a bright yoga studio"
                fill
                sizes="(max-width: 640px) 42vw, (max-width: 1024px) 45vw, 40vw"
                className="object-cover object-center"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
