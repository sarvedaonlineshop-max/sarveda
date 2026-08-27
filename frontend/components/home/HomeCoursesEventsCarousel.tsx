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
const AUTO_SPEED = 0.45;
/** Ignore tiny pointer jitter before treating as a drag (px). */
const DRAG_THRESHOLD = 6;

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
  const rafRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const [paused, setPaused] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const pauseAuto = useCallback(() => {
    clearResumeTimer();
    setPaused(true);
  }, [clearResumeTimer]);

  const scheduleResume = useCallback(
    (ms = 1400) => {
      clearResumeTimer();
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        setPaused(false);
      }, ms);
    },
    [clearResumeTimer]
  );

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

  useEffect(() => {
    if (slots.length <= 1 || paused) return;

    const step = () => {
      const el = scrollerRef.current;
      if (!el) return;

      const loopWidth = el.scrollWidth / 2;
      if (loopWidth <= el.clientWidth + 4) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      el.scrollLeft += AUTO_SPEED;
      if (el.scrollLeft >= loopWidth) {
        el.scrollLeft -= loopWidth;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [paused, slots.length]);

  useEffect(() => {
    return () => clearResumeTimer();
  }, [clearResumeTimer]);

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    pauseAuto();
    const amount = Math.min(el.clientWidth * 0.85, 420);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
    scheduleResume(2000);
  }

  function onPointerDown(e: React.PointerEvent<HTMLUListElement>) {
    // Mouse drag-to-scroll only — touch/pen use native overflow scrolling.
    if (e.pointerType !== "mouse" || e.button !== 0) {
      pauseAuto();
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;

    pauseAuto();
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      dragging: false
    };
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLUListElement>) {
    if (e.pointerType !== "mouse") return;
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    if (!drag.dragging && Math.abs(dx) < DRAG_THRESHOLD) return;

    if (!drag.dragging) {
      drag.dragging = true;
      suppressClickRef.current = true;
      el.classList.add("cursor-grabbing");
    }

    e.preventDefault();
    el.scrollLeft = drag.startScroll - dx;
  }

  function endPointer(e: React.PointerEvent<HTMLUListElement>) {
    if (e.pointerType !== "mouse") {
      scheduleResume(1400);
      return;
    }
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    el?.classList.remove("cursor-grabbing");
    dragRef.current = null;
    scheduleResume(drag.dragging ? 1800 : 1200);
  }

  function onClickCapture(e: React.MouseEvent<HTMLUListElement>) {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = false;
  }

  if (slots.length === 0) return null;

  const renderSlots = (suffix: string) =>
    slots.map((slot) => (
      <li
        key={`${suffix}-${slot.kind === "course" ? `course-${slot.item.id}` : `event-${slot.item.id}`}`}
        className="flex w-[min(86vw,22rem)] shrink-0 self-stretch sm:w-[min(48%,20rem)] lg:w-[calc((100%-3rem)/3)]"
      >
        <div className="w-full">
          <SlotCard slot={slot} />
        </div>
      </li>
    ));

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
            className="flex cursor-grab touch-pan-x gap-5 overflow-x-auto pb-2 [scrollbar-width:none] lg:gap-6 [&::-webkit-scrollbar]:hidden"
            style={{ WebkitOverflowScrolling: "touch" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={(e) => {
              // Only end if we captured this pointer (mouse leave mid-drag)
              if (dragRef.current?.pointerId === e.pointerId) endPointer(e);
            }}
            onClickCapture={onClickCapture}
            onWheel={() => {
              pauseAuto();
              scheduleResume(1600);
            }}
            onTouchStart={() => pauseAuto()}
            onTouchEnd={() => scheduleResume(1400)}
          >
            {renderSlots("a")}
            {slots.length > 1 ? renderSlots("b") : null}
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
