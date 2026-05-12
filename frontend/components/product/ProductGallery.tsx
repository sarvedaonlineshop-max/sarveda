"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type GalleryImage = {
  id: string;
  url: string;
  altText: string | null;
};

type Props = {
  images: GalleryImage[];
  productName: string;
};

export function ProductGallery({ images, productName }: Props) {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const width = node.clientWidth;
    node.scrollTo({ left: active * width, behavior: "smooth" });
  }, [active]);

  if (!images.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-100 text-stone-500">
        No images yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <div
        ref={scrollerRef}
        className="scrollbar-hide flex snap-x snap-mandatory overflow-x-auto rounded-none border-y border-stone-200 bg-stone-100 md:rounded-2xl md:border md:border-stone-100 md:shadow-sm"
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth || 1;
          const index = Math.round(event.currentTarget.scrollLeft / width);
          if (index !== active) setActive(index);
        }}
      >
        {images.map((image, index) => (
          <div key={image.id} className="relative aspect-square w-full min-w-full flex-shrink-0 snap-center">
            <Image
              src={image.url}
              alt={image.altText || productName}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority={index === 0}
              unoptimized
            />
          </div>
        ))}
      </div>

      {images.length > 1 ? (
        <>
          <div className="flex justify-center gap-2 md:hidden">
            {images.map((image, index) => (
              <button
                key={`dot-${image.id}`}
                type="button"
                aria-label={`Show image ${index + 1}`}
                onClick={() => setActive(index)}
                className={`h-2 rounded-full transition-all ${
                  index === active ? "w-6 bg-amber-600" : "w-2 bg-stone-300"
                }`}
              />
            ))}
          </div>
          <div className="hidden flex-wrap gap-2 md:flex">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setActive(index)}
                className={`relative h-16 w-16 overflow-hidden rounded-xl border-2 bg-white transition-colors ${
                  index === active ? "border-amber-700 ring-2 ring-amber-200" : "border-stone-100 hover:border-amber-400"
                }`}
                aria-label={`View image ${index + 1}`}
              >
                <Image src={image.url} alt="" fill className="object-cover" sizes="64px" unoptimized />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
