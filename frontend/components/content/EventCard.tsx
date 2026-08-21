"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { EventListItem } from "@/lib/event-types";
import { eventCardTypeLabel } from "@/lib/content-meta";

type Props = {
  event: EventListItem;
  compact?: boolean;
};

export function EventCard({ event }: Props) {
  const typeLabel = eventCardTypeLabel(event);
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
      className="group flex h-full flex-col overflow-hidden rounded-xl shadow-card transition-shadow duration-300 hover:shadow-card-hover"
      style={{
        opacity: 0,
        transform: "translateY(24px)",
        transition:
          "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease"
      }}
    >
      <div className="relative overflow-hidden bg-[#EDE4D3]">
        <span className="absolute left-3 top-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center rounded-full border border-brand-gold/70 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-ink shadow-sm backdrop-blur-sm">
          {typeLabel}
        </span>
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={event.title}
            className="block h-auto w-full object-contain object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="aspect-square bg-brand-forest transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-[#23827c] px-4 py-5 text-white">
        <h3 className="font-serif text-[1.35rem] font-semibold leading-snug text-white">
          {event.title}
        </h3>
        <span className="mt-4 inline-flex min-h-[42px] w-fit items-center justify-center rounded-sm bg-[#e87e04] px-6 text-sm font-medium uppercase tracking-wide text-white transition-colors group-hover:bg-[#d47103]">
          Explore
        </span>
      </div>
    </Link>
  );
}
