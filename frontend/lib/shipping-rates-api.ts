import { getApiBase } from "./api";

export type ShippingRatesEstimate = {
  standardShippingInMinorUnits: number;
  withCodInMinorUnits: number | null;
  currency: string;
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
