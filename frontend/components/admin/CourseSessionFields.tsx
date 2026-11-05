"use client";

import { AccordionRichEditor } from "@/components/admin/AccordionRichEditor";
import type { CourseSession } from "@/lib/course-sessions";

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export const emptyCourseSession: CourseSession = {
  sessionId: "",
  header: "",
  name: "",
  teacherName: "",
  content: "",
  scheduledAt: "",
  scheduleNote: ""
};

type MentorOption = { id: string; name: string };

type Props = {
  sessions: CourseSession[];
  mentors: MentorOption[];
  onChange: (sessions: CourseSession[]) => void;
};

export function CourseSessionFields({ sessions, mentors, onChange }: Props) {
  function update(index: number, patch: Partial<CourseSession>) {
    const next = [...sessions];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Structured session curriculum (header, name, facilitator, content, schedule). The session
        header is what shoppers see instead of “Session 1, 2…”.
      </p>
      {sessions.map((session, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-700 dark:bg-stone-950/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {session.header?.trim() || `Session ${index + 1}`}
            </span>
            <button
              type="button"
              disabled={sessions.length <= 1}
              onClick={() => onChange(sessions.filter((_, i) => i !== index))}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40"
            >
              Remove
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Session header</span>
            <input
              value={session.header ?? ""}
              onChange={(e) => update(index, { header: e.target.value })}
              placeholder="e.g. Day 1 · Opening circle"
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-stone-500">
              Shown on the course page in place of “Session {index + 1}”.
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Session ID</span>
              <input
                value={session.sessionId}
                onChange={(e) => update(index, { sessionId: e.target.value })}
                placeholder="e.g. 1"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Session name</span>
              <input
                value={session.name}
                onChange={(e) => update(index, { name: e.target.value })}
                placeholder="e.g. Foundations of Sound Therapy"
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Mentor (optional)</span>
              <select
                value={session.mentorId ?? ""}
                onChange={(e) => {
                  const mentorId = e.target.value || null;
                  const mentor = mentors.find((m) => m.id === mentorId);
                  update(index, {
                    mentorId,
                    teacherName: mentor?.name ?? session.teacherName ?? null
                  });
                }}
                className={inputClass}
              >
                <option value="">— Select mentor —</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">
                Teacher name (if not in mentors)
              </span>
              <input
                value={session.teacherName ?? ""}
                onChange={(e) => update(index, { teacherName: e.target.value || null })}
                placeholder="e.g. Vivek B"
                className={inputClass}
              />
            </label>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase text-stone-500">Session content</span>
            <div className="mt-1">
              <AccordionRichEditor
                variant="full"
                value={session.content}
                onChange={(content) => update(index, { content })}
                placeholder="Topics, bullets, links…"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Scheduled date</span>
              <input
                type="date"
                value={session.scheduledAt?.slice(0, 10) ?? ""}
                onChange={(e) => update(index, { scheduledAt: e.target.value || null })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Schedule note</span>
              <input
                value={session.scheduleNote ?? ""}
                onChange={(e) => update(index, { scheduleNote: e.target.value || null })}
                placeholder="e.g. Friday, 19 June 2026"
                className={inputClass}
              />
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...sessions,
            {
              ...emptyCourseSession,
              sessionId: String(sessions.length + 1)
            }
          ])
        }
        className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
      >
        + Add session
      </button>
    </div>
  );
}
