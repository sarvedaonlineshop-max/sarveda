"use client";

import type { CourseCurriculumModule } from "@/lib/course-sessions";

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950";

export const emptyCurriculumModule: CourseCurriculumModule = {
  name: "",
  hours: null,
  priceInr: null,
  priceUsd: null,
  startDate: "",
  endDate: ""
};

type Props = {
  modules: CourseCurriculumModule[];
  onChange: (modules: CourseCurriculumModule[]) => void;
};

export function CourseCurriculumFields({ modules, onChange }: Props) {
  function update(index: number, patch: Partial<CourseCurriculumModule>) {
    const next = [...modules];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">
        Topic breakdown with hours and optional dates. The Investment sidebar uses the overall course
        price above — module prices are reference only (e.g. Yoga Therapy optional modules).
      </p>
      {modules.map((mod, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-stone-500">Module {index + 1}</span>
            <button
              type="button"
              disabled={modules.length <= 1}
              onClick={() => onChange(modules.filter((_, i) => i !== index))}
              className="text-xs text-red-600 hover:underline disabled:opacity-40"
            >
              Remove
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Topic name</span>
            <input
              value={mod.name}
              onChange={(e) => update(index, { name: e.target.value })}
              className={inputClass}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Hours</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={mod.hours ?? ""}
                onChange={(e) =>
                  update(index, {
                    hours: e.target.value ? parseFloat(e.target.value) : null
                  })
                }
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">
                Reference price INR (optional)
              </span>
              <input
                type="number"
                min={0}
                value={mod.priceInr ?? ""}
                onChange={(e) =>
                  update(index, {
                    priceInr: e.target.value ? parseInt(e.target.value, 10) : null
                  })
                }
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">
                Reference price USD (optional)
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={mod.priceUsd ?? ""}
                onChange={(e) =>
                  update(index, {
                    priceUsd: e.target.value ? parseFloat(e.target.value) : null
                  })
                }
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">Start date</span>
              <input
                type="date"
                value={mod.startDate?.slice(0, 10) ?? ""}
                onChange={(e) => update(index, { startDate: e.target.value || null })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-stone-500">End date</span>
              <input
                type="date"
                value={mod.endDate?.slice(0, 10) ?? ""}
                onChange={(e) => update(index, { endDate: e.target.value || null })}
                className={inputClass}
              />
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...modules, { ...emptyCurriculumModule }])}
        className="text-sm font-medium text-blue-700 hover:underline"
      >
        + Add module
      </button>
    </div>
  );
}
