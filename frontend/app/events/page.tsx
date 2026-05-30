import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

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

function formatEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}

export default async function EventsPage() {
  const events = await fetchEvents({ cache: "no-store" });

  return (
    <>
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            Events
          </h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Join live workshops and gatherings — online and in person across India.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Events are being updated.{" "}
            <Link href="/courses" className="font-medium text-amber-800 underline">
              View courses
            </Link>
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/event/${event.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-stone-100">
                    {event.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <Image
                        src={event.imageUrl}
                        alt={event.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                      {formatEventDate(event.startDate)}
                      {event.isOnline ? " · Online" : event.venue ? ` · ${event.venue}` : ""}
                    </p>
                    <h2 className="mt-2 font-serif text-lg font-semibold text-stone-900 group-hover:text-amber-900">
                      {event.title}
                    </h2>
                    {event.shortDescription ? (
                      <p className="mt-2 line-clamp-3 text-sm text-stone-600">{event.shortDescription}</p>
                    ) : null}
                    <p className="mt-auto pt-4 text-sm font-medium text-stone-800">
                      {event.priceInPaise > 0
                        ? formatINRFromPaise(event.priceInPaise)
                        : "Free / enquire"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
