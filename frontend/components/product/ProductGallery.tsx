"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

import { resolveMediaUrl } from "@/lib/media-cdn";

type GalleryImage = {
  id: string;
  url: string;
  altText: string | null;
};

type Props = {
  images: GalleryImage[];
  productName: string;
  activeIndex?: number;
  onActiveChange?: (index: number) => void;
};

export function ProductGallery({ images, productName, activeIndex, onActiveChange }: Props) {
  const [internalActive, setInternalActive] = useState(0);
  const controlled = activeIndex !== undefined && onActiveChange !== undefined;
  const active = controlled ? activeIndex : internalActive;

  const setActive = useCallback(
    (index: number) => {
      if (controlled) onActiveChange(index);
      else setInternalActive(index);
    },
    [controlled, onActiveChange]
  );

  const resolved = images.map((img) => ({
    ...img,
    url: resolveMediaUrl(img.url) ?? img.url
  }));

  const go = (delta: number) => {
    if (!resolved.length) return;
    const next = (active + delta + resolved.length) % resolved.length;
    setActive(next);
  };

  if (!resolved.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-100 text-stone-500">
        No images yet
      </div>
    );
  }

  const current = resolved[Math.min(active, resolved.length - 1)] ?? resolved[0];
  const hasMultiple = resolved.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <Image
          key={current.id}
          src={current.url}
          alt={current.altText || productName}
          fill
          className="object-contain p-2 transition-opacity duration-200"
          sizes="(max-width: 1024px) 100vw, 42vw"
          priority
          unoptimized
        />

        {hasMultiple ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-700 shadow-md transition hover:bg-white"
              aria-label="Previous image"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-700 shadow-md transition hover:bg-white"
              aria-label="Next image"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        ) : null}
      </div>

      {/* Thumbnail strip — always visible when we have images */}
      <div className="flex items-center gap-2">
        {hasMultiple ? (
          <button
            type="button"
            onClick={() => go(-1)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:border-[#108967]"
            aria-label="Previous thumbnail"
          >
            ‹
          </button>
        ) : null}

        <div className="scrollbar-hide flex flex-1 gap-2 overflow-x-auto py-1">
          {resolved.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-white transition-colors ${
                index === active ? "border-stone-900" : "border-stone-200 hover:border-[#108967]"
              }`}
              aria-label={`View image ${index + 1}`}
              aria-current={index === active}
            >
              <Image src={image.url} alt="" fill className="object-cover" sizes="64px" unoptimized />
            </button>
          ))}
        </div>

        {hasMultiple ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:border-[#108967]"
            aria-label="Next thumbnail"
          >
            ›
          </button>
        ) : null}
      </div>
    </div>
  );
}
