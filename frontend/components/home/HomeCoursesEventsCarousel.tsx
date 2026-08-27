"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { SectionFlourish } from "@/components/brand/SectionFlourish";
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

function SlotCard({ slot }: { slot: Slot }) {
  return slot.kind === "course" ? (
    <CourseCard course={slot.item} compact />
  ) : (
    <EventCard event={slot.item} compact />
  );
}

/**
 * Manual horizontal rail only — no auto-scroll.
 * Important: do NOT set touch-pan-x; that blocks vertical page scroll on mobile
 * when the finger starts over this section.
 */
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
      className="bg-[#f9f6f0] pb-6 pt-14 md:pb-8 md:pt-16 lg:pb-10 lg:pt-20"
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
          <SectionFlourish />
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
              className="absolute -left-1 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-cream-dark bg-white text-brand-gold shadow-card transition hover:text-brand-forest sm:flex sm:-left-3 md:-left-5"
              aria-label="Previous courses and events"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : null}

          {canNext ? (
            <button
              type="button"
              onClick={() => scrollByDir(1)}
              className="absolute -right-1 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-cream-dark bg-white text-brand-gold shadow-card transition hover:text-brand-forest sm:flex sm:-right-3 md:-right-5"
              aria-label="Next courses and events"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : null}

          <ul
            ref={scrollerRef}
            className="flex gap-5 overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] lg:gap-6 [&::-webkit-scrollbar]:hidden"
          >
            {slots.map((slot) => (
              <li
                key={
                  slot.kind === "course"
                    ? `course-${slot.item.id}`
                    : `event-${slot.item.id}`
                }
                className="flex w-[min(86vw,22rem)] shrink-0 self-stretch sm:w-[min(48%,20rem)] lg:w-[calc((100%-3rem)/3)]"
              >
                <div className="w-full">
                  <SlotCard slot={slot} />
                </div>
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
