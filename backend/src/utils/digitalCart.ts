import type { DigitalCheckoutOffer, Product, ProductVariant } from "@prisma/client";

export type VariantWithProduct = ProductVariant & { productRel: Product };

export function isDigitalSku(sku: string): boolean {
  return sku.startsWith("COURSE-") || sku.startsWith("EVENT-");
}

export function isDigitalLine(variant: VariantWithProduct): boolean {
  const p = variant.productRel;
  return (
    p.productType === "DIGITAL" ||
    p.catalogHidden ||
    isDigitalSku(variant.sku)
  );
}

/** Cart/order line that may be a shop variant or a DigitalCheckoutOffer. */
export type CartLineDigitalAware = {
  variantId?: string | null;
  digitalOfferId?: string | null;
  variant?: VariantWithProduct | null;
  digitalOffer?: Pick<DigitalCheckoutOffer, "id" | "sku" | "kind"> | null;
};

export function isDigitalCartLine(row: CartLineDigitalAware): boolean {
  if (row.digitalOfferId || row.digitalOffer) return true;
  if (row.variant) return isDigitalLine(row.variant);
  return false;
}

export function isDigitalOnlyCart(lines: CartLineDigitalAware[]): boolean {
  return lines.length > 0 && lines.every((row) => isDigitalCartLine(row));
}
