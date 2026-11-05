import type { PrismaClient } from "@prisma/client";

import { computeVariantShippingTotal } from "../shipping/shippingRates.service";
import { currencyForDeliveryCountry, type QuoteCurrency } from "./quote-pricing";

export type QuoteChargeSuggestion = {
  currency: QuoteCurrency;
  shippingMinor: number;
  packingMinor: number;
  note: string;
  packingNote: string;
};

const PACKING_NOTE =
  "Packing is not on the product rate card. Enter a packing charge if this shipment needs one.";

/**
 * Shipping comes from the variant rate for the delivery country.
 * India uses the INR rate. Other destinations use the international USD rate.
 * UAE uses an AED rate when the product has one.
 */
export async function suggestQuoteCharges(
  prisma: PrismaClient,
  lines: Array<{ variantId: string; quantity: number }>,
  country: string
): Promise<QuoteChargeSuggestion> {
  const currency = currencyForDeliveryCountry(country);
  const priced = lines.filter((line) => line.variantId && line.quantity > 0);
  if (priced.length === 0) {
    return {
      currency,
      shippingMinor: 0,
      packingMinor: 0,
      note: "Add a product to suggest shipping.",
      packingNote: PACKING_NOTE
    };
  }

  if (currency === "INR") {
    const shippingMinor = await computeVariantShippingTotal(prisma, priced, "IN", { cod: false });
    return {
      currency,
      shippingMinor,
      packingMinor: 0,
      note:
        shippingMinor > 0
          ? "Suggested from the India shipping rate on these products."
          : "These products have no India shipping rate. Enter shipping if this delivery needs it.",
      packingNote: PACKING_NOTE
    };
  }

  if (currency === "AED") {
    const direct = await sumExactCountryShipping(prisma, priced, "AE");
    if (direct > 0) {
      return {
        currency,
        shippingMinor: direct,
        packingMinor: 0,
        note: "Suggested from the UAE shipping rate on these products.",
        packingNote: PACKING_NOTE
      };
    }
    const usd = await computeVariantShippingTotal(prisma, priced, "OTHER", { cod: false });
    const usdLabel = (usd / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    return {
      currency,
      shippingMinor: 0,
      packingMinor: 0,
      note:
        usd > 0
          ? `No UAE shipping rate. The international catalog rate is ${usdLabel}. Enter the dirham shipping for this AED quote.`
          : "No UAE or international shipping rate on these products.",
      packingNote: PACKING_NOTE
    };
  }

  const shippingMinor = await computeVariantShippingTotal(prisma, priced, "OTHER", { cod: false });
  return {
    currency,
    shippingMinor,
    packingMinor: 0,
    note:
      shippingMinor > 0
        ? "Suggested from the international shipping rate on these products."
        : "These products have no international shipping rate. Enter shipping if this delivery needs it.",
    packingNote: PACKING_NOTE
  };
}

async function sumExactCountryShipping(
  prisma: PrismaClient,
  lines: Array<{ variantId: string; quantity: number }>,
  country: string
): Promise<number> {
  const variantIds = [...new Set(lines.map((line) => line.variantId))];
  const rows = await prisma.variantShippingRate.findMany({
    where: { variantId: { in: variantIds }, country }
  });
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));
  let total = 0;
  for (const line of lines) {
    const rate = byVariant.get(line.variantId);
    if (!rate) continue;
    const qty = Math.max(0, line.quantity);
    if (qty === 0) continue;
    total += rate.standardPerProduct + (qty > 1 ? rate.standardAdditional * (qty - 1) : 0);
  }
  return total;
}
