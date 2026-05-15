import { getApiBase } from "@/lib/api";

export type IndiaShiprocketCheckResult = {
  serviceable: boolean;
  courierCount: number;
};

export async function checkIndiaShiprocketDelivery(body: {
  pincode: string;
  weightKg: number;
  cod: boolean;
}): Promise<IndiaShiprocketCheckResult> {
  const url = `${getApiBase()}/api/shipping/check-india-shiprocket`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: IndiaShiprocketCheckResult;
    error?: string;
    code?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || `Delivery check failed (${res.status})`);
  }
  return json.data;
}
