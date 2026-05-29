"use client";

import { useEffect, useMemo, useState } from "react";

import {
  attributeDisplayName,
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
  /** Teal bordered pills matching live sarveda.com storefront */
  pillStyle?: "default" | "storefront";
};

function pillClasses(selected: boolean, available: boolean, style: "default" | "storefront"): string {
  if (style === "storefront") {
    if (!available) {
      return "cursor-not-allowed border-[rgba(196,176,232,0.25)] bg-brand-bg text-brand-lavender-mid/50 line-through";
    }
    return selected
      ? "border-brand-violet bg-brand-violet text-white shadow-sm"
      : "border-brand-violet bg-white text-brand-violet hover:bg-brand-violet/5";
  }
  if (!available) {
    return "cursor-not-allowed border-[rgba(196,176,232,0.25)] bg-brand-bg text-brand-lavender-mid/50 line-through";
  }
  return selected
    ? "border-brand-violet bg-brand-violet-light text-brand-violet shadow-sm"
    : "border-[rgba(196,176,232,0.25)] bg-white text-brand-ink hover:border-brand-lavender-mid";
}

function pickInitial(variants: ProductVariantDetail[]): ProductVariantDetail {
  return variants.find((v) => v.isDefault) ?? variants[0];
}

export function VariantSelector({
  variants,
  selectedVariantId,
  onVariantChange,
  pillStyle = "default"
}: Props) {
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
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-muted">Select option</p>
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
                className={`min-h-[44px] rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${pillClasses(selected, true, pillStyle)}`}
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
      <p className="mb-3 text-sm font-semibold text-brand-ink">{label}</p>
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
              className={`min-h-[44px] rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${pillClasses(selected, available, pillStyle)}`}
            >
              {val.value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
