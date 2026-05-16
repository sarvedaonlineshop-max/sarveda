import type { PrismaClient } from "@prisma/client";

import type { ZoneKey } from "./types";

export function resolveRateCountryCode(shippingCountry: string): string {
  const u = shippingCountry.trim().toUpperCase();
  if (u === "IN") return "IN";
  if (u === "US") return "US";
  if (u === "GB") return "GB";
  return "OTHER";
}

export function zoneFromCountry(shippingCountry: string): ZoneKey {
  const u = shippingCountry.trim().toUpperCase();
  if (u === "IN") return "IN";
  if (u === "US") return "US";
  if (u === "GB") return "GB";
  return "OTHER";
}

export type CartLineInput = { variantId: string; quantity: number };

/**
 * Sum standard shipping (first unit + additional) per line from VariantShippingRate.
 * Amounts are stored in minor units for that country (paise / cents / pence per seed).
 */
export async function computeVariantShippingTotal(
  prisma: PrismaClient,
  lines: CartLineInput[],
  shippingCountry: string,
  options: { cod: boolean }
): Promise<number> {
  const code = resolveRateCountryCode(shippingCountry);
  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  if (variantIds.length === 0) return 0;

  let countryIn: string[];
  if (code === "OTHER") countryIn = ["OTHER", "US"];
  else if (code === "IN") countryIn = ["IN"];
  else countryIn = [code];

  const rows = await prisma.variantShippingRate.findMany({
    where: {
      variantId: { in: variantIds },
      country: { in: countryIn }
    }
  });

  const byVariant = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    if (r.country === code) {
      byVariant.set(r.variantId, r);
    }
  }
  if (code === "OTHER") {
    for (const r of rows) {
      if (r.country === "OTHER" && !byVariant.has(r.variantId)) {
        byVariant.set(r.variantId, r);
      }
    }
    for (const r of rows) {
      if (r.country === "US" && !byVariant.has(r.variantId)) {
        byVariant.set(r.variantId, r);
      }
    }
  }

  let total = 0;
  for (const line of lines) {
    const rate = byVariant.get(line.variantId);
    if (!rate) continue;
    const qty = Math.max(0, line.quantity);
    if (qty === 0) continue;
    const first = rate.standardPerProduct;
    const additional = qty > 1 ? rate.standardAdditional * (qty - 1) : 0;
    let lineShip = first + additional;
    if (options.cod && code === "IN") {
      lineShip += (rate.codPerProduct ?? 0) * qty;
    }
    total += lineShip;
  }
  return total;
}

export type ShippingLineBreakdown = {
  variantId: string;
  productName: string;
  quantity: number;
  zone: string;
  standardFirstUnit: number;
  standardAdditional: number;
  codSurcharge: number;
  lineTotal: number;
};

export type ShippingBreakdownResult = {
  zone: ZoneKey;
  rateCountry: string;
  currency: MoneyCurrency;
  lines: ShippingLineBreakdown[];
  subtotalShipping: number;
  codExtra: number;
  totalWithCod: number;
};

export async function computeVariantShippingBreakdown(
  prisma: PrismaClient,
  lines: CartLineInput[],
  shippingCountry: string,
  options: { cod: boolean }
): Promise<ShippingBreakdownResult> {
  const code = resolveRateCountryCode(shippingCountry);
  const zone = zoneFromCountry(shippingCountry);
  const currency = currencyForZone(zone);
  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  if (variantIds.length === 0) {
    return {
      zone,
      rateCountry: code,
      currency,
      lines: [],
      subtotalShipping: 0,
      codExtra: 0,
      totalWithCod: 0
    };
  }

  let countryIn: string[];
  if (code === "OTHER") countryIn = ["OTHER", "US"];
  else if (code === "IN") countryIn = ["IN"];
  else countryIn = [code];

  const [rateRows, variants] = await Promise.all([
    prisma.variantShippingRate.findMany({
      where: { variantId: { in: variantIds }, country: { in: countryIn } }
    }),
    prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { productRel: { select: { name: true } } }
    })
  ]);

  const byVariant = new Map<string, (typeof rateRows)[0]>();
  for (const r of rateRows) {
    if (r.country === code) byVariant.set(r.variantId, r);
  }
  if (code === "OTHER") {
    for (const r of rateRows) {
      if (r.country === "OTHER" && !byVariant.has(r.variantId)) byVariant.set(r.variantId, r);
    }
    for (const r of rateRows) {
      if (r.country === "US" && !byVariant.has(r.variantId)) byVariant.set(r.variantId, r);
    }
  }

  const nameByVariant = new Map(variants.map((v) => [v.id, v.productRel.name]));

  const breakdownLines: ShippingLineBreakdown[] = [];
  let subtotalShipping = 0;
  let codExtra = 0;

  for (const line of lines) {
    const rate = byVariant.get(line.variantId);
    const qty = Math.max(0, line.quantity);
    if (!rate || qty === 0) continue;
    const first = rate.standardPerProduct;
    const additional = qty > 1 ? rate.standardAdditional * (qty - 1) : 0;
    const codSurcharge =
      options.cod && code === "IN" ? (rate.codPerProduct ?? 0) * qty : 0;
    const lineStandard = first + additional;
    subtotalShipping += lineStandard;
    codExtra += codSurcharge;
    breakdownLines.push({
      variantId: line.variantId,
      productName: nameByVariant.get(line.variantId) ?? "Product",
      quantity: qty,
      zone: code,
      standardFirstUnit: first,
      standardAdditional: additional,
      codSurcharge,
      lineTotal: lineStandard + codSurcharge
    });
  }

  return {
    zone,
    rateCountry: code,
    currency,
    lines: breakdownLines,
    subtotalShipping,
    codExtra,
    totalWithCod: subtotalShipping + codExtra
  };
}

export type MoneyCurrency = "INR" | "USD" | "GBP";

export function currencyForZone(zone: ZoneKey): MoneyCurrency {
  if (zone === "IN") return "INR";
  if (zone === "GB") return "GBP";
  return "USD";
}
