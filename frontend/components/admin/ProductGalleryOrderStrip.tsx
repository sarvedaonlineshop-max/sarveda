"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";

export type GalleryOrderItem = {
  url: string;
  altText?: string;
  isPrimary?: boolean;
};

type Props = {
  images: GalleryOrderItem[];
  onReorder: (from: number, to: number) => void;
};

/**
 * Compact thumbnail strip for drag-reorder.
 * Only filled images participate; empty upload slots stay in place below.
 */
export function ProductGalleryOrderStrip({ images, onReorder }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const filled = images
    .map((im, index) => ({ im, index }))
    .filter(({ im }) => im.url.trim());

  if (filled.length < 2) return null;

  return (
    <div className="rounded-lg border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-card-bg,#fff)] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
          Gallery order
        </p>
        <p className="text-[11px] text-[var(--admin-text-muted,#8a7060)]">
          Drag thumbnails · position 1 is the primary storefront image
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {filled.map(({ im, index }, visualPos) => {
          const isDragging = dragIndex === index;
          const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <li
              key={`${index}-${im.url.slice(-24)}`}
              draggable
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overIndex !== index) setOverIndex(index);
              }}
              onDragLeave={() => {
                if (overIndex === index) setOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                const src = Number.isFinite(from) ? from : dragIndex;
                if (src != null && src >= 0) onReorder(src, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`relative flex w-[76px] cursor-grab flex-col items-center gap-1 rounded-lg border bg-[var(--admin-input-bg,#faf9f7)] p-1.5 active:cursor-grabbing ${
                isDragging
                  ? "opacity-40 border-amber-400"
                  : isOver
                    ? "border-amber-500 ring-2 ring-amber-300"
                    : visualPos === 0
                      ? "border-amber-400"
                      : "border-[var(--admin-card-border,#e8e2d9)]"
              }`}
              title={im.altText || `Image ${visualPos + 1}`}
            >
              <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] font-bold text-white">
                {visualPos + 1}
              </span>
              <span className="absolute right-1 top-1 text-stone-400">
                <GripVertical size={12} />
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={im.url.trim()}
                alt=""
                className="h-14 w-14 rounded-md object-cover"
                draggable={false}
              />
              {visualPos === 0 ? (
                <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                  Primary
                </span>
              ) : (
                <span className="text-[9px] text-stone-400">Gallery</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
