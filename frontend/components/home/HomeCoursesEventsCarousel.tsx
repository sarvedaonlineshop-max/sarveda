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
/** Auto-advance speed (px per frame @ ~60fps). */
const AUTO_SPEED = 0.4;
/** Horizontal swipe past this snaps to the next/prev card. */
const SWIPE_SNAP_PX = 36;

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

function slotKey(slot: Slot, suffix: string) {
  return slot.kind === "course"
    ? `${suffix}-course-${slot.item.id}`
    : `${suffix}-event-${slot.item.id}`;
}

/**
 * Transform-based rail (not overflow-x) so vertical page scroll still works.
 * Auto-scrolls when idle; horizontal swipe snaps one full card at a time.
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

  const loop = slots.length > 1;
  const displaySlots = loop ? [...slots, ...slots] : slots;

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const offsetRef = useRef(0);
  const maxOffsetRef = useRef(0);
  const loopWidthRef = useRef(0);
  const stepRef = useRef(320);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [offset, setOffset] = useState(0);
  const [maxOffset, setMaxOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [snapAnimating, setSnapAnimating] = useState(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gestureRef = useRef<{
    startX: number;
    startY: number;
    startOffset: number;
    axis: "undecided" | "h" | "v";
    pointerId: number | null;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const applyOffset = useCallback((value: number) => {
    let next = value;
    const loopW = loopWidthRef.current;
    if (loop && loopW > 0) {
      while (next >= loopW) next -= loopW;
      while (next < 0) next += loopW;
    } else {
      next = Math.min(Math.max(0, next), maxOffsetRef.current);
    }
    offsetRef.current = next;
    setOffset(next);
    return next;
  }, [loop]);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const first = track.querySelector("li");
    if (first) {
      const styles = getComputedStyle(track);
      const gap = parseFloat(styles.columnGap || styles.gap || "20") || 20;
      stepRef.current = first.getBoundingClientRect().width + gap;
    }

    const total = track.scrollWidth;
    const loopW = loop ? total / 2 : total;
    loopWidthRef.current = loopW;
    const max = Math.max(0, loop ? loopW : total - viewport.clientWidth);
    maxOffsetRef.current = max;
    setMaxOffset(max);
    applyOffset(offsetRef.current);
  }, [applyOffset, loop]);

  useEffect(() => {
    measure();
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure, displaySlots.length]);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const pauseAuto = useCallback(() => {
    clearResumeTimer();
    pausedRef.current = true;
  }, [clearResumeTimer]);

  const scheduleResume = useCallback(
    (ms = 2200) => {
      clearResumeTimer();
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        pausedRef.current = false;
      }, ms);
    },
    [clearResumeTimer]
  );

  useEffect(() => {
    if (!loop) return;

    const step = () => {
      if (!pausedRef.current && !draggingRef.current) {
        applyOffset(offsetRef.current + AUTO_SPEED);
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [applyOffset, loop]);

  useEffect(() => () => clearResumeTimer(), [clearResumeTimer]);

  function snapToCard(fromOffset: number, direction: -1 | 0 | 1) {
    const step = stepRef.current || 320;
    const baseIndex = Math.round(fromOffset / step);
    const targetIndex = baseIndex + direction;
    applyOffset(targetIndex * step);
  }

  function scrollByDir(dir: -1 | 1) {
    pauseAuto();
    snapToCard(offsetRef.current, dir);
    scheduleResume(2500);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pauseAuto();
    suppressClickRef.current = false;
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffset: offsetRef.current,
      axis: "undecided",
      pointerId: e.pointerId
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.axis === "undecided") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      if (g.axis === "v") {
        gestureRef.current = null;
        draggingRef.current = false;
        setDragging(false);
        scheduleResume(1400);
        return;
      }
      draggingRef.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    if (g.axis !== "h") return;
    suppressClickRef.current = true;
    e.preventDefault();
    applyOffset(g.startOffset - dx);
  }

  function endPointer(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (g.axis === "h") {
      const delta = offsetRef.current - g.startOffset;
      // Finger left → offset up → next card; finger right → previous card
      if (delta > SWIPE_SNAP_PX) snapToCard(g.startOffset, 1);
      else if (delta < -SWIPE_SNAP_PX) snapToCard(g.startOffset, -1);
      else snapToCard(g.startOffset, 0);
    }

    gestureRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    scheduleResume(2200);
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = false;
  }

  if (slots.length === 0) return null;

  const canPrev = loop || offset > 4;
  const canNext = loop || offset < maxOffset - 4;

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

          <div
            ref={viewportRef}
            className="overflow-hidden pb-2"
            style={{ touchAction: "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onClickCapture={onClickCapture}
          >
            <ul
              ref={trackRef}
              className={`flex w-max gap-5 lg:gap-6 ${dragging ? "" : "transition-transform duration-300 ease-out"}`}
              style={{ transform: `translate3d(${-offset}px, 0, 0)` }}
            >
              {displaySlots.map((slot, i) => (
                <li
                  key={slotKey(slot, i < slots.length ? "a" : "b")}
                  className="flex w-[min(86vw,22rem)] shrink-0 self-stretch sm:w-[min(48%,20rem)] lg:w-[22rem]"
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
