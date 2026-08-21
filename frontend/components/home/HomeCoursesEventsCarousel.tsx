"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CourseCard } from "@/components/content/CourseCard";
import { EventCard } from "@/components/content/EventCard";
import type { CourseListItem } from "@/lib/course-types";
import type { EventListItem } from "@/lib/event-types";
import { isCourseUpcoming, isEventUpcoming } from "@/lib/content-meta";

const HOME_GREEN = "#166D46";

type Props = {
  courses: CourseListItem[];
  events: EventListItem[];
};

type Slot =
  | { kind: "course"; item: CourseListItem }
  | { kind: "event"; item: EventListItem };

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

export function HomeCoursesEventsCarousel({ courses, events }: Props) {
  const upcomingCourses = courses.filter((c) => isCourseUpcoming(c));
  const upcomingEvents = events.filter((e) => isEventUpcoming(e));
  const coursePool = upcomingCourses.length ? upcomingCourses : courses;
  const eventPool = upcomingEvents.length ? upcomingEvents : events;

  const slots: Slot[] = [
    ...coursePool.map((item) => ({ kind: "course" as const, item })),
    ...eventPool.map((item) => ({ kind: "event" as const, item }))
  ];

  const scrollerRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const syncArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(max > 8 && el.scrollLeft < max - 8);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncArrows();
    el.addEventListener("scroll", syncArrows, { passive: true });
    const ro = new ResizeObserver(syncArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncArrows);
      ro.disconnect();
    };
  }, [syncArrows, slots.length]);

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.85, 420);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }

  if (slots.length === 0) return null;

  return (
    <section
      className="bg-[#f9f6f0] py-14 md:py-16 lg:py-20"
      aria-labelledby="home-courses-events-heading"
    >
      <div className="page-shell">
        <div className="text-center">
          <h2
            id="home-courses-events-heading"
            className="font-serif text-[1.65rem] font-semibold tracking-tight sm:text-3xl md:text-[2.15rem]"
          >
            <span style={{ color: HOME_GREEN }}>Explore Our Upcoming</span>{" "}
            <span className="text-brand-gold">Courses &amp; Events</span>
          </h2>
          <Flourish />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[#4a453c] sm:text-[0.95rem]">
            Learn from experienced musicians, sound practitioners and teachers through online
            courses, workshops and immersive experiences.
          </p>
        </div>

        <div className="relative mt-10 lg:mt-12">
          {canPrev ? (
            <button
              type="button"
              onClick={() => scrollByDir(-1)}
              className="absolute -left-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-cream-dark bg-white text-brand-gold shadow-card transition hover:text-brand-forest sm:-left-3 md:-left-5"
              aria-label="Previous courses and events"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : null}

          {canNext || slots.length > 1 ? (
            <button
              type="button"
              onClick={() => scrollByDir(1)}
              disabled={!canNext}
              className={`absolute -right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-cream-dark bg-white text-brand-gold shadow-card transition hover:text-brand-forest sm:-right-3 md:-right-5 ${
                canNext ? "" : "pointer-events-none opacity-0"
              }`}
              aria-label="Next courses and events"
              aria-hidden={!canNext}
              tabIndex={canNext ? 0 : -1}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : null}

          <ul
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] lg:gap-6 [&::-webkit-scrollbar]:hidden"
          >
            {slots.map((slot) => (
              <li
                key={slot.kind === "course" ? `course-${slot.item.id}` : `event-${slot.item.id}`}
                className="w-[min(86vw,22rem)] shrink-0 snap-start sm:w-[min(48%,20rem)] lg:w-[calc((100%-3rem)/3)]"
              >
                {slot.kind === "course" ? (
                  <CourseCard course={slot.item} compact />
                ) : (
                  <EventCard event={slot.item} compact />
                )}
              </li>
            ))}
          </ul>
        </div>

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
  );
}
