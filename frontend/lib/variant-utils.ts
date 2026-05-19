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
  finish: "Type"
};

export function attributeDisplayName(slug: string, fallback: string): string {
  return ATTRIBUTE_LABELS[slug.toLowerCase()] ?? fallback;
}

export function buildAttributeAxes(variants: ProductVariantDetail[]): AttributeAxis[] {
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

  return Array.from(map.entries()).map(([slug, { name, values }]) => ({
    slug,
    name,
    values: Array.from(values.entries()).map(([valueSlug, value]) => ({ slug: valueSlug, value }))
  }));
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

export function availableStock(variant: ProductVariantDetail): number | null {
  if (!variant.inventory) return null;
  return Math.max(0, variant.inventory.onHand - variant.inventory.reserved);
}

export function salePriceRange(variants: ProductVariantDetail[], getSale: (v: ProductVariantDetail) => number): {
  min: number;
  max: number;
} | null {
  if (!variants.length) return null;
  const prices = variants.map(getSale);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
