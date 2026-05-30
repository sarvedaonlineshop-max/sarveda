"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

type CourseRow = { slug: string; title: string; enrolledAt: string };
type EventRow = { slug: string; title: string; startDate: string; bookedAt: string };

export function YourLearning() {
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
          setCourses(cJson.success && cJson.data ? cJson.data : []);
          setEvents(eJson.success && eJson.data ? eJson.data : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-stone-500">Loading courses and events…</p>;
  }

  if (courses.length === 0 && events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-600">
        <p>No course or event enrollments yet.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/courses" className="font-medium text-amber-800 underline hover:text-amber-900">
            Browse courses
          </Link>
          <Link href="/events" className="font-medium text-amber-800 underline hover:text-amber-900">
            Browse events
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {courses.length > 0 ? (
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
      {events.length > 0 ? (
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
