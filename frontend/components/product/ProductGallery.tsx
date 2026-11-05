"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveMediaUrl } from "@/lib/media-cdn";
import { blockProductImageContextMenu, productImageClassName } from "@/lib/product-image-guard";
import { parseVideoSource, type VideoSource } from "@/lib/video-embed";
import { isGalleryVideoUrl, placeFirstVideoSecond } from "@/lib/gallery-media";

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
  /** When false, skip appending videoUrl if images already include embed URLs (carousel sync). */
  appendLegacyVideo?: boolean;
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
  videoUrl,
  appendLegacyVideo = true
}: Props) {
  const [internalActive, setInternalActive] = useState(0);
  const [zoomActive, setZoomActive] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const swipeRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const controlled = activeIndex !== undefined && onActiveChange !== undefined;
  const active = controlled ? activeIndex : internalActive;

  const setActive = useCallback(
    (index: number) => {
      if (controlled) onActiveChange(index);
      else setInternalActive(index);
    },
    [controlled, onActiveChange]
  );

  const sourceMedia = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = [];
    for (const img of images) {
      const resolved = resolveMediaUrl(img.url) ?? img.url;
      if (isGalleryVideoUrl(resolved)) {
        const source = parseVideoSource(resolved.trim());
        const playUrl =
          source.type === "file" ? resolveMediaUrl(source.url) ?? source.url : resolved.trim();
        items.push({
          kind: "video",
          id: img.id,
          url: playUrl,
          altText: img.altText,
          source
        });
      } else {
        items.push({
          kind: "image",
          id: img.id,
          url: resolved,
          altText: img.altText
        });
      }
    }
    if (appendLegacyVideo && videoUrl && videoUrl.trim() && !items.some((i) => i.kind === "video")) {
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
  }, [images, videoUrl, productName, appendLegacyVideo]);

  const media = useMemo(
    () => placeFirstVideoSecond(sourceMedia, (item) => item.kind === "video"),
    [sourceMedia]
  );

  const sourceIndex = Math.min(Math.max(active, 0), Math.max(sourceMedia.length - 1, 0));
  const currentSource = sourceMedia[sourceIndex];
  const displayIndex = currentSource ? Math.max(0, media.indexOf(currentSource)) : 0;
  const current = media[displayIndex];

  const selectDisplay = useCallback(
    (index: number) => {
      const item = media[index];
      const orig = item ? sourceMedia.indexOf(item) : index;
      setActive(orig >= 0 ? orig : index);
      setZoomActive(false);
    },
    [media, sourceMedia, setActive]
  );

  // Pause any playing video whenever the active media item changes.
  useEffect(() => {
    if (current?.kind !== "video" && videoRef.current) {
      videoRef.current.pause();
    }
  }, [displayIndex, current?.kind]);

  const go = (delta: number) => {
    if (!media.length) return;
    const next = (displayIndex + delta + media.length) % media.length;
    selectDisplay(next);
  };

  const onMainPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return;
    if (!enableZoom || current?.kind !== "image") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
  };

  const onSwipeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || !hasMultiple) return;
    swipeRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    setDragging(true);
    setZoomActive(false);
  };

  const onSwipeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
      swipeRef.current = null;
      setDragX(0);
      setDragging(false);
      return;
    }
    setDragX(dx);
  };

  const onSwipeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    const dx = e.clientX - start.x;
    swipeRef.current = null;
    setDragX(0);
    setDragging(false);
    if (dx <= -48) go(1);
    else if (dx >= 48) go(-1);
  };

  if (!media.length || !current) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-brand-cream-dark bg-[#EDE4D3] text-brand-muted">
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
        className="relative aspect-square w-full touch-pan-y overflow-hidden rounded-2xl bg-[#f6f1e8]"
        onMouseEnter={() => zoomEnabled && !dragging && setZoomActive(true)}
        onMouseLeave={() => setZoomActive(false)}
        onMouseMove={onMainPointerMove}
        onPointerDown={onSwipeDown}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeUp}
        onPointerCancel={onSwipeUp}
        onContextMenu={blockProductImageContextMenu}
      >
        <div
          className="flex h-full will-change-transform"
          style={{
            width: `${media.length * 100}%`,
            transform: `translate3d(calc(-${displayIndex * (100 / media.length)}% + ${dragX}px), 0, 0)`,
            transition: dragging ? "none" : "transform 380ms cubic-bezier(0.22, 0.8, 0.28, 1)"
          }}
        >
          {media.map((item, index) => (
            <div
              key={item.id}
              className="relative h-full"
              style={{ width: `${100 / media.length}%` }}
            >
              {item.kind === "video" && item.source.type !== "file" ? (
                index === displayIndex ? (
                  <iframe
                    src={item.source.embedUrl}
                    title={item.altText || `${productName} video`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full bg-black"
                  />
                ) : (
                  <span className="block h-full w-full bg-black" />
                )
              ) : item.kind === "video" ? (
                <video
                  ref={index === displayIndex ? videoRef : undefined}
                  src={item.url}
                  controls
                  playsInline
                  className="h-full w-full bg-black object-contain"
                />
              ) : (
                <div
                  className="relative h-full w-full transition-transform duration-150 ease-out"
                  style={
                    index === displayIndex
                      ? {
                          transform: zoomActive ? "scale(2.15)" : "scale(1)",
                          transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`
                        }
                      : undefined
                  }
                >
                  <Image
                    src={item.url}
                    alt={item.altText || productName}
                    fill
                    className={`object-contain object-center ${productImageClassName}`}
                    sizes="(max-width: 1024px) 100vw, 48vw"
                    priority={index === 0}
                    unoptimized
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {zoomEnabled ? (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-brand-ivory/85 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.18em] text-brand-muted">
            Hover to zoom
          </span>
        ) : null}

        {hasMultiple ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-cream-dark bg-brand-ivory/95 text-brand-forest shadow-md transition hover:bg-brand-ivory"
              aria-label="Previous media"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-cream-dark bg-brand-ivory/95 text-brand-forest shadow-md transition hover:bg-brand-ivory"
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-cream-dark bg-brand-ivory text-brand-forest hover:border-brand-gold"
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
              onClick={() => selectDisplay(index)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-brand-cream-dark/40 transition-colors ${
                index === displayIndex ? "border-brand-forest" : "border-brand-cream-dark hover:border-brand-gold"
              }`}
              aria-label={item.kind === "video" ? "Play video" : `View image ${index + 1}`}
              aria-current={index === displayIndex}
              onContextMenu={item.kind === "image" ? blockProductImageContextMenu : undefined}
            >
              {item.kind === "video" ? (
                <>
                  {item.source.type === "youtube" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.source.thumbnailUrl}
                      alt=""
                      className={`h-full w-full bg-black object-cover ${productImageClassName}`}
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
                <Image
                  src={item.url}
                  alt=""
                  fill
                  className={`object-contain object-center ${productImageClassName}`}
                  sizes="64px"
                  unoptimized
                />
              )}
            </button>
          ))}
        </div>

        {hasMultiple ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-cream-dark bg-brand-ivory text-brand-forest hover:border-brand-gold"
            aria-label="Next thumbnail"
          >
            ›
          </button>
        ) : null}
      </div>
    </div>
  );
}
