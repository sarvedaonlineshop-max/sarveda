import Image from "next/image";

/**
 * Homepage hero — Downloads banner photo + spiral overlay + HTML copy.
 * (Banner PNG is the photo only; text/logo overlay are layered in code.)
 *
 * Mobile: keep the woman on the left and sit the headline in the open
 * sky on the right so the two do not overlap. Desktop stays text-left.
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
          "md:aspect-[2939/1285]"
        ].join(" ")}
      >
        <Image
          src="/images/home/homepage-banner.png"
          alt=""
          fill
          priority
          quality={90}
          sizes="100vw"
          className="object-cover object-[100%_34%] sm:object-[96%_32%] md:object-center"
          aria-hidden
        />

        {/* Soft wash behind mobile copy on the right */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[62%] bg-gradient-to-l from-[#ebe4d6]/80 via-[#ebe4d6]/35 to-transparent md:hidden"
          aria-hidden
        />

        {/* Spiral watermark — desktop left; mobile sits under the right-hand copy */}
        <div
          className="pointer-events-none absolute inset-y-[4%] left-auto right-0 z-[1] w-[min(48%,15rem)] opacity-50 sm:w-[min(40%,18rem)] md:left-0 md:right-auto md:block md:w-[min(32%,28rem)] md:opacity-80 lg:w-[min(30%,32rem)] xl:w-[min(28%,36rem)]"
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
              "absolute right-4 top-[10%] w-[min(58%,16.75rem)] text-right",
              "sm:right-6 sm:top-[11%] sm:w-[min(50%,20rem)]",
              "md:static md:right-auto md:top-auto md:w-auto md:max-w-[min(36rem,46vw)] md:px-0 md:text-left",
              "lg:max-w-[min(44rem,42vw)]"
            ].join(" ")}
          >
            <h1
              className="font-serif font-semibold leading-[1.12] tracking-tight text-[#1a2e26]"
              style={{
                fontSize: "clamp(1.45rem, 0.85rem + 3.4vw, 4rem)",
                textShadow: "0 1px 2px rgba(247,241,230,0.55)"
              }}
            >
              Your Partner on the Journey{" "}
              <span className="text-[#b98a3e]">Within</span>
            </h1>
            <p
              className="mt-2.5 ml-auto leading-relaxed text-[#1a2e26]/90 sm:mt-3.5 md:mt-5 md:ml-0 md:text-[#1a2e26]/85"
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
