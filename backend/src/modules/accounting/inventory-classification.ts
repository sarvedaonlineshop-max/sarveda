import type { ProductType } from "@prisma/client";

export type InventoryClassification =
  | "PHYSICAL_INVENTORY"
  | "NON_INVENTORY"
  | "COURSE_DIGITAL_PLACEHOLDER"
  | "UNKNOWN";

export type VariantClassificationInput = {
  sku: string;
  productType: ProductType;
  catalogHidden: boolean;
  onHand: number;
};

const PLACEHOLDER_ON_HAND = 999;

/**
 * Deterministic inventory classification for opening layers / COGS eligibility.
 * Operational onHand is not used to grant financial inventory asset status alone.
 */
export function classifyVariantForInventory(input: VariantClassificationInput): InventoryClassification {
  const skuUpper = input.sku.trim().toUpperCase();

  if (input.productType === "DIGITAL") {
    return "COURSE_DIGITAL_PLACEHOLDER";
  }

  if (skuUpper.startsWith("COURSE-") || skuUpper.startsWith("EVENT-")) {
    return "COURSE_DIGITAL_PLACEHOLDER";
  }

  if (input.catalogHidden) {
    return "NON_INVENTORY";
  }

  if (input.productType === "SIMPLE" || input.productType === "VARIABLE") {
    if (input.onHand >= PLACEHOLDER_ON_HAND && skuUpper.includes("COURSE")) {
      return "COURSE_DIGITAL_PLACEHOLDER";
    }
    return "PHYSICAL_INVENTORY";
  }

  return "UNKNOWN";
}

export function isOpeningLayerEligible(classification: InventoryClassification): boolean {
  return classification === "PHYSICAL_INVENTORY";
}

export function classificationBlocksOpening(classification: InventoryClassification): string | null {
  if (classification === "PHYSICAL_INVENTORY") return null;
  if (classification === "COURSE_DIGITAL_PLACEHOLDER") {
    return "INVENTORY_CLASSIFICATION_REQUIRED: course/digital placeholder excluded from physical opening inventory";
  }
  if (classification === "NON_INVENTORY") {
    return "INVENTORY_CLASSIFICATION_REQUIRED: non-inventory SKU excluded";
  }
  return "INVENTORY_CLASSIFICATION_REQUIRED: ambiguous SKU classification";
}
