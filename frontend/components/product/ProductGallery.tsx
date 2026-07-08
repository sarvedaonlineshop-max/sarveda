"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveMediaUrl } from "@/lib/media-cdn";
import { parseVideoSource, type VideoSource } from "@/lib/video-embed";

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

type MediaItem =
  | { kind: "image"; id: string; url: string; altText: string | null }
  | { kind: "video"; id: string; url: string; altText: string | null; source: VideoSource };

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
  const videoRef = useRef<HTMLVideoElement>(null);

  const controlled = activeIndex !== undefined && onActiveChange !== undefined;
  const active = controlled ? activeIndex : internalActive;

  const setActive = useCallback(
    (index: number) => {
      if (controlled) onActiveChange(index);
      else setInternalActive(index);
    },
    [controlled, onActiveChange]
  );

  const media = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = images.map((img) => ({
      kind: "image" as const,
      id: img.id,
      url: resolveMediaUrl(img.url) ?? img.url,
      altText: img.altText
    }));
    if (videoUrl && videoUrl.trim()) {
      const source = parseVideoSource(videoUrl.trim());
      const playUrl = source.type === "file" ? resolveMediaUrl(source.url) ?? source.url : videoUrl.trim();
      items.push({
        kind: "video",
        id: `video-${videoUrl.trim()}`,
        url: playUrl,
        altText: `${productName} video`,
        source
      });
    }
    return items;
  }, [images, videoUrl, productName]);

  const safeActive = Math.min(Math.max(active, 0), Math.max(media.length - 1, 0));
  const current = media[safeActive];

  // Pause any playing video whenever the active media item changes.
  useEffect(() => {
    if (current?.kind !== "video" && videoRef.current) {
      videoRef.current.pause();
    }
  }, [safeActive, current?.kind]);

  const go = (delta: number) => {
    if (!media.length) return;
    const next = (safeActive + delta + media.length) % media.length;
    setActive(next);
    setZoomActive(false);
  };

  const onMainPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enableZoom || current?.kind !== "image") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
  };

  if (!media.length || !current) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-100 text-stone-500">
        No media yet
      </div>
    );
  }

  const hasMultiple = media.length > 1;
  const isVideo = current.kind === "video";
  const zoomEnabled = enableZoom && !isVideo;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm"
        onMouseEnter={() => zoomEnabled && setZoomActive(true)}
        onMouseLeave={() => setZoomActive(false)}
        onMouseMove={onMainPointerMove}
      >
        {isVideo && current.source.type !== "file" ? (
          <iframe
            key={current.id}
            src={current.source.embedUrl}
            title={current.altText || `${productName} video`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full bg-black"
          />
        ) : isVideo ? (
          <video
            key={current.id}
            ref={videoRef}
            src={current.url}
            controls
            playsInline
            className="h-full w-full bg-black object-contain"
          />
        ) : (
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
        )}

        {zoomEnabled ? (
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
              aria-label="Previous media"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-700 shadow-md transition hover:bg-white"
              aria-label="Next media"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        ) : null}
      </div>

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
          {media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(index)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-white transition-colors ${
                index === safeActive ? "border-stone-900" : "border-stone-200 hover:border-[#108967]"
              }`}
              aria-label={item.kind === "video" ? "Play video" : `View image ${index + 1}`}
              aria-current={index === safeActive}
            >
              {item.kind === "video" ? (
                <>
                  {item.source.type === "youtube" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.source.thumbnailUrl}
                      alt=""
                      className="h-full w-full bg-black object-cover"
                    />
                  ) : item.source.type === "file" ? (
                    <video
                      src={`${item.url}#t=0.1`}
                      muted
                      preload="metadata"
                      className="h-full w-full bg-black object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-black" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-900">
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 4.2a1 1 0 011.05.1l7.2 4.8a1 1 0 010 1.66l-7.2 4.8A1 1 0 016 14.8V5.2a1 1 0 01.3-.8z" />
                      </svg>
                    </span>
                  </span>
                </>
              ) : (
                <Image src={item.url} alt="" fill className="object-cover" sizes="64px" unoptimized />
              )}
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
