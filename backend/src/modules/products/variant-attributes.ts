import { prisma } from "../../config/db";
import { slugify } from "../../utils/slugify";

export type VariantAttributeInput = {
  name: string;
  slug?: string;
  value: string;
};

async function ensureAttribute(slug: string, name: string): Promise<string> {
  const normalized = slugify(slug || name);
  const existing = await prisma.productAttribute.findUnique({ where: { slug: normalized } });
  if (existing) return existing.id;
  const created = await prisma.productAttribute.create({
    data: { slug: normalized, name: name.trim() || normalized }
  });
  return created.id;
}

async function ensureAttributeValue(attributeId: string, value: string): Promise<string> {
  const trimmed = value.trim();
  const valueSlug = slugify(trimmed);
  const existing = await prisma.attributeValue.findFirst({
    where: { attributeId, slug: valueSlug }
  });
  if (existing) return existing.id;
  const created = await prisma.attributeValue.create({
    data: { attributeId, value: trimmed, slug: valueSlug }
  });
  return created.id;
}

/** Replace all attribute links for one purchasable variant (Woo-style leaf). */
export async function syncVariantAttributes(
  variantId: string,
  attributes: VariantAttributeInput[]
): Promise<void> {
  await prisma.variantAttributeValue.deleteMany({ where: { variantId } });
  const seen = new Set<string>();

  for (const row of attributes) {
    const value = row.value?.trim();
    if (!value) continue;
    const attrSlug = slugify(row.slug?.trim() || row.name?.trim() || value);
    const key = `${attrSlug}:${slugify(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const attributeId = await ensureAttribute(attrSlug, row.name?.trim() || attrSlug);
    const attributeValueId = await ensureAttributeValue(attributeId, value);
    await prisma.variantAttributeValue.create({
      data: { variantId, attributeValueId }
    });
  }
}
