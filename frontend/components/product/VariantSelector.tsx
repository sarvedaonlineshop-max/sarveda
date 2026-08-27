"use client";

import { useEffect, useMemo, useState } from "react";

import {
  attributeDisplayName,
  buildAttributeAxes,
  findVariantBySelection,
  isValueAvailable,
  selectionFromVariant,
  variantAttributeMap,
  variantDisplayLabel,
  type AttributeAxis
} from "@/lib/variant-utils";
import type { ProductVariantDetail } from "@/lib/types";

type Props = {
  variants: ProductVariantDetail[];
  selectedVariantId: string;
  onVariantChange: (variantId: string) => void;
  /** Ordered attribute slugs from product (size before type, etc.) */
  axisOrder?: string[];
  /** Per-attribute option value order from admin. */
  optionValueOrder?: Record<string, string[]>;
  /** Teal bordered pills matching live sarveda.com storefront */
  pillStyle?: "default" | "storefront";
};

function pillClasses(selected: boolean, available: boolean, style: "default" | "storefront"): string {
  if (style === "storefront") {
    if (!available) {
      return "cursor-not-allowed border-stone-100 bg-stone-50 text-stone-300 line-through";
    }
    return selected
      ? "border-[#108967] bg-[#108967] text-white shadow-sm"
      : "border-[#108967] bg-white text-[#108967] hover:bg-[#108967]/10";
  }
  if (!available) {
    return "cursor-not-allowed border-stone-100 bg-stone-50 text-stone-300 line-through";
  }
  return selected
    ? "border-amber-700 bg-amber-50 text-amber-900 shadow-sm"
    : "border-stone-200 bg-white text-stone-800 hover:border-amber-400";
}

function pickInitial(variants: ProductVariantDetail[]): ProductVariantDetail {
  return variants.find((v) => v.isDefault) ?? variants[0];
}

export function VariantSelector({
  variants,
  selectedVariantId,
  onVariantChange,
  axisOrder,
  optionValueOrder,
  pillStyle = "default"
}: Props) {
  const axes = useMemo(
    () => buildAttributeAxes(variants, axisOrder, optionValueOrder),
    [variants, axisOrder, optionValueOrder]
  );
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
                className={`min-h-[44px] rounded-[3px] border px-4 py-2.5 text-sm font-medium transition-colors ${pillClasses(selected, true, pillStyle)}`}
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
          pillStyle={pillStyle}
          onPick={(attrSlug, valueSlug) => {
            const next = { ...selection, [attrSlug]: valueSlug };
            const candidates = variants.filter((v) => variantAttributeMap(v).get(attrSlug) === valueSlug);
            const tight = candidates.filter((v) => {
              const map = variantAttributeMap(v);
              return Object.entries(next).every(([key, val]) => !map.has(key) || map.get(key) === val);
            });
            const pick = (tight.length ? tight : candidates)[0];
            if (pick) {
              onVariantChange(pick.id);
              setSelection(selectionFromVariant(pick));
              return;
            }
            setSelection(next);
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
  pillStyle,
  onPick
}: {
  axis: AttributeAxis;
  selection: Record<string, string>;
  variants: ProductVariantDetail[];
  pillStyle: "default" | "storefront";
  onPick: (attrSlug: string, valueSlug: string) => void;
}) {
  const label = attributeDisplayName(axis.slug, axis.name);
  return (
    <div>
      <p className="mb-3 font-sans text-base font-bold text-[#108967]">{label}</p>
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
              className={`min-h-[44px] rounded-[3px] border px-4 py-2.5 text-sm font-medium transition-colors ${pillClasses(selected, available, pillStyle)}`}
            >
              {val.value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
