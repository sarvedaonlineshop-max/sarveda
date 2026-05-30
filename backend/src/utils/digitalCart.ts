import type { Product, ProductVariant } from "@prisma/client";

export type VariantWithProduct = ProductVariant & { productRel: Product };

export function isDigitalLine(variant: VariantWithProduct): boolean {
  const p = variant.productRel;
  return (
    p.productType === "DIGITAL" ||
    p.catalogHidden ||
    variant.sku.startsWith("COURSE-") ||
    variant.sku.startsWith("EVENT-")
  );
}

export function isDigitalOnlyCart<T extends { variant: VariantWithProduct }>(lines: T[]): boolean {
  return lines.length > 0 && lines.every((row) => isDigitalLine(row.variant));
}

export function isDigitalSku(sku: string): boolean {
  return sku.startsWith("COURSE-") || sku.startsWith("EVENT-");
}
