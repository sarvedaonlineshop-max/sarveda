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
      value: value && allowed.has(value) ? value : ""
    };
  });
}

/** Drop SKU rows that no longer match the current dropdown options. */
export function pruneVariantRows<T extends { attributes: VariantAttributeForm[]; isDefault: boolean }>(
  rows: T[],
  axes: OptionAxisForm[],
  emptyRow: () => T
): T[] {
  const synced = rows.map((row) => ({
    ...row,
    attributes: syncVariantAttributesToAxes(row.attributes, axes)
  }));
  const anyValues = axes.some((axis) => axis.values.some((v) => v.trim()));

  if (!anyValues) {
    const keep = synced[0] ?? emptyRow();
    return [
      {
        ...keep,
        isDefault: true,
        attributes: syncVariantAttributesToAxes(keep.attributes, axes)
      }
    ];
  }

  const complete = axes.length > 0 && axes.every((axis) => axis.values.some((v) => v.trim()));
  if (!complete) {
    if (!synced.length) return [{ ...emptyRow(), isDefault: true, attributes: syncVariantAttributesToAxes([], axes) }];
    if (!synced.some((row) => row.isDefault)) {
      synced[0] = { ...synced[0], isDefault: true };
    }
    return synced;
  }

  const combos = cartesianCombos(axes);
  const allowed = new Set(combos.map((combo) => comboKey(combo)));
  const kept = synced.filter((row) => {
    const values = row.attributes.map((a) => a.value);
    const allEmpty = values.every((v) => !v.trim());
    if (allEmpty) return true;
    if (values.some((v) => !v.trim())) return false;
    return allowed.has(comboKey(values));
  });

  if (kept.length === 0) {
    const keep = synced[0] ?? emptyRow();
    return [
      {
        ...keep,
        isDefault: true,
        attributes: axes.map((axis) => ({ name: axis.name, slug: axis.slug, value: "" }))
      }
    ];
  }

  if (!kept.some((row) => row.isDefault)) {
    kept[0] = { ...kept[0], isDefault: true };
  }
  return kept;
}

export function optionsForAxis(axis: OptionAxisForm, selectedValue = ""): string[] {
  const base = uniqueSortedValues(axis.values);
  const sel = selectedValue.trim();
  if (sel && !base.includes(sel)) return [...base, sel];
  return base;
}

export function comboKey(values: string[]): string {
  return values.map((v) => v.trim().toLowerCase()).join("\u0001");
}

/** All combinations of option-level values, in axis order. Empty if any level has no options. */
export function cartesianCombos(axes: OptionAxisForm[]): string[][] {
  const lists = axes.map((a) => a.values.map((v) => v.trim()).filter(Boolean));
  if (!lists.length || lists.some((list) => list.length === 0)) return [];
  return lists.reduce<string[][]>((acc, vals) => {
    if (acc.length === 0) return vals.map((v) => [v]);
    return acc.flatMap((prefix) => vals.map((v) => [...prefix, v]));
  }, []);
}

export function variantLabelFromAttributes(attributes: VariantAttributeForm[]): string {
  const vals = attributes.map((a) => a.value.trim()).filter(Boolean);
  return vals.length ? vals.join(" / ") : "";
}
