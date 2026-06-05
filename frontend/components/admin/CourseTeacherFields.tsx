"use client";

import { ContentImageUpload } from "@/components/admin/ContentImageUpload";
import type { CourseTeacherForm } from "@/lib/admin-content";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

type Props = {
  teachers: CourseTeacherForm[];
  onChange: (teachers: CourseTeacherForm[]) => void;
};

export function CourseTeacherFields({ teachers, onChange }: Props) {
  function update(index: number, patch: Partial<CourseTeacherForm>) {
    const next = [...teachers];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Add facilitators for the &quot;About the Teachers&quot; section on the course page. Photos
        upload to S3 (courses folder).
      </p>
      {teachers.map((teacher, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-700 dark:bg-stone-950/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Teacher {index + 1}
            </span>
            <button
              type="button"
              disabled={teachers.length <= 1}
              onClick={() => onChange(teachers.filter((_, i) => i !== index))}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
            >
              Remove
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Name *</span>
            <input
              value={teacher.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder="e.g. Arjun Arora"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Designation</span>
            <input
              value={teacher.designation}
              onChange={(e) => update(index, { designation: e.target.value })}
              placeholder="e.g. Yoga Therapist, Sound Healer"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Bio</span>
            <textarea
              value={teacher.bio}
              onChange={(e) => update(index, { bio: e.target.value })}
              rows={5}
              placeholder="Short biography (HTML allowed)"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <ContentImageUpload
            label="Teacher photo"
            url={teacher.imageUrl}
            onUrlChange={(imageUrl) => update(index, { imageUrl })}
            folder="courses"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...teachers, { name: "", designation: "", bio: "", imageUrl: "" }])
        }
        className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        + Add teacher
      </button>
    </div>
  );
}
