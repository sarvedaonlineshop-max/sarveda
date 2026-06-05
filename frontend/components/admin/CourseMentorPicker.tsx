"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchAdminContentList } from "@/lib/admin-api";

type MentorOption = {
  id: string;
  title: string;
  slug: string;
  photoUrl?: string;
  expertise?: string;
};

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function CourseMentorPicker({ selectedIds, onChange }: Props) {
  const [mentors, setMentors] = useState<MentorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAdminContentList("mentors", { limit: 200 });
        if (cancelled) return;
        setMentors(
          data.items.map((row) => ({
            id: row.id,
            title: row.title,
            slug: row.slug
          }))
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = mentors.filter((m) =>
    q.trim() ? m.title.toLowerCase().includes(q.trim().toLowerCase()) : true
  );

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Select facilitators from{" "}
        <Link href="/admin/mentors" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          Mentors
        </Link>
        . Add new mentors there first — they appear here automatically.
      </p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search mentors…"
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
      />
      {loading ? (
        <p className="text-sm text-stone-500">Loading mentors…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone-500">
          No mentors found.{" "}
          <Link href="/admin/content/mentors/new" className="text-blue-600 hover:underline">
            Add a mentor
          </Link>
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-stone-200 bg-stone-50/50 p-2 dark:border-stone-700 dark:bg-stone-950/40">
          {filtered.map((m) => {
            const checked = selectedIds.includes(m.id);
            return (
              <li key={m.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                    checked
                      ? "bg-blue-50 text-stone-900 dark:bg-blue-950/40 dark:text-stone-100"
                      : "hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(m.id)}
                    className="rounded border-stone-300 text-blue-600"
                  />
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-xs font-semibold text-stone-600">
                    {m.title.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{m.title}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {selectedIds.length > 0 ? (
        <p className="text-xs text-stone-500">{selectedIds.length} mentor(s) selected</p>
      ) : null}
    </div>
  );
}
