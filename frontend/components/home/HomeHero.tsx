import Image from "next/image";

/**
 * Homepage hero — ultra-wide lakeside banner.
 * Mobile: crop toward practitioner + bowls on the right; compact copy top-left.
 * Desktop: full banner with copy on open water at left.
 */
export function HomeHero() {
  return (
    <section
      className="relative isolate -mt-[8px] overflow-hidden bg-[#ebe4d6] md:mt-0"
      aria-label="Your partner on the journey within"
    >
      <div
        className={[
          "relative w-full",
          /* Mobile: taller frame, subject (woman + bowls) on the right */
          "aspect-[4/5] sm:aspect-[5/6]",
          /* Desktop: natural ultra-wide banner */
          "md:aspect-[1024/447]"
        ].join(" ")}
      >
        <Image
          src="/images/home/hero-journey-within-photo.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[78%_52%] sm:object-[76%_50%] md:object-left md:object-center"
          aria-hidden
        />

        {/* Spiral watermark — desktop only */}
        <div
          className="pointer-events-none absolute inset-y-[4%] left-0 z-[1] hidden w-[min(32%,28rem)] opacity-80 md:block lg:w-[min(30%,32rem)] xl:w-[min(28%,36rem)]"
          aria-hidden
        >
          <Image
            src="/images/home/hero-spiral-overlay.png"
            alt=""
            fill
            sizes="(max-width: 768px) 48vw, 30vw"
            className="object-contain object-left"
          />
        </div>

        <div className="absolute inset-0 z-[2] md:flex md:items-start md:px-[6%] md:pt-[9%] lg:px-[8%] lg:pt-[8%] xl:px-[9%] xl:pt-[7.5%]">
          <div
            className={[
              "px-4 sm:px-6 md:px-0",
              "absolute left-0 top-[6%] w-full max-w-[11.5rem] sm:top-[8%] sm:max-w-[14rem]",
              "md:static md:top-auto md:max-w-[min(36rem,46vw)] lg:max-w-[min(44rem,42vw)]"
            ].join(" ")}
          >
            <h1 className="font-serif text-[1.2rem] font-semibold leading-[1.15] tracking-tight text-[#1a2e26] [text-shadow:0_1px_2px_rgba(247,241,230,0.55)] sm:text-[1.45rem] md:text-[clamp(1.75rem,1rem+2.4vw,4rem)] md:leading-[1.12]">
              Your Partner on the Journey{" "}
              <span className="text-[#b98a3e]">Within</span>
            </h1>
            <p className="mt-1.5 max-w-[28ch] text-[0.68rem] leading-snug text-[#1a2e26]/90 [text-shadow:0_1px_2px_rgba(247,241,230,0.5)] sm:mt-2 sm:max-w-[32ch] sm:text-[0.78rem] md:mt-5 md:max-w-[36ch] md:text-[clamp(0.85rem,0.7rem+0.7vw,1.25rem)] md:leading-relaxed md:text-[#1a2e26]/85">
              Curated sound healing instruments, yoga essentials, and authentic learning
              experiences for every stage of your practice.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
