import { getApiBase } from "@/lib/api";

export type IndiaDeliveryCheckResult = {
  serviceable: boolean;
  courierCount?: number;
  estimatedDays?: number;
};

function friendlyDeliveryError(status: number, raw: string): string {
  if (status === 404 || raw.toLowerCase().includes("route not found")) {
    return "We could not verify this PIN right now. You can still continue — delivery is confirmed again before payment.";
  }
  return raw;
}

/** Delhivery PIN serviceability (default domestic courier). */
export async function checkIndiaDelhiveryDelivery(pincode: string): Promise<IndiaDeliveryCheckResult> {
  const url = `${getApiBase()}/api/shipping/check-pincode`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pincode })
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { serviceable: boolean; estimatedDays?: number };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(friendlyDeliveryError(res.status, json.error || `Delivery check failed (${res.status})`));
  }
  return {
    serviceable: json.data.serviceable,
    estimatedDays: json.data.estimatedDays
  };
}

export async function checkIndiaShiprocketDelivery(body: {
  pincode: string;
  weightKg: number;
  cod: boolean;
}): Promise<IndiaDeliveryCheckResult & { courierCount: number }> {
  const url = `${getApiBase()}/api/shipping/check-india-shiprocket`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { serviceable: boolean; courierCount: number };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(friendlyDeliveryError(res.status, json.error || `Delivery check failed (${res.status})`));
  }
  return json.data;
}
