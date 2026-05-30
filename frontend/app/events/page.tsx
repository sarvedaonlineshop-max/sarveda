import type { Metadata } from "next";
import Link from "next/link";

import { EventCard } from "@/components/content/EventCard";
import { ContentCardGrid, ContentListingSection } from "@/components/content/ContentListingSection";
import { fetchEvents } from "@/lib/api";
import { splitEvents } from "@/lib/content-meta";
import { canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "Workshops, webinars, and live experiences at Sarveda — yoga, sound healing, and wellness.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/events") }
};

export default async function EventsPage() {
  const events = await fetchEvents({ cache: "no-store" });
  const { upcoming, past } = splitEvents(events);

  return (
    <>
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            Events
          </h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Enlightening talks &amp; webinars on yoga, meditation &amp; Ayurveda — join live online or in person.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-6 lg:px-8">
        {events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Events are being updated.{" "}
            <Link href="/courses" className="font-medium text-amber-800 underline">
              View courses
            </Link>
          </p>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <ContentListingSection title="Upcoming Events">
                <ContentCardGrid>
                  {upcoming.map((event) => (
                    <li key={event.id}>
                      <EventCard event={event} />
                    </li>
                  ))}
                </ContentCardGrid>
              </ContentListingSection>
            ) : null}

            {past.length > 0 ? (
              <ContentListingSection title="Past Events">
                <ContentCardGrid>
                  {past.map((event) => (
                    <li key={event.id}>
                      <EventCard event={event} />
                    </li>
                  ))}
                </ContentCardGrid>
              </ContentListingSection>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
