import { getApiBase } from "./api";

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

export type ShippingBreakdown = {
  zone: string;
  rateCountry: string;
  currency: string;
  lines: ShippingLineBreakdown[];
  subtotalShipping: number;
  codExtra: number;
  totalWithCod: number;
};

export type ShippingRatesEstimate = {
  standardShippingInMinorUnits: number;
  withCodInMinorUnits: number | null;
  currency: string;
  zone?: string;
  breakdown?: {
    standard: ShippingBreakdown;
    withCod: ShippingBreakdown | null;
  };
};

export async function fetchShippingRatesEstimate(input: {
  country: string;
  pincode?: string;
  variantIds: string[];
  quantities: number[];
}): Promise<ShippingRatesEstimate> {
  if (input.variantIds.length === 0) {
    return { standardShippingInMinorUnits: 0, withCodInMinorUnits: 0, currency: "INR" };
  }
  const q = new URLSearchParams({
    country: input.country.toUpperCase(),
    variantIds: input.variantIds.join(","),
    quantities: input.quantities.join(",")
  });
  if (input.pincode?.trim()) {
    q.set("pincode", input.pincode.trim());
  }
  const res = await fetch(`${getApiBase()}/api/shipping/rates?${q.toString()}`, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: ShippingRatesEstimate;
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not estimate shipping");
  }
  return json.data;
}
