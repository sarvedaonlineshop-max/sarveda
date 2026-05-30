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
      className={`group relative block overflow-hidden rounded-sm bg-stone-900 shadow-md transition hover:shadow-xl ${heightClass}`}
    >
      {event.imageUrl ? (
        <Image
          src={event.imageUrl}
          alt={event.title}
          fill
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a2f] to-[#0f1a14]" />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.1) 75%, transparent 100%)"
        }}
      />

      <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f5d88a]">{typeLabel}</p>
        <h3 className="mt-2 font-serif text-lg font-semibold leading-snug md:text-xl">{event.title}</h3>
        {when ? (
          <p className="mt-3 whitespace-pre-line text-sm text-white/85">{when}</p>
        ) : null}
        <span className="mt-4 inline-block text-sm font-semibold text-[#f5d88a] group-hover:underline">
          Explore →
        </span>
      </div>
    </Link>
  );
}
