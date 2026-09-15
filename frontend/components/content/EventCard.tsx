"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { EventListItem } from "@/lib/event-types";
import { eventCardTypeLabel, formatEventCardWhen } from "@/lib/content-meta";
import { resolveMediaUrl } from "@/lib/media-cdn";
import { formatINRFromPaise } from "@/lib/money";

import {
  CONTENT_CARD_HEIGHT,
  CONTENT_CARD_IMAGE_BAND,
  CONTENT_CARD_PANEL_BG
} from "./content-card-layout";

type Props = {
  event: EventListItem;
  compact?: boolean;
};

function plainText(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

export function EventCard({ event, compact = false }: Props) {
  const typeLabel = eventCardTypeLabel(event);
  const explanation = plainText(event.shortDescription);
  const when = formatEventCardWhen(event);
  const imageSrc = resolveMediaUrl(event.imageUrl);
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Link
      ref={ref}
      href={`/event/${event.slug}`}
      className={`group flex ${CONTENT_CARD_HEIGHT} w-full flex-col overflow-hidden rounded-xl shadow-card transition-shadow duration-300 hover:shadow-card-hover`}
      style={{
        opacity: 0,
        transform: "translateY(24px)",
        transition:
          "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease"
      }}
    >
      <div className={`relative ${CONTENT_CARD_IMAGE_BAND} shrink-0 overflow-hidden bg-[#EDE4D3]`}>
        <span className="absolute left-3 top-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center rounded-full border border-white/70 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-ink shadow-sm backdrop-blur-sm">
          {typeLabel}
        </span>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-brand-forest transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
      </div>

      <div
        className="relative flex min-h-0 flex-1 flex-col text-white"
        style={{ background: CONTENT_CARD_PANEL_BG }}
      >
        {/* Match CourseCard top padding (avatar seam space) so panels align in the carousel. */}
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-2 pt-9 sm:px-5">
          <h3
            className={`font-serif font-semibold leading-snug text-white ${
              compact
                ? "line-clamp-2 text-[1.05rem] sm:text-[1.15rem]"
                : "line-clamp-2 text-[1.1rem] sm:text-[1.2rem]"
            }`}
          >
            {event.title}
          </h3>

          {explanation ? (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-white/85 sm:text-[13px]">
              {explanation}
            </p>
          ) : null}

          <div className="mt-4 min-w-0 space-y-1.5 border-l-[3px] border-white pl-3">
            {when ? (
              <p
                className={`text-[13px] leading-snug text-white/90 sm:text-[14px] ${
                  compact ? "line-clamp-2" : "line-clamp-3 whitespace-pre-line"
                }`}
              >
                {compact ? when.replace(/\n/g, " · ") : when}
              </p>
            ) : null}
            {event.venue?.trim() ? (
              <p className="line-clamp-1 text-[13px] leading-snug text-white sm:text-[14px]">
                {event.venue.trim()}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-end justify-between gap-3 border-t border-white/15 px-4 pb-4 pt-3 sm:px-5">
          <p className="text-sm font-semibold tabular-nums text-white/95">
            {event.priceInPaise <= 0 ? "Free" : formatINRFromPaise(event.priceInPaise)}
          </p>
          <span className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-sm bg-[#e87e04] px-5 text-sm font-medium uppercase tracking-wide text-white transition-colors group-hover:bg-[#d47103]">
            Explore
          </span>
        </div>
      </div>
    </Link>
  );
}
