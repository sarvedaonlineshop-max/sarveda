"use client";

import type { OptionAxisForm } from "@/lib/variant-admin";
import { slugifyAttribute } from "@/lib/variant-admin";

type Props = {
  axes: OptionAxisForm[];
  onChange: (axes: OptionAxisForm[]) => void;
};

const inputCls =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export function VariantOptionAxesEditor({ axes, onChange }: Props) {
  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Option levels</p>
      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
        Each row is one level shoppers pick (e.g. Size, then Type). Every variant row below must fill
        all levels — that combination is the purchasable SKU (leaf).
      </p>
      <div className="mt-3 space-y-2">
        {axes.map((axis, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
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
                      j === i ? { name, slug: slugifyAttribute(name) } : a
                    )
                  );
                }}
                placeholder={i === 0 ? "Size" : "Type"}
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
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange([...axes, { name: "", slug: `level-${axes.length + 1}` }])
        }
        className="mt-3 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        + Add option level
      </button>
    </div>
  );
}
