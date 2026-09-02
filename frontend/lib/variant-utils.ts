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
  "bottle-type": "Bottle Type",
  note: "Note"
};

export function attributeDisplayName(slug: string, fallback: string): string {
  return ATTRIBUTE_LABELS[slug.toLowerCase()] ?? fallback;
}

const GONG_TYPE_ORDER = ["Plain", "Etched", "Chakra", "Mantra", "Buddhist Om"];
const NOTE_ORDER = ["A Plate", "B Plate", "C Plate", "D Plate", "E Plate", "F Plate", "G Plate", "Full Set"];

function parseInches(label: string): number {
  const m = label.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]!) : 9999;
}

function sizeSortKey(label: string): number {
  if (/combo/i.test(label)) return 1000 + parseInches(label);
  return parseInches(label);
}

/** Stable option order for storefront pills. Prefer admin-saved order when provided. */
export function sortAttributeOptionValues(
  labelOrSlug: string,
  values: string[],
  preferredOrder?: string[] | null
): string[] {
  const unique = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
  if (!unique.length) return [];

  if (preferredOrder?.length) {
    const byLower = new Map(unique.map((v) => [v.toLowerCase(), v]));
    const ordered: string[] = [];
    const used = new Set<string>();
    for (const p of preferredOrder) {
      const hit = byLower.get(p.trim().toLowerCase());
      if (!hit || used.has(hit.toLowerCase())) continue;
      ordered.push(hit);
      used.add(hit.toLowerCase());
    }
    for (const v of unique) {
      if (!used.has(v.toLowerCase())) ordered.push(v);
    }
    return ordered;
  }

  const key = labelOrSlug.toLowerCase();
  if (key.includes("note") && unique.some((v) => NOTE_ORDER.includes(v))) {
    return [...unique].sort((a, b) => {
      const ai = NOTE_ORDER.indexOf(a);
      const bi = NOTE_ORDER.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return 0;
    });
  }
  if (key.includes("type") && unique.some((v) => GONG_TYPE_ORDER.includes(v))) {
    return [...unique].sort((a, b) => {
      const ai = GONG_TYPE_ORDER.indexOf(a);
      const bi = GONG_TYPE_ORDER.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return 0;
    });
  }
  if (key.includes("size") && unique.some((v) => /\d/.test(v))) {
    return [...unique].sort((a, b) => sizeSortKey(a) - sizeSortKey(b));
  }
  // Preserve first-seen / admin list order — do not alphabetize.
  return unique;
}

/** Resolve preferred value order for an attribute slug (handles pa_size ↔ size). */
export function preferredOptionValuesForSlug(
  slug: string,
  optionValueOrder?: Record<string, string[]> | null
): string[] | undefined {
  if (!optionValueOrder) return undefined;
  const direct = optionValueOrder[slug];
  if (direct?.length) return direct;
  const lower = slug.toLowerCase();
  const stripped = lower.replace(/^pa_/, "");
  for (const [key, vals] of Object.entries(optionValueOrder)) {
    if (!vals?.length) continue;
    const k = key.toLowerCase();
    if (k === lower || k === stripped || k.replace(/^pa_/, "") === stripped) return vals;
  }
  return undefined;
}

export function buildAttributeAxes(
  variants: ProductVariantDetail[],
  axisOrder?: string[],
  optionValueOrder?: Record<string, string[]>
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
    const preferred = preferredOptionValuesForSlug(slug, optionValueOrder);
    const sorted = sortAttributeOptionValues(
      slug,
      raw.map((r) => r.value),
      preferred
    );
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
      return keys.every((key) => map.has(key) && map.get(key) === selection[key]);
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
      // Size-only SKUs (Combo of 3/5/7) have no colour — still selectable.
      if (!map.has(key)) continue;
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

export function isVariantCustomerSellable(variant: ProductVariantDetail): boolean {
  const avail = availableStock(variant);
  if (avail === null) return true;
  if (avail > 0) return true;
  return Boolean(variant.dropShipEnabled);
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
    if (variant.dropShipEnabled) {
      return { label: "Available", inStock: true, showCount: false, count: 0 };
    }
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
