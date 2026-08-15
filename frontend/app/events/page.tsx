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
      <div className="border-b border-brand-cream-dark/60 bg-white">
        <div className="page-shell py-12 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">
            Gather with us
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
            Events
          </h1>
          <p className="mt-3 max-w-2xl text-brand-muted">
            Enlightening talks &amp; webinars on yoga, meditation &amp; Ayurveda — join live online or in person.
          </p>
        </div>
      </div>

      <main className="page-shell space-y-14 py-14">
        {events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-brand-cream-dark bg-white p-12 text-center text-brand-muted">
            Events are being updated.{" "}
            <Link href="/courses" className="font-medium text-brand-gold underline hover:text-brand-forest">
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
