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
  enableZoom?: boolean;
  videoUrl?: string | null;
};

export function ProductGallery({
  images,
  productName,
  activeIndex,
  onActiveChange,
  enableZoom = true,
  videoUrl
}: Props) {
  const [internalActive, setInternalActive] = useState(0);
  const [zoomActive, setZoomActive] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [videoOpen, setVideoOpen] = useState(false);

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
    setZoomActive(false);
  };

  const onMainPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enableZoom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
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
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm"
        onMouseEnter={() => enableZoom && setZoomActive(true)}
        onMouseLeave={() => setZoomActive(false)}
        onMouseMove={onMainPointerMove}
      >
        <div
          className="relative h-full w-full transition-transform duration-150 ease-out"
          style={{
            transform: zoomActive ? "scale(2.15)" : "scale(1)",
            transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`
          }}
        >
          <Image
            key={current.id}
            src={current.url}
            alt={current.altText || productName}
            fill
            className="object-contain p-3"
            sizes="(max-width: 1024px) 100vw, 48vw"
            priority
            unoptimized
          />
        </div>

        {enableZoom ? (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-stone-600 shadow-sm">
            Hover to zoom
          </span>
        ) : null}

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

      {videoUrl ? (
        <button
          type="button"
          onClick={() => setVideoOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left transition hover:border-[#c45a2a]/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1e3a2f] text-white">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 4.2a1 1 0 011.05.1l7.2 4.8a1 1 0 010 1.66l-7.2 4.8A1 1 0 016 14.8V5.2a1 1 0 01.3-.8z" />
            </svg>
          </span>
          <span className="text-sm font-medium text-stone-800">Watch product video</span>
        </button>
      ) : null}

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

      {videoOpen && videoUrl ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setVideoOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setVideoOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-3 py-1 text-sm text-white"
            >
              Close
            </button>
            <video
              src={resolveMediaUrl(videoUrl) ?? videoUrl}
              controls
              autoPlay
              className="max-h-[80vh] w-full"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
