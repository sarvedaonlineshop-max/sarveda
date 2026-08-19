import Image from "next/image";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
};

/** Full-width hero — contain on mobile so cover art isn’t stretched/cropped. */
export function ContentHeroBanner({ src, alt, priority }: Props) {
  return (
    <div className="relative w-full overflow-hidden bg-[#f4efe6]">
      <div className="relative mx-auto aspect-[16/9] w-full max-h-[42vh] md:max-h-[min(52vh,560px)]">
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          className="object-contain object-center md:object-cover"
          sizes="100vw"
          unoptimized
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 hidden md:block"
        style={{
          background:
            "linear-gradient(to top, rgba(15,26,20,0.55) 0%, rgba(15,26,20,0.15) 45%, rgba(15,26,20,0.05) 100%)"
        }}
      />
    </div>
  );
}
