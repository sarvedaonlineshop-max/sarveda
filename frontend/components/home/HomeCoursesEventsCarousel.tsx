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
 * Manual horizontal rail with NO overflow-x scroll container.
 * CSS forces overflow-y:auto whenever overflow-x is not visible, which traps
 * vertical page scroll on mobile. We translate the track instead so vertical
 * swipes always scroll the page; horizontal swipes move the cards.
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

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [offset, setOffset] = useState(0);
  const [maxOffset, setMaxOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const gestureRef = useRef<{
    startX: number;
    startY: number;
    startOffset: number;
    axis: "undecided" | "h" | "v";
    pointerId: number | null;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const max = Math.max(0, track.scrollWidth - viewport.clientWidth);
    setMaxOffset(max);
    setOffset((o) => Math.min(Math.max(0, o), max));
  }, []);

  useEffect(() => {
    measure();
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure, slots.length]);

  const clampOffset = useCallback(
    (value: number) => Math.min(Math.max(0, value), maxOffset),
    [maxOffset]
  );

  function scrollByDir(dir: -1 | 1) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const step = Math.min(viewport.clientWidth * 0.85, 420);
    setOffset((o) => clampOffset(o + dir * step));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    suppressClickRef.current = false;
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffset: offset,
      axis: "undecided",
      pointerId: e.pointerId,
      moved: false
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.axis === "undecided") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Vertical wins → release gesture; page scrolls (touch-action: pan-y)
      g.axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      if (g.axis === "v") {
        gestureRef.current = null;
        setDragging(false);
        return;
      }
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    if (g.axis !== "h") return;
    g.moved = true;
    suppressClickRef.current = true;
    e.preventDefault();
    setOffset(clampOffset(g.startOffset - dx));
  }

  function endPointer(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    gestureRef.current = null;
    setDragging(false);
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = false;
  }

  if (slots.length === 0) return null;

  const canPrev = offset > 4;
  const canNext = offset < maxOffset - 4;

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

          {/* overflow-hidden clips cards only — not a scrollport (no overflow-x/y:auto) */}
          <div
            ref={viewportRef}
            className="overflow-hidden pb-2"
            style={{ touchAction: "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
          >
            <ul
              ref={trackRef}
              className={`flex w-max gap-5 lg:gap-6 ${dragging ? "" : "transition-transform duration-300 ease-out"}`}
              style={{ transform: `translate3d(${-offset}px, 0, 0)` }}
            >
              {slots.map((slot) => (
                <li
                  key={
                    slot.kind === "course"
                      ? `course-${slot.item.id}`
                      : `event-${slot.item.id}`
                  }
                  className="flex w-[min(86vw,22rem)] shrink-0 self-stretch sm:w-[min(48%,20rem)] lg:w-[calc((100vw-8rem-3rem)/3)] xl:w-[calc((72rem-3rem)/3)]"
                >
                  <div className="w-full">
                    <SlotCard slot={slot} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
