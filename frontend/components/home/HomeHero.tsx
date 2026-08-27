import Image from "next/image";

/**
 * Homepage hero — full-width banner (photo + spiral + headline baked in).
 * Mobile uses a wide aspect close to the asset so text + face stay visible
 * (tall 4:5 crop was cutting them off).
 */
export function HomeHero() {
  return (
    <section
      className="relative isolate -mt-[8px] overflow-hidden bg-[#ebe4d6] md:mt-0"
      aria-label="Your partner on the journey within"
    >
      <h1 className="sr-only">
        Your Partner on the Journey Within — curated sound healing instruments, yoga essentials,
        and authentic learning experiences for every stage of your practice.
      </h1>

      <div
        className={[
          "relative w-full overflow-hidden",
          /* Near-native banner ratio on phones so left copy + right face remain in frame */
          "aspect-[2.1/1] sm:aspect-[2.2/1]",
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
          className="object-cover object-[42%_42%] sm:object-[45%_40%] md:object-center"
          aria-hidden
        />
      </div>
    </section>
  );
}
