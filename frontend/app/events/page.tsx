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
      <div className="border-b-[3px] border-brand-gold" style={{ background: "linear-gradient(160deg, #1c352a 0%, #10201a 100%)" }}>
        <div className="page-shell-classic py-8 lg:py-10">
          <p className="sv-listing-hero-fade text-[10px] font-bold uppercase tracking-[0.22em] text-brand-gold-pale">
            Gather with us
          </p>
          <h1 className="sv-listing-hero-fade mt-2.5 font-serif text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-[#fffbf5]">
            Events
          </h1>
          <p className="sv-listing-hero-fade-late mt-2.5 max-w-xl text-base leading-relaxed text-white/75">
            Enlightening talks &amp; webinars on yoga, meditation &amp; Ayurveda — join live online or in person.
          </p>
          <div className="sv-listing-hero-fade-late mt-3.5 h-0.5 w-12 bg-brand-gold" />
        </div>
      </div>

      <main className="page-shell-classic space-y-14 py-14">
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
