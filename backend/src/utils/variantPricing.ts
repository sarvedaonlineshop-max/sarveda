import type { ProductVariant } from "@prisma/client";

import type { ZoneKey } from "../modules/shipping/types";

type VariantPriceFields = Pick<ProductVariant, "saleInPaise" | "saleUsdCents" | "saleGbpPence">;

/** Sale price in minor units for the shipping/pricing zone (paise, cents, or pence). */
export function unitMinorForZone(variant: VariantPriceFields, zone: ZoneKey): number {
  switch (zone) {
    case "IN":
      return variant.saleInPaise;
    case "GB":
      return variant.saleGbpPence ?? variant.saleInPaise;
    case "US":
    case "OTHER":
      return variant.saleUsdCents ?? variant.saleInPaise;
    default:
      return variant.saleInPaise;
  }
}
