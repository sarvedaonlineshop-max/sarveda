"use client";

import { useState } from "react";

import type { OptionAxisForm } from "@/lib/variant-admin";
import { slugifyAttribute } from "@/lib/variant-admin";

type Props = {
  axes: OptionAxisForm[];
  onChange: (axes: OptionAxisForm[]) => void;
};

const inputCls =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

function AxisValuesEditor({
  axis,
  onChange
}: {
  axis: OptionAxisForm;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addValue(raw: string) {
    const parts = raw
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...axis.values];
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className="min-w-0 flex-[2]">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        Dropdown options
      </label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {axis.values.map((val) => (
          <span
            key={val}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-800 ring-1 ring-stone-200 dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-600"
          >
            {val}
            <button
              type="button"
              aria-label={`Remove ${val}`}
              onClick={() => onChange(axis.values.filter((v) => v !== val))}
              className="text-stone-400 hover:text-red-600 dark:hover:text-red-400"
            >
              ×
            </button>
          </span>
        ))}
        {axis.values.length === 0 ? (
          <span className="text-xs text-stone-500">Add choices shoppers can pick (e.g. Small, Red)</span>
        ) : null}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue(draft);
            }
          }}
          placeholder="Type option, press Enter"
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => addValue(draft)}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-40 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function VariantOptionAxesEditor({ axes, onChange }: Props) {
  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Option levels</p>
      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
        Name each level (Size, Color, …) and list its dropdown options. Each variant row below picks
        one value per level.
      </p>
      <div className="mt-3 space-y-4">
        {axes.map((axis, i) => (
          <div
            key={`${axis.slug}-${i}`}
            className="space-y-3 rounded-lg border border-amber-200/60 bg-white/70 p-3 dark:border-amber-900/40 dark:bg-stone-950/40"
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  Level {i + 1} name
                </label>
                <input
                  value={axis.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    onChange(
                      axes.map((a, j) =>
                        j === i ? { ...a, name, slug: slugifyAttribute(name) } : a
                      )
                    );
                  }}
                  placeholder={i === 0 ? "Size" : "Color"}
                  className={inputCls}
                />
              </div>
              <button
                type="button"
                disabled={axes.length <= 1}
                onClick={() => onChange(axes.filter((_, j) => j !== i))}
                className="mb-0.5 text-xs font-medium text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
              >
                Remove level
              </button>
            </div>
            <AxisValuesEditor
              axis={axis}
              onChange={(values) =>
                onChange(axes.map((a, j) => (j === i ? { ...a, values } : a)))
              }
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange([
            ...axes,
            { name: "", slug: `level-${axes.length + 1}`, values: [] }
          ])
        }
        className="mt-3 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        + Add option level
      </button>
    </div>
  );
}
