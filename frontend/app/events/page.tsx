import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageListHero } from "@/components/layout/PageListHero";
import { fetchEvents } from "@/lib/api";
import { formatINRFromPaise } from "@/lib/money";
import { canonical, isProductionSite } from "@/lib/site";

/** Always fetch live events after WP import (avoids empty ISR cache on demo). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "Workshops, webinars, and live experiences at Sarveda — yoga, sound healing, and wellness.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/events") }
};

function formatEventDateParts(iso: string): { day: string; month: string; full: string } {
  try {
    const d = new Date(iso);
    return {
      day: String(d.getDate()),
      month: d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase(),
      full: d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      })
    };
  } catch {
    return { day: "—", month: "—", full: iso };
  }
}

export default async function EventsPage() {
  const events = await fetchEvents({ cache: "no-store" });

  return (
    <>
      <PageListHero
        variant="sage"
        eyebrow="Gatherings"
        title={
          <>
            Live <span className="italic" style={{ color: "rgba(255,255,255,0.85)" }}>events</span>
          </>
        }
        subtitle="Join live workshops and gatherings — online and in person across India."
      />

      <main className="bg-brand-bg mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[rgba(196,176,232,0.35)] bg-brand-ivory p-12 text-center text-brand-mid">
            Events are being updated.{" "}
            <Link href="/courses" className="font-medium text-brand-violet underline hover:text-brand-violet-mid">
              View courses
            </Link>
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => {
              const dateParts = formatEventDateParts(event.startDate);
              const isFree = event.priceInPaise === 0;
              const eventType = event.isOnline ? "Online workshop" : "In-person gathering";

              return (
                <li key={event.id}>
                  <Link
                    href={`/event/${event.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory transition-shadow hover:shadow-card-hover"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-brand-violet-light">
                      {event.imageUrl ? (
                        <Image
                          src={event.imageUrl}
                          alt={event.title}
                          fill
                          className="object-cover transition duration-300 group-hover:scale-[1.02]"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-brand-muted">Sarveda</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex gap-4">
                        <div className="flex h-[72px] w-[56px] flex-shrink-0 flex-col items-center justify-center rounded-xl bg-brand-violet-light px-2 py-2 text-center">
                          <span className="display-text text-[26px] font-normal leading-none text-brand-violet-deep">
                            {dateParts.day}
                          </span>
                          <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-brand-violet">
                            {dateParts.month}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-normal uppercase tracking-[0.14em] text-brand-sage">
                            {eventType}
                          </p>
                          <h2 className="display-text mt-1 text-xl font-normal leading-snug text-brand-ink group-hover:text-brand-violet">
                            {event.title}
                          </h2>
                          <p className="mt-1 text-[11px] font-light text-brand-muted">{dateParts.full}</p>
                        </div>
                      </div>
                      {event.shortDescription ? (
                        <p className="mt-3 line-clamp-3 text-sm font-light text-brand-mid">
                          {event.shortDescription}
                        </p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                        <span
                          className={`price-text rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                            isFree
                              ? "bg-brand-sage-light text-brand-green"
                              : "bg-brand-violet-light text-brand-violet-deep"
                          }`}
                        >
                          {isFree ? "Free" : formatINRFromPaise(event.priceInPaise)}
                        </span>
                        <span className="rounded-lg bg-brand-violet px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-white transition-colors group-hover:bg-brand-violet-mid">
                          Register
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
