import Link from "next/link";

import { CourseCard } from "@/components/content/CourseCard";
import { EventCard } from "@/components/content/EventCard";
import { InsightCard } from "@/components/content/InsightCard";
import type { CourseListItem } from "@/lib/course-types";
import type { EventListItem } from "@/lib/event-types";
import type { BlogListItem } from "@/lib/blog-types";
import { isCourseUpcoming, isEventUpcoming } from "@/lib/content-meta";

type Props = {
  courses: CourseListItem[];
  events: EventListItem[];
  posts: BlogListItem[];
};

function SectionHeader({
  eyebrow,
  title,
  href,
  linkLabel
}: {
  eyebrow: string;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-sage">{eyebrow}</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">{title}</h2>
      </div>
      <Link
        href={href}
        className="text-sm font-semibold text-[#108967] underline-offset-4 hover:underline"
      >
        {linkLabel} →
      </Link>
    </div>
  );
}

export function HomeExperienceSections({ courses, events, posts }: Props) {
  const upcomingCourses = courses.filter((c) => isCourseUpcoming(c)).slice(0, 3);
  const courseCards = (upcomingCourses.length > 0 ? upcomingCourses : courses.slice(0, 3));
  const upcomingEvents = events.filter((e) => isEventUpcoming(e)).slice(0, 3);
  const eventCards = upcomingEvents.length > 0 ? upcomingEvents : events.slice(0, 3);
  const insightCards = posts.slice(0, 3);

  return (
    <>
      {courseCards.length > 0 ? (
        <section className="border-y border-stone-100 bg-white py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Learn with us"
              title="Upcoming & ongoing courses"
              href="/courses"
              linkLabel="View all courses"
            />
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {courseCards.map((course) => (
                <li key={course.id}>
                  <CourseCard course={course} compact />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {eventCards.length > 0 ? (
        <section className="py-12 md:py-16" style={{ background: "#fdf6ed" }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Gather & grow"
              title="Upcoming events"
              href="/events"
              linkLabel="View all events"
            />
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {eventCards.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} compact />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {insightCards.length > 0 ? (
        <section className="border-y border-stone-100 bg-white py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="From our journal"
              title="Insights"
              href="/insights"
              linkLabel="Read all insights"
            />
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {insightCards.map((post) => (
                <li key={post.id}>
                  <InsightCard post={post} compact />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section
        className="py-14 md:py-16"
        style={{ background: "linear-gradient(160deg,#0f1a14 0%,#1e3a2f 100%)" }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-sage">For teams</p>
          <h2 className="mt-3 font-serif text-2xl font-semibold text-white sm:text-3xl">
            Corporate wellness programs
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-stone-300 md:text-base">
            Yoga, sound, and mindfulness for modern workplaces — on-site, online, and retreat formats.
          </p>
          <Link
            href="/corporate-wellness"
            className="mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-brand-gold/50 px-8 text-sm font-semibold text-brand-gold transition-all hover:bg-brand-gold/10"
          >
            Explore corporate wellness
          </Link>
        </div>
      </section>
    </>
  );
}
