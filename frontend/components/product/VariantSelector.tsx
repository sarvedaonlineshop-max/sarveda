"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildAttributeAxes,
  findVariantBySelection,
  isValueAvailable,
  selectionFromVariant,
  variantDisplayLabel,
  type AttributeAxis
} from "@/lib/variant-utils";
import type { ProductVariantDetail } from "@/lib/types";

type Props = {
  variants: ProductVariantDetail[];
  selectedVariantId: string;
  onVariantChange: (variantId: string) => void;
};

function pickInitial(variants: ProductVariantDetail[]): ProductVariantDetail {
  return variants.find((v) => v.isDefault) ?? variants[0];
}

export function VariantSelector({ variants, selectedVariantId, onVariantChange }: Props) {
  const axes = useMemo(() => buildAttributeAxes(variants), [variants]);
  const hasAxes = axes.length > 0;

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? pickInitial(variants);

  const [selection, setSelection] = useState<Record<string, string>>(() =>
    selectionFromVariant(selectedVariant)
  );

  useEffect(() => {
    setSelection(selectionFromVariant(selectedVariant));
  }, [selectedVariantId, selectedVariant]);

  useEffect(() => {
    const matched = findVariantBySelection(variants, selection);
    if (matched && matched.id !== selectedVariantId) {
      onVariantChange(matched.id);
    }
  }, [selection, variants, selectedVariantId, onVariantChange]);

  if (variants.length <= 1) return null;

  if (!hasAxes) {
    return (
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-500">Select option</p>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="Product options">
          {variants.map((item, index) => {
            const selected = item.id === selectedVariantId;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onVariantChange(item.id)}
                className={`min-h-[48px] rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
                  selected
                    ? "border-amber-700 bg-amber-50 text-amber-900 shadow-sm"
                    : "border-stone-200 bg-white text-stone-800 hover:border-amber-400"
                }`}
              >
                {variantDisplayLabel(item, index)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {axes.map((axis) => (
        <AttributeRow
          key={axis.slug}
          axis={axis}
          selection={selection}
          variants={variants}
          onPick={(attrSlug, valueSlug) => {
            setSelection((prev) => ({ ...prev, [attrSlug]: valueSlug }));
          }}
        />
      ))}
    </div>
  );
}

function AttributeRow({
  axis,
  selection,
  variants,
  onPick
}: {
  axis: AttributeAxis;
  selection: Record<string, string>;
  variants: ProductVariantDetail[];
  onPick: (attrSlug: string, valueSlug: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-500">{axis.name}</p>
      <div className="flex flex-wrap gap-2" role="listbox" aria-label={axis.name}>
        {axis.values.map((val) => {
          const selected = selection[axis.slug] === val.slug;
          const available = isValueAvailable(variants, selection, axis.slug, val.slug);
          return (
            <button
              key={val.slug}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!available}
              onClick={() => onPick(axis.slug, val.slug)}
              className={`min-h-[48px] rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? "border-amber-700 bg-amber-50 text-amber-900 shadow-sm"
                  : available
                    ? "border-stone-200 bg-white text-stone-800 hover:border-amber-400"
                    : "cursor-not-allowed border-stone-100 bg-stone-50 text-stone-300 line-through"
              }`}
            >
              {val.value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
