import Image from "next/image";
import Link from "next/link";

import { CourseCard } from "@/components/content/CourseCard";
import { EventCard } from "@/components/content/EventCard";
import { HomeTrustedPartners } from "@/components/home/HomeTrustedPartners";
import type { CourseListItem } from "@/lib/course-types";
import type { EventListItem } from "@/lib/event-types";
import { isCourseUpcoming, isEventUpcoming } from "@/lib/content-meta";

type Props = {
  courses: CourseListItem[];
  events: EventListItem[];
};

function Flourish() {
  return (
    <svg viewBox="0 0 120 20" className="mx-auto mt-3 h-4 w-28 text-brand-gold" fill="none" aria-hidden>
      <path
        d="M8 10h28M84 10h28M52 10c-6-8 6-8 0 0 6 8-6 8 0 0M60 10c-6-8 6-8 0 0 6 8-6 8 0 0M68 10c-6-8 6-8 0 0 6 8-6 8 0 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="60" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

function LotusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-gold" fill="none" aria-hidden>
      <path
        d="M12 20c-2-3-5-5-5-9 2 1 4 1 5 0 1 1 3 1 5 0 0 4-3 6-5 9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 11c-1-3 0-6 0-6s1 3 0 6ZM7 12c-3-2-4-5-4-5s3 1 4 5ZM17 12c3-2 4-5 4-5s-3 1-4 5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HomeExperienceSections({ courses, events }: Props) {
  const upcomingCourses = courses.filter((c) => isCourseUpcoming(c));
  const upcomingEvents = events.filter((e) => isEventUpcoming(e));

  type Slot =
    | { kind: "course"; item: CourseListItem }
    | { kind: "event"; item: EventListItem };
  const slots: Slot[] = [];
  for (const c of upcomingCourses.length ? upcomingCourses : courses) {
    if (slots.length >= 3) break;
    slots.push({ kind: "course", item: c });
  }
  for (const e of upcomingEvents.length ? upcomingEvents : events) {
    if (slots.length >= 3) break;
    slots.push({ kind: "event", item: e });
  }

  return (
    <>
      {slots.length > 0 ? (
        <section
          className="bg-[#f9f6f0] py-14 md:py-16 lg:py-20"
          aria-labelledby="home-courses-events-heading"
        >
          <div className="page-shell">
            <div className="text-center">
              <h2
                id="home-courses-events-heading"
                className="font-serif text-[1.65rem] font-semibold tracking-tight text-brand-ink sm:text-3xl md:text-[2.15rem]"
              >
                Explore Our Upcoming{" "}
                <span className="text-brand-gold">Courses &amp; Events</span>
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-brand-ink/70 sm:text-[0.95rem]">
                Learn from experienced musicians, sound practitioners and teachers through
                online courses, workshops and immersive experiences.
              </p>
            </div>

            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-6">
              {slots.map((slot) =>
                slot.kind === "course" ? (
                  <li key={`course-${slot.item.id}`}>
                    <CourseCard course={slot.item} compact />
                  </li>
                ) : (
                  <li key={`event-${slot.item.id}`}>
                    <EventCard event={slot.item} compact />
                  </li>
                )
              )}
            </ul>

            <div className="mt-10 text-center md:mt-12">
              <Link
                href="/courses"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-brand-gold px-8 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-[#a37934]"
              >
                View All Courses
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section
        className="bg-white py-14 md:py-16 lg:py-20"
        aria-labelledby="home-corporate-heading"
      >
        <div className="page-shell grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-gold sm:text-xs">
              <LotusIcon />
              Corporate Wellness Programs
            </p>
            <h2
              id="home-corporate-heading"
              className="mt-3 font-serif text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl md:text-[2.25rem]"
            >
              <span className="text-brand-forest">Wellness that Resonates.</span>
              <br />
              <span className="text-brand-gold">Impact that Lasts.</span>
            </h2>
            <Flourish />
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-brand-ink/75 sm:text-[0.95rem] md:text-base">
              We partner with organizations to create long-term wellness journeys that
              nurture well-being, creativity and connection. From monthly mindfulness
              sessions to immersive retreats, our programs are tailored to your team&apos;s
              needs.
            </p>
            <Link
              href="/corporate-wellness"
              className="mt-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-brand-forest px-7 text-sm font-semibold tracking-wide text-brand-cream transition-colors hover:bg-brand-night"
            >
              Explore Our Corporate Programs
              <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="relative w-full">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] sm:rounded-[2rem]">
              <Image
                src="/images/home/corporate-wellness.jpg"
                alt="Corporate sound healing and mindfulness session with singing bowls"
                fill
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover object-center"
              />
            </div>
          </div>
        </div>
      </section>

      <HomeTrustedPartners />
    </>
  );
}
