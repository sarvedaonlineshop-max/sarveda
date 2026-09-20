import Image from "next/image";

/**
 * Homepage hero — banner photo + spiral overlay + HTML copy.
 *
 * Mobile: full-bleed photo with the woman on the left and the headline
 * overlaid on the mist to her right. Desktop keeps text-left on the wide crop.
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
          "aspect-[4/5] min-h-[22.5rem] sm:aspect-[5/6] sm:min-h-[26rem]",
          "md:aspect-[2939/1285] md:min-h-0"
        ].join(" ")}
      >
        <Image
          src="/images/home/homepage-banner.png"
          alt=""
          fill
          priority
          quality={90}
          sizes="100vw"
          className="object-cover object-[88%_30%] sm:object-[84%_28%] md:object-center"
          aria-hidden
        />

        {/* Light wash so right-hand copy stays readable without hiding the photo */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[58%] bg-gradient-to-l from-[#ebe4d6]/45 via-[#ebe4d6]/15 to-transparent md:hidden"
          aria-hidden
        />

        <div
          className="pointer-events-none absolute inset-y-[4%] left-auto right-0 z-[1] w-[min(46%,15rem)] opacity-45 sm:w-[min(40%,18rem)] md:left-0 md:right-auto md:w-[min(32%,28rem)] md:opacity-80 lg:w-[min(30%,32rem)] xl:w-[min(28%,36rem)]"
          aria-hidden
        >
          <Image
            src="/images/home/hero-spiral-overlay.png"
            alt=""
            fill
            sizes="(max-width: 768px) 48vw, 30vw"
            className="object-contain object-right md:object-left"
          />
        </div>

        <div className="absolute inset-0 z-[2] md:flex md:items-start md:px-[6%] md:pt-[9%] lg:px-[8%] lg:pt-[8%] xl:px-[9%] xl:pt-[7.5%]">
          <div
            className={[
              "absolute right-4 top-[11%] w-[min(54%,16.75rem)] text-right",
              "sm:right-6 sm:top-[12%] sm:w-[min(48%,20rem)]",
              "md:static md:right-auto md:top-auto md:w-auto md:max-w-[min(36rem,46vw)] md:text-left",
              "lg:max-w-[min(44rem,42vw)]"
            ].join(" ")}
          >
            <h1
              className="font-serif font-semibold leading-[1.12] tracking-tight text-[#1a2e26]"
              style={{
                fontSize: "clamp(1.4rem, 0.75rem + 3.8vw, 4rem)",
                textShadow: "0 1px 2px rgba(247,241,230,0.55)"
              }}
            >
              Your Partner on the Journey{" "}
              <span className="text-[#b98a3e]">Within</span>
            </h1>
            <p
              className="mt-2.5 ml-auto leading-relaxed text-[#1a2e26]/90 sm:mt-3.5 md:ml-0 md:mt-5 md:text-[#1a2e26]/85"
              style={{
                fontSize: "clamp(0.8rem, 0.68rem + 0.65vw, 1.25rem)",
                maxWidth: "30ch",
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
