import Image from "next/image";
import Link from "next/link";

import type { EventListItem } from "@/lib/event-types";
import { eventTypeLabel, formatEventCardWhen, parseEventTeachers } from "@/lib/content-meta";

import { InstructorAvatars } from "./InstructorAvatars";

type Props = {
  event: EventListItem;
  compact?: boolean;
};

export function EventCard({ event }: Props) {
  const when = formatEventCardWhen(event);
  const typeLabel = eventTypeLabel(event);
  const teachers = parseEventTeachers(event.extra);

  return (
    <Link
      href={`/event/${event.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-brand-cream-dark bg-brand-ivory shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
    >
      <div className="relative w-full shrink-0 overflow-visible bg-[#EDE4D3]">
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              style={{ objectFit: "cover", objectPosition: "center" }}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 bg-forest-gradient" />
          )}
          <span className="absolute left-2.5 top-2.5 z-10 inline-flex rounded-full border border-brand-gold-pale/40 bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-forest backdrop-blur-sm">
            {typeLabel}
          </span>
        </div>
        <InstructorAvatars
          people={teachers}
          className="absolute bottom-0 right-3 z-10 translate-y-1/2"
        />
      </div>

      <div className={`flex min-w-0 flex-1 flex-col gap-3 p-5 ${teachers.length ? "pt-7" : ""}`}>
        <h3 className="font-serif text-xl font-semibold leading-snug tracking-tight text-brand-ink md:text-[1.35rem]">
          {event.title}
        </h3>
        {when ? (
          <p className="whitespace-pre-line text-sm text-brand-muted">{when}</p>
        ) : null}
        <span className="mt-auto inline-flex w-fit items-center rounded-full border border-brand-forest px-4 py-2 text-xs font-semibold text-brand-forest transition-colors group-hover:bg-brand-forest group-hover:text-brand-cream">
          Explore event
        </span>
      </div>
    </Link>
  );
}
