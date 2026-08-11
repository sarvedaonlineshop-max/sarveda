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
      <div className="mx-auto w-[90%] max-w-[1600px] py-14 md:w-[80%] md:py-16 lg:py-20">
        <div className="grid items-center gap-10 md:gap-12 lg:grid-cols-2 lg:gap-14">
          <div className="min-w-0">
            <h2
              id="home-curated-heading"
              className="font-serif text-[1.65rem] font-semibold leading-tight tracking-tight text-brand-ink sm:text-3xl md:text-[2.15rem] lg:text-[2.35rem]"
            >
              Thoughtfully Curated.{" "}
              <span className="text-brand-gold">Globally Trusted.</span>
            </h2>

            <p className="mt-5 text-sm leading-relaxed text-brand-ink/80 sm:mt-6 sm:text-[0.95rem] md:text-base md:leading-relaxed">
              At Sarveda, we believe sound has the power to restore, transform, and reconnect us
              with ourselves. We curate sound healing instruments, musical instruments, yoga and
              meditation essentials, and conscious lifestyle products. Working closely with
              artisans, musicians, and wellness practitioners across India, we deliver thoughtfully
              selected products to customers in over 60 countries. Beyond products, we&apos;re a
              growing learning community offering courses, workshops, and experiences in sound,
              yoga, and meditation.
            </p>

            <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-7 sm:mt-10 sm:gap-x-6 md:gap-y-8">
              {PILLARS.map((pillar) => (
                <li key={pillar.lines[0]} className="flex flex-col items-center text-center">
                  <div className="relative mb-2.5 h-14 w-full max-w-[7.5rem] sm:mb-3 sm:h-16 sm:max-w-[8.5rem]">
                    <Image
                      src={pillar.src}
                      alt={pillar.alt}
                      fill
                      sizes="140px"
                      className="object-contain object-center"
                    />
                  </div>
                  <p className="text-[0.7rem] font-semibold leading-snug text-brand-ink sm:text-xs md:text-[0.8rem]">
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

          <div className="relative w-full">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] sm:rounded-[2rem]">
              <Image
                src="/images/home/curated-trusted-studio.jpg"
                alt="Practitioners meditating together in a bright yoga studio"
                fill
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover object-center"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
