import type { ProductVariantDetail } from "@/lib/types";

export type AttributeAxis = {
  slug: string;
  name: string;
  values: { slug: string; value: string }[];
};

const ATTRIBUTE_LABELS: Record<string, string> = {
  pa_size: "Size",
  size: "Size",
  pa_type: "Type",
  type: "Type",
  pa_finish: "Type",
  finish: "Type",
  "comb-type": "Comb Types",
  comb_type: "Comb Types",
  packs: "Packs",
  "bottle-type": "Bottle Type"
};

export function attributeDisplayName(slug: string, fallback: string): string {
  return ATTRIBUTE_LABELS[slug.toLowerCase()] ?? fallback;
}

const GONG_TYPE_ORDER = ["Chakra", "Mantra", "Buddhist Om"];

function parseInches(label: string): number {
  const m = label.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]!) : 9999;
}

/** Stable option order for storefront pills (matches live sarveda.com). */
export function sortAttributeOptionValues(labelOrSlug: string, values: string[]): string[] {
  const key = labelOrSlug.toLowerCase();
  if (key.includes("type")) {
    return [...values].sort((a, b) => {
      const ai = GONG_TYPE_ORDER.indexOf(a);
      const bi = GONG_TYPE_ORDER.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b);
    });
  }
  if (key.includes("size")) {
    return [...values].sort((a, b) => parseInches(a) - parseInches(b));
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function buildAttributeAxes(
  variants: ProductVariantDetail[],
  axisOrder?: string[]
): AttributeAxis[] {
  const map = new Map<string, { name: string; values: Map<string, string> }>();

  for (const variant of variants) {
    for (const row of variant.attributeValues) {
      const attr = row.attributeValue.attribute;
      const val = row.attributeValue;
      if (!map.has(attr.slug)) {
        map.set(attr.slug, { name: attr.name, values: new Map() });
      }
      map.get(attr.slug)!.values.set(val.slug, val.value);
    }
  }

  const axes = Array.from(map.entries()).map(([slug, { name, values }]) => {
    const raw = Array.from(values.entries()).map(([valueSlug, value]) => ({ slug: valueSlug, value }));
    const sorted = sortAttributeOptionValues(slug, raw.map((r) => r.value));
    const ordered = sorted.map((value) => raw.find((r) => r.value === value)!);
    return { slug, name, values: ordered };
  });

  if (!axisOrder?.length) return axes;

  return [...axes].sort((a, b) => {
    const ai = axisOrder.indexOf(a.slug);
    const bi = axisOrder.indexOf(b.slug);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

export function variantAttributeMap(variant: ProductVariantDetail): Map<string, string> {
  return new Map(
    variant.attributeValues.map((row) => [
      row.attributeValue.attribute.slug,
      row.attributeValue.slug
    ])
  );
}

export function selectionFromVariant(variant: ProductVariantDetail): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [attrSlug, valueSlug] of Array.from(variantAttributeMap(variant).entries())) {
    out[attrSlug] = valueSlug;
  }
  return out;
}

export function findVariantBySelection(
  variants: ProductVariantDetail[],
  selection: Record<string, string>
): ProductVariantDetail | null {
  const keys = Object.keys(selection);
  if (!keys.length) return null;
  return (
    variants.find((variant) => {
      const map = variantAttributeMap(variant);
      return keys.every((key) => map.get(key) === selection[key]);
    }) ?? null
  );
}

export function isValueAvailable(
  variants: ProductVariantDetail[],
  selection: Record<string, string>,
  attrSlug: string,
  valueSlug: string
): boolean {
  return variants.some((variant) => {
    const map = variantAttributeMap(variant);
    if (map.get(attrSlug) !== valueSlug) return false;
    for (const [key, selected] of Object.entries(selection)) {
      if (key === attrSlug) continue;
      if (map.get(key) !== selected) return false;
    }
    return true;
  });
}

export function variantDisplayLabel(variant: ProductVariantDetail, index: number): string {
  if (!variant.attributeValues.length) {
    return variant.sku || `Option ${index + 1}`;
  }
  return variant.attributeValues.map((row) => row.attributeValue.value).join(" / ");
}

/** Matches seed/import when Woo does not track stock per variation. */
export const UNTRACKED_STOCK_ON_HAND = 999;

export function availableStock(variant: ProductVariantDetail): number | null {
  if (!variant.inventory) return null;
  return Math.max(0, variant.inventory.onHand - variant.inventory.reserved);
}

export function stockDisplay(variant: ProductVariantDetail): {
  label: string;
  inStock: boolean;
  showCount: boolean;
  count: number;
} {
  const avail = availableStock(variant);
  const threshold = variant.inventory?.lowStockThreshold ?? 5;

  if (avail === null) {
    return { label: "In stock", inStock: true, showCount: false, count: 0 };
  }
  if (avail === 0) {
    return { label: "Out of stock", inStock: false, showCount: false, count: 0 };
  }
  if (avail >= UNTRACKED_STOCK_ON_HAND) {
    return { label: "In stock", inStock: true, showCount: false, count: avail };
  }
  const lowStock = avail <= threshold;
  return {
    label: lowStock ? `Only ${avail} left in stock` : "In stock",
    inStock: true,
    showCount: lowStock,
    count: avail
  };
}

export function salePriceRange(variants: ProductVariantDetail[], getSale: (v: ProductVariantDetail) => number): {
  min: number;
  max: number;
} | null {
  if (!variants.length) return null;
  const prices = variants.map(getSale);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
