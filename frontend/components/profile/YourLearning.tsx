"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

type CourseRow = { slug: string; title: string; enrolledAt: string };
type EventRow = { slug: string; title: string; startDate: string; bookedAt: string };

type Props = {
  /** Which section to render. Defaults to "both" so existing usage is unchanged. */
  show?: "courses" | "events" | "both";
  /** Fired once enrollments and bookings load, so the parent can show live counts. */
  onCounts?: (counts: { courses: number; events: number }) => void;
};

export function YourLearning({ show = "both", onCounts }: Props) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, eRes] = await Promise.all([
          fetch(`${getApiBase()}/api/auth/me/enrollments`, { credentials: "include" }),
          fetch(`${getApiBase()}/api/auth/me/bookings`, { credentials: "include" })
        ]);
        const cJson = (await cRes.json()) as { success?: boolean; data?: CourseRow[] };
        const eJson = (await eRes.json()) as { success?: boolean; data?: EventRow[] };
        if (!cancelled) {
          const courseRows = cJson.success && cJson.data ? cJson.data : [];
          const eventRows = eJson.success && eJson.data ? eJson.data : [];
          setCourses(courseRows);
          setEvents(eventRows);
          onCounts?.({ courses: courseRows.length, events: eventRows.length });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showCourses = show === "courses" || show === "both";
  const showEvents = show === "events" || show === "both";

  if (loading) {
    return <p className="text-sm text-stone-500">Loading courses and events…</p>;
  }

  const coursesEmpty = courses.length === 0;
  const eventsEmpty = events.length === 0;
  const visibleEmpty =
    (show === "courses" && coursesEmpty) ||
    (show === "events" && eventsEmpty) ||
    (show === "both" && coursesEmpty && eventsEmpty);

  if (visibleEmpty) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-600">
        <p>
          {show === "courses"
            ? "No course enrollments yet."
            : show === "events"
              ? "No event bookings yet."
              : "No course or event enrollments yet."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {showCourses ? (
            <Link href="/courses" className="font-medium text-amber-800 underline hover:text-amber-900">
              Browse courses
            </Link>
          ) : null}
          {showEvents ? (
            <Link href="/events" className="font-medium text-amber-800 underline hover:text-amber-900">
              Browse events
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showCourses && courses.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-stone-800">My courses</h4>
          <ul className="mt-2 space-y-2">
            {courses.map((c) => (
              <li key={c.slug}>
                <Link href={`/course/${c.slug}`} className="text-sm font-medium text-stone-900 hover:text-amber-800">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {showEvents && events.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-stone-800">My events</h4>
          <ul className="mt-2 space-y-2">
            {events.map((e) => (
              <li key={e.slug}>
                <Link href={`/event/${e.slug}`} className="text-sm font-medium text-stone-900 hover:text-amber-800">
                  {e.title}
                </Link>
                <p className="text-xs text-stone-500">
                  {new Date(e.startDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                  })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
