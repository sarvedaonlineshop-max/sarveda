"use client";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export type CourseScheduleForm = {
  startDate: string;
  endDate: string;
  mode: string;
  location: string;
  timings: string;
  duration: string;
};

export const emptyCourseSchedule: CourseScheduleForm = {
  startDate: "",
  endDate: "",
  mode: "",
  location: "",
  timings: "",
  duration: ""
};

type Props = {
  rows: CourseScheduleForm[];
  onChange: (rows: CourseScheduleForm[]) => void;
};

export function CourseScheduleFields({ rows, onChange }: Props) {
  function update(index: number, patch: Partial<CourseScheduleForm>) {
    const next = [...rows];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Optional intake rows (mode, venue, timings). Shown on the course page schedule table when
        filled.
      </p>
      {rows.map((row, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-700 dark:bg-stone-950/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Intake {index + 1}
            </span>
            <button
              type="button"
              disabled={rows.length <= 1}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
            >
              Remove
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Start date</span>
              <input
                type="date"
                value={row.startDate}
                onChange={(e) => update(index, { startDate: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">End date</span>
              <input
                type="date"
                value={row.endDate}
                onChange={(e) => update(index, { endDate: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Mode</span>
            <input
              value={row.mode}
              onChange={(e) => update(index, { mode: e.target.value })}
              placeholder="e.g. Online, In-person"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Location / venue</span>
            <input
              value={row.location}
              onChange={(e) => update(index, { location: e.target.value })}
              placeholder="e.g. Zoom, Rishikesh"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Timings</span>
            <input
              value={row.timings}
              onChange={(e) => update(index, { timings: e.target.value })}
              placeholder="e.g. Wed 7–8:30 PM IST"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Duration (row)</span>
            <input
              value={row.duration}
              onChange={(e) => update(index, { duration: e.target.value })}
              placeholder="Optional per-intake duration"
              className={inputClass}
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { ...emptyCourseSchedule }])}
        className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        + Add intake row
      </button>
    </div>
  );
}
