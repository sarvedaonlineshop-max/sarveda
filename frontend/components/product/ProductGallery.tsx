"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
  const setActive = controlled ? onActiveChange : setInternalActive;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const resolved = images.map((img) => ({
    ...img,
    url: resolveMediaUrl(img.url) ?? img.url
  }));

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const width = node.clientWidth;
    node.scrollTo({ left: active * width, behavior: "smooth" });
  }, [active]);

  const go = (delta: number) => {
    if (!resolved.length) return;
    setActive((active + delta + resolved.length) % resolved.length);
  };

  const scrollThumbs = (dir: -1 | 1) => {
    const el = thumbRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 120, behavior: "smooth" });
  };

  if (!resolved.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-100 text-stone-500">
        No images yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div
          ref={scrollerRef}
          className="scrollbar-hide flex snap-x snap-mandatory overflow-x-auto rounded-lg bg-white"
          onScroll={(event) => {
            const width = event.currentTarget.clientWidth || 1;
            const index = Math.round(event.currentTarget.scrollLeft / width);
            if (index !== active) setActive(index);
          }}
        >
          {resolved.map((image, index) => (
            <div key={image.id} className="relative aspect-square w-full min-w-full flex-shrink-0 snap-center">
              <Image
                src={image.url}
                alt={image.altText || productName}
                fill
                className="object-contain p-2"
                sizes="(max-width: 1024px) 100vw, 48vw"
                priority={index === 0}
                unoptimized
              />
            </div>
          ))}
        </div>

        {resolved.length > 1 ? (
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

      {resolved.length > 1 ? (
        <div className="relative flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollThumbs(-1)}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 sm:flex"
            aria-label="Scroll thumbnails left"
          >
            ‹
          </button>
          <div
            ref={thumbRef}
            className="scrollbar-hide flex flex-1 gap-2 overflow-x-auto py-1"
          >
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
          <button
            type="button"
            onClick={() => scrollThumbs(1)}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 sm:flex"
            aria-label="Scroll thumbnails right"
          >
            ›
          </button>
        </div>
      ) : null}

      <div className="flex justify-center gap-2 sm:hidden">
        {resolved.map((image, index) => (
          <button
            key={`dot-${image.id}`}
            type="button"
            aria-label={`Show image ${index + 1}`}
            onClick={() => setActive(index)}
            className={`h-2 rounded-full transition-all ${
              index === active ? "w-6 bg-[#108967]" : "w-2 bg-stone-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
