import Image from "next/image";

/**
 * Homepage hero — banner photo + spiral overlay + HTML copy.
 *
 * Mobile: two columns so the woman stays leftmost and the headline
 * sits on the right without covering her. Desktop keeps the wide
 * overlay (text left, photo across the banner).
 */
export function HomeHero() {
  return (
    <section
      className="relative isolate -mt-[8px] overflow-hidden bg-[#ebe4d6] md:mt-0"
      aria-label="Your partner on the journey within"
    >
      {/* Mobile / tablet: photo left, copy right */}
      <div className="grid grid-cols-2 md:hidden">
        <div className="relative min-h-[22.5rem] sm:min-h-[26rem]">
          <Image
            src="/images/home/homepage-banner.png"
            alt=""
            fill
            priority
            quality={90}
            sizes="50vw"
            className="object-cover object-[78%_32%]"
            aria-hidden
          />
        </div>
        <div className="relative flex flex-col justify-center px-3 py-8 sm:px-5">
          <div
            className="pointer-events-none absolute inset-y-[8%] right-0 w-[90%] opacity-40"
            aria-hidden
          >
            <Image
              src="/images/home/hero-spiral-overlay.png"
              alt=""
              fill
              sizes="40vw"
              className="object-contain object-right"
            />
          </div>
          <div className="relative z-[1] text-right">
            <h1
              className="font-serif font-semibold leading-[1.14] tracking-tight text-[#1a2e26]"
              style={{ fontSize: "clamp(1.35rem, 0.7rem + 4.4vw, 2.15rem)" }}
            >
              Your Partner on the Journey{" "}
              <span className="text-[#b98a3e]">Within</span>
            </h1>
            <p
              className="mt-2.5 ml-auto leading-relaxed text-[#1a2e26]/90"
              style={{
                fontSize: "clamp(0.78rem, 0.65rem + 0.7vw, 0.95rem)",
                maxWidth: "28ch"
              }}
            >
              Curated sound healing instruments, yoga essentials, and authentic learning
              experiences for every stage of your practice.
            </p>
          </div>
        </div>
      </div>

      {/* Desktop: full-bleed banner with left-aligned copy */}
      <div className="relative hidden w-full overflow-hidden md:block md:aspect-[2939/1285]">
        <Image
          src="/images/home/homepage-banner.png"
          alt=""
          fill
          priority
          quality={90}
          sizes="100vw"
          className="object-cover object-center"
          aria-hidden
        />

        <div
          className="pointer-events-none absolute inset-y-[4%] left-0 z-[1] w-[min(32%,28rem)] opacity-80 lg:w-[min(30%,32rem)] xl:w-[min(28%,36rem)]"
          aria-hidden
        >
          <Image
            src="/images/home/hero-spiral-overlay.png"
            alt=""
            fill
            sizes="30vw"
            className="object-contain object-left"
          />
        </div>

        <div className="absolute inset-0 z-[2] flex items-start px-[6%] pt-[9%] lg:px-[8%] lg:pt-[8%] xl:px-[9%] xl:pt-[7.5%]">
          <div className="max-w-[min(36rem,46vw)] lg:max-w-[min(44rem,42vw)]">
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
              className="mt-5 leading-relaxed text-[#1a2e26]/85"
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
