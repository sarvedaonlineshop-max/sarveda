export type VariantAttributeForm = {
  name: string;
  slug: string;
  value: string;
};

export type OptionAxisForm = {
  name: string;
  slug: string;
  /** Allowed choices shown as dropdowns on each variant row. */
  values: string[];
};

export function slugifyAttribute(input: string): string {
  const s = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 120) || "option";
}

function uniqueSortedValues(values: string[]): string[] {
  const set = new Set<string>();
  for (let i = 0; i < values.length; i++) {
    const t = values[i]!.trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function deriveOptionAxes(
  variants: { attributes: VariantAttributeForm[] }[],
  savedOrder: string[] = []
): OptionAxisForm[] {
  const nameBySlug = new Map<string, string>();
  const valuesBySlug = new Map<string, Set<string>>();

  for (const v of variants) {
    for (const a of v.attributes) {
      const slug = a.slug || slugifyAttribute(a.name);
      if (!nameBySlug.has(slug)) nameBySlug.set(slug, a.name || slug);
      const val = a.value.trim();
      if (val) {
        const set = valuesBySlug.get(slug) ?? new Set<string>();
        set.add(val);
        valuesBySlug.set(slug, set);
      }
    }
  }

  const axes: OptionAxisForm[] = Array.from(nameBySlug.entries()).map(([slug, name]) => ({
    slug,
    name,
    values: uniqueSortedValues(Array.from(valuesBySlug.get(slug) ?? []))
  }));

  if (!savedOrder.length) return axes;
  return [...axes].sort((a, b) => {
    const ai = savedOrder.indexOf(a.slug);
    const bi = savedOrder.indexOf(b.slug);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

export function syncVariantAttributesToAxes(
  attributes: VariantAttributeForm[],
  axes: OptionAxisForm[]
): VariantAttributeForm[] {
  const bySlug = new Map(attributes.map((a) => [a.slug || slugifyAttribute(a.name), a]));
  return axes.map((axis) => {
    const existing = bySlug.get(axis.slug);
    const value = existing?.value ?? "";
    const allowed = new Set(axis.values.map((v) => v.trim()).filter(Boolean));
    return {
      name: axis.name,
      slug: axis.slug,
      value: value && (allowed.size === 0 || allowed.has(value)) ? value : ""
    };
  });
}

export function optionsForAxis(axis: OptionAxisForm, selectedValue = ""): string[] {
  const base = uniqueSortedValues(axis.values);
  const sel = selectedValue.trim();
  if (sel && !base.includes(sel)) return [...base, sel];
  return base;
}

export function variantLabelFromAttributes(attributes: VariantAttributeForm[]): string {
  const vals = attributes.map((a) => a.value.trim()).filter(Boolean);
  return vals.length ? vals.join(" / ") : "";
}
