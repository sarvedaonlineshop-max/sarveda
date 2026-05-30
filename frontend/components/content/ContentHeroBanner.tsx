import Image from "next/image";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
};

/** Full-width hero image (matches live sarveda.com course/event headers). */
export function ContentHeroBanner({ src, alt, priority }: Props) {
  return (
    <div className="relative h-[min(52vh,560px)] w-full bg-stone-900">
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        className="object-cover"
        sizes="100vw"
        unoptimized
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(15,26,20,0.85) 0%, rgba(15,26,20,0.35) 45%, rgba(15,26,20,0.15) 100%)"
        }}
      />
    </div>
  );
}
