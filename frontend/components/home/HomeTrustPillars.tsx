import Image from "next/image";

/**
 * Homepage section 2 — “Thoughtfully Curated. Globally Trusted.”
 * Mobile: text + pillars first, image below.
 * Desktop: 50/50 text and image; image height matches left column.
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
      <div className="page-shell grid grid-cols-1 items-start gap-6 pb-8 pt-3 sm:pb-10 sm:pt-4 md:pb-12 md:pt-6 lg:grid-cols-2 lg:items-stretch lg:gap-8 lg:pb-14 lg:pt-8 xl:gap-10">
        <div className="min-w-0 lg:flex lg:flex-col lg:justify-center lg:py-2 lg:pr-4 xl:pr-6">
          <h2
            id="home-curated-heading"
            className="font-serif text-[1.65rem] font-semibold leading-tight tracking-tight text-brand-ink sm:text-3xl md:text-[2rem] lg:text-[2.35rem]"
          >
            Thoughtfully Curated.{" "}
            <span className="text-brand-gold">Globally Trusted.</span>
          </h2>

          <p className="mt-4 text-sm leading-relaxed text-brand-ink/80 sm:mt-5 sm:text-[0.95rem] md:text-base md:leading-relaxed">
            At Sarveda, we believe sound has the power to restore, transform, and reconnect us
            with ourselves. We curate sound healing instruments, musical instruments, yoga and
            meditation essentials, and conscious lifestyle products. Working closely with
            artisans, musicians, and wellness practitioners across India, we deliver thoughtfully
            selected products to customers in over 60 countries. Beyond products, we&apos;re a
            growing learning community offering courses, workshops, and experiences in sound,
            yoga, and meditation.
          </p>

          <ul className="mt-6 grid grid-cols-4 gap-x-2 gap-y-0 sm:mt-8 sm:gap-x-3 md:gap-x-4">
            {PILLARS.map((pillar) => (
              <li key={pillar.lines[0]} className="flex min-w-0 flex-col items-center text-center">
                <div className="relative mb-1.5 h-8 w-full max-w-[3.75rem] sm:mb-2 sm:h-10 sm:max-w-[4.5rem] md:h-11 md:max-w-[5rem]">
                  <Image
                    src={pillar.src}
                    alt={pillar.alt}
                    fill
                    sizes="80px"
                    className="object-contain object-center"
                  />
                </div>
                <p className="text-[0.58rem] font-semibold leading-snug text-brand-ink sm:text-[0.65rem] md:text-[0.72rem]">
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

        <div className="relative min-w-0 lg:self-stretch">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl sm:aspect-[2/1] lg:mr-[4.25rem] lg:aspect-auto lg:h-full lg:min-h-[320px] lg:rounded-[1.75rem] lg:rounded-r-2xl xl:mr-[5rem] 2xl:mr-[5.5rem]">
            <Image
              src="/images/home/curated-trusted-studio.jpg"
              alt="Practitioners meditating together in a bright yoga studio"
              fill
              sizes="(max-width: 1024px) 92vw, 55vw"
              className="object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
