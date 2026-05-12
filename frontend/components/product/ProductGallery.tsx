"use client";

import Image from "next/image";
import { useState } from "react";

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
  const main = images[active] ?? images[0];

  if (!main) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-100 text-stone-500">
        No images yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-none border-y border-stone-200 bg-stone-100 md:rounded-2xl md:border md:border-stone-100 md:shadow-sm">
        <Image
          src={main.url}
          alt={main.altText || productName}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
          unoptimized
        />
      </div>
      {images.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              className={`relative h-14 min-h-[44px] w-14 min-w-[44px] overflow-hidden rounded-xl border-2 bg-white transition-colors sm:h-16 sm:w-16 ${
                i === active ? "border-amber-700 ring-2 ring-amber-200" : "border-stone-100 hover:border-amber-400"
              }`}
              aria-label={`View image ${i + 1}`}
            >
              <Image src={img.url} alt="" fill className="object-cover" sizes="64px" unoptimized />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
