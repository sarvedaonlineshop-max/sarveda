import Image from "next/image";

/**
 * Homepage hero.
 * Desktop uses the wide artboard, which already includes the headline.
 * Mobile uses the portrait photo, with the headline over the pale lower edge.
 */
export function HomeHero() {
  return (
    <section
      className="relative isolate -mt-[8px] overflow-hidden bg-[#f6f1e8] md:mt-0"
      aria-label="Your partner on the journey within"
    >
      <div className="relative aspect-[1024/692] w-full md:hidden">
        <Image
          src="/images/home/homepage-banner-mobile.jpg"
          alt=""
          fill
          priority
          quality={75}
          sizes="100vw"
          className="object-cover object-center"
          aria-hidden
        />
      </div>

      <div className="relative hidden w-full md:block">
        <Image
          src="/images/home/homepage-banner-web.png"
          alt=""
          width={1920}
          height={840}
          priority
          quality={80}
          sizes="100vw"
          className="h-auto w-full"
          aria-hidden
        />
      </div>

      <h1 className="absolute inset-x-0 bottom-0 z-10 px-5 pb-4 font-serif text-[1.65rem] font-semibold leading-[1.12] tracking-tight text-[#1a2e26] sm:px-8 sm:text-[2rem] md:sr-only">
        Your Partner on the Journey <span className="text-[#b98a3e]">Within</span>
      </h1>
      <p className="sr-only">
        Curated sound healing instruments, yoga essentials, and authentic learning experiences
        for every stage of your practice.
      </p>
    </section>
  );
}
