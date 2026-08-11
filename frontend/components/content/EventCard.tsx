import Image from "next/image";
import Link from "next/link";

import type { EventListItem } from "@/lib/event-types";
import { eventTypeLabel, formatEventCardWhen } from "@/lib/content-meta";

type Props = {
  event: EventListItem;
  compact?: boolean;
};

export function EventCard({ event, compact = false }: Props) {
  const when = formatEventCardWhen(event);
  const typeLabel = eventTypeLabel(event);
  const heightClass = compact ? "min-h-[360px]" : "min-h-[420px] md:min-h-[480px]";

  return (
    <Link
      href={`/event/${event.slug}`}
      className={`group relative block overflow-hidden rounded-3xl bg-brand-night shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover ${heightClass}`}
    >
      {event.imageUrl ? (
        <Image
          src={event.imageUrl}
          alt={event.title}
          fill
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-forest-gradient" />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(16,32,26,0.9) 0%, rgba(16,32,26,0.5) 45%, rgba(16,32,26,0.1) 75%, transparent 100%)"
        }}
      />

      <div className="absolute inset-x-0 bottom-0 p-5 text-brand-cream md:p-6">
        <span className="inline-flex rounded-full border border-brand-gold-pale/30 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-gold-pale backdrop-blur-sm">
          {typeLabel}
        </span>
        <h3 className="mt-3 font-serif text-xl font-semibold leading-snug tracking-tight md:text-[1.35rem]">{event.title}</h3>
        {when ? (
          <p className="mt-3 whitespace-pre-line text-sm text-brand-cream/80">{when}</p>
        ) : null}
        <span className="mt-4 inline-flex items-center rounded-full border border-brand-cream/40 px-4 py-1.5 text-xs font-semibold text-brand-cream transition-colors group-hover:border-brand-cream/70 group-hover:bg-brand-cream/10">
          Explore event
        </span>
      </div>
    </Link>
  );
}
