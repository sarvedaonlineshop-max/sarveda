"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { EventListItem } from "@/lib/event-types";
import { eventCardTypeLabel, formatEventCardWhen } from "@/lib/content-meta";
import { formatINRFromPaise } from "@/lib/money";

import { CONTENT_CARD_HEIGHT } from "./CourseCard";

type Props = {
  event: EventListItem;
  compact?: boolean;
};

const IMAGE_BAND = "h-[15.5rem] sm:h-[17rem]";

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

export function EventCard({ event }: Props) {
  const typeLabel = eventCardTypeLabel(event);
  const explanation = plainText(event.shortDescription);
  const when = formatEventCardWhen(event);
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
      className={`group flex ${CONTENT_CARD_HEIGHT} flex-col overflow-hidden rounded-xl shadow-card transition-shadow duration-300 hover:shadow-card-hover`}
      style={{
        opacity: 0,
        transform: "translateY(24px)",
        transition:
          "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease"
      }}
    >
      <div className={`relative ${IMAGE_BAND} shrink-0 overflow-hidden bg-[#EDE4D3]`}>
        <span className="absolute left-3 top-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center rounded-full border border-brand-gold/70 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-ink shadow-sm backdrop-blur-sm">
          {typeLabel}
        </span>
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={event.title}
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-brand-forest transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col bg-[#23827c] text-white">
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.45)_transparent]"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <h3 className="font-serif text-[1.2rem] font-semibold leading-snug text-white sm:text-[1.3rem]">
            {event.title}
          </h3>

          {explanation ? (
            <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-white/85 sm:text-[14px]">
              {explanation}
            </p>
          ) : null}

          <div className="mt-3 min-w-0 border-l-4 border-white/90 pl-3">
            {when ? (
              <p className="whitespace-pre-line text-[14px] leading-snug text-white/90 sm:text-[15px]">
                {when}
              </p>
            ) : null}
            {event.venue?.trim() ? (
              <p className="mt-1 text-[14px] text-white sm:text-[15px]">{event.venue.trim()}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-end justify-between gap-3 border-t border-white/15 px-4 pb-4 pt-3">
          <p className="text-sm font-semibold tabular-nums text-white/95">
            {event.priceInPaise <= 0 ? "Free" : formatINRFromPaise(event.priceInPaise)}
          </p>
          <span className="ml-auto inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-sm bg-[#e87e04] px-5 text-sm font-medium uppercase tracking-wide text-white transition-colors group-hover:bg-[#d47103]">
            Explore
          </span>
        </div>
      </div>
    </Link>
  );
}
