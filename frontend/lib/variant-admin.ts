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

function uniqueValuesPreserveOrder(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Apply saved per-attribute value order; append any new values at the end. */
export function applyOptionValueOrder(values: string[], preferred?: string[] | null): string[] {
  const unique = uniqueValuesPreserveOrder(values);
  if (!preferred?.length) return unique;
  const byLower = new Map(unique.map((v) => [v.toLowerCase(), v]));
  const ordered: string[] = [];
  const used = new Set<string>();
  for (const p of preferred) {
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

export function deriveOptionAxes(
  variants: { attributes: VariantAttributeForm[] }[],
  savedOrder: string[] = [],
  valueOrderBySlug: Record<string, string[]> = {}
): OptionAxisForm[] {
  const nameBySlug = new Map<string, string>();
  const valuesBySlug = new Map<string, string[]>();

  for (const v of variants) {
    for (const a of v.attributes) {
      const slug = a.slug || slugifyAttribute(a.name);
      if (!nameBySlug.has(slug)) nameBySlug.set(slug, a.name || slug);
      const val = a.value.trim();
      if (val) {
        const list = valuesBySlug.get(slug) ?? [];
        if (!list.some((x) => x.toLowerCase() === val.toLowerCase())) list.push(val);
        valuesBySlug.set(slug, list);
      }
    }
  }

  const axes: OptionAxisForm[] = Array.from(nameBySlug.entries()).map(([slug, name]) => ({
    slug,
    name,
    values: applyOptionValueOrder(Array.from(valuesBySlug.get(slug) ?? []), valueOrderBySlug[slug])
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

/** Drop unsaved draft SKU rows that no longer match dropdown options.
 * Persisted DB variants (rows with `id`) are ALWAYS kept and flagged `optionMismatch`
 * when they no longer match — never silently removed from the form.
 */
export function pruneVariantRows<
  T extends {
    id?: string;
    attributes: VariantAttributeForm[];
    isDefault: boolean;
    optionMismatch?: boolean;
  }
>(rows: T[], axes: OptionAxisForm[], emptyRow: () => T): T[] {
  const anyValues = axes.some((axis) => axis.values.some((v) => v.trim()));
  const complete = axes.length > 0 && axes.every((axis) => axis.values.some((v) => v.trim()));
  const combos = complete ? cartesianCombos(axes) : [];
  const allowed = new Set(combos.map((combo) => comboKey(combo)));

  const originalMatches = (attributes: VariantAttributeForm[]): boolean => {
    if (!anyValues) return false;
    if (!complete) return true;
    const values = axes.map((axis) => {
      const hit = attributes.find((a) => (a.slug || slugifyAttribute(a.name)) === axis.slug);
      return hit?.value?.trim() ?? "";
    });
    if (values.every((v) => !v)) return true;
    if (values.some((v) => !v)) return false;
    return allowed.has(comboKey(values));
  };

  if (!anyValues) {
    const persisted = rows.filter((row) => Boolean(row.id));
    if (persisted.length) {
      const withFlags = persisted.map((row) => ({
        ...row,
        optionMismatch: true as boolean,
        attributes: syncVariantAttributesToAxes(row.attributes, axes)
      }));
      if (!withFlags.some((row) => row.isDefault)) {
        withFlags[0] = { ...withFlags[0], isDefault: true };
      }
      return withFlags;
    }
    const keep = rows[0] ?? emptyRow();
    return [
      {
        ...keep,
        isDefault: true,
        optionMismatch: false,
        attributes: syncVariantAttributesToAxes(keep.attributes, axes)
      }
    ];
  }

  if (!complete) {
    if (!rows.length) {
      return [
        {
          ...emptyRow(),
          isDefault: true,
          optionMismatch: false,
          attributes: syncVariantAttributesToAxes([], axes)
        }
      ];
    }
    const out = rows.map((row) => ({
      ...row,
      optionMismatch: false,
      attributes: syncVariantAttributesToAxes(row.attributes, axes)
    }));
    if (!out.some((row) => row.isDefault)) {
      out[0] = { ...out[0], isDefault: true };
    }
    return out;
  }

  const kept: T[] = [];
  for (const row of rows) {
    const ok = originalMatches(row.attributes);
    if (row.id) {
      kept.push({
        ...row,
        optionMismatch: !ok,
        // Keep original attrs when mismatched so the operator can still see them.
        attributes: ok ? syncVariantAttributesToAxes(row.attributes, axes) : row.attributes
      });
      continue;
    }
    if (ok) {
      kept.push({
        ...row,
        optionMismatch: false,
        attributes: syncVariantAttributesToAxes(row.attributes, axes)
      });
    }
  }

  if (kept.length === 0) {
    const keep = rows.find((r) => r.id) ?? rows[0] ?? emptyRow();
    return [
      {
        ...keep,
        isDefault: true,
        optionMismatch: Boolean(keep.id),
        attributes: keep.id
          ? keep.attributes
          : axes.map((axis) => ({ name: axis.name, slug: axis.slug, value: "" }))
      }
    ];
  }

  if (!kept.some((row) => row.isDefault)) {
    kept[0] = { ...kept[0], isDefault: true };
  }
  return kept;
}

/** Count persisted rows flagged as option mismatches under current axes. */
export function countPersistedOptionMismatches<
  T extends {
    id?: string;
    attributes: VariantAttributeForm[];
    isDefault: boolean;
    optionMismatch?: boolean;
  }
>(rows: T[], axes: OptionAxisForm[], emptyRow: () => T): number {
  return pruneVariantRows(rows, axes, emptyRow).filter((r) => r.id && r.optionMismatch).length;
}

export function optionsForAxis(axis: OptionAxisForm, selectedValue = ""): string[] {
  const base = uniqueValuesPreserveOrder(axis.values);
  const sel = selectedValue.trim();
  if (sel && !base.some((v) => v.toLowerCase() === sel.toLowerCase())) return [...base, sel];
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
