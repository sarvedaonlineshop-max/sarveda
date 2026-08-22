import Image from "next/image";

/**
 * Homepage hero — ultra-wide lakeside banner.
 * Mobile: tighter crop on the right (practitioner); copy position locked.
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
          "relative w-full overflow-hidden",
          "aspect-[4/5] sm:aspect-[5/6]",
          "md:aspect-[1024/447]"
        ].join(" ")}
      >
        <Image
          src="/images/home/hero-journey-within-photo.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[86%_48%] sm:object-[84%_46%] md:object-left md:object-center"
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
              "px-4 sm:px-8 md:px-0",
              "absolute left-0 right-0 top-[32%] w-full max-w-[22rem] sm:top-[30%] sm:max-w-[26rem]",
              "md:static md:top-auto md:max-w-[min(36rem,46vw)] lg:max-w-[min(44rem,42vw)]"
            ].join(" ")}
          >
            <h1
              className="font-serif font-semibold leading-[1.12] tracking-tight text-[#1a2e26]"
              style={{
                fontSize: "clamp(1.65rem, 1rem + 3.2vw, 4rem)",
                textShadow: "0 1px 2px rgba(247,241,230,0.55)"
              }}
            >
              Your Partner on the Journey{" "}
              <span className="text-[#b98a3e]">Within</span>
            </h1>
            <p
              className="mt-2.5 leading-relaxed text-[#1a2e26]/90 sm:mt-3.5 md:mt-5 md:text-[#1a2e26]/85"
              style={{
                fontSize: "clamp(0.85rem, 0.7rem + 0.7vw, 1.25rem)",
                maxWidth: "36ch",
                textShadow: "0 1px 2px rgba(247,241,230,0.5)"
              }}
            >
              Curated sound healing instruments, yoga essentials, and authentic learning
              experiences for every stage of your practice.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
