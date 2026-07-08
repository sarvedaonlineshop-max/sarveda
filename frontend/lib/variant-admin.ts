export type VariantAttributeForm = {
  name: string;
  slug: string;
  value: string;
};

export type OptionAxisForm = {
  name: string;
  slug: string;
};

export function slugifyAttribute(input: string): string {
  const s = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 120) || "option";
}

export function deriveOptionAxes(
  variants: { attributes: VariantAttributeForm[] }[],
  savedOrder: string[] = []
): OptionAxisForm[] {
  const map = new Map<string, string>();
  for (const v of variants) {
    for (const a of v.attributes) {
      const slug = a.slug || slugifyAttribute(a.name);
      if (!map.has(slug)) map.set(slug, a.name || slug);
    }
  }
  const axes = Array.from(map.entries()).map(([slug, name]) => ({ slug, name }));
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
    return {
      name: axis.name,
      slug: axis.slug,
      value: existing?.value ?? ""
    };
  });
}

export function variantLabelFromAttributes(attributes: VariantAttributeForm[]): string {
  const vals = attributes.map((a) => a.value.trim()).filter(Boolean);
  return vals.length ? vals.join(" / ") : "";
}
