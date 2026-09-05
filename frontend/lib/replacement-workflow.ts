import { getApiBase } from "./api";

export async function adminShipReplacement(
  fulfillmentId: string,
  body: { awb?: string; courier?: string; trackingUrl?: string } = {}
) {
  const res = await fetch(
    `${getApiBase()}/api/admin/replacement-fulfillments/${encodeURIComponent(fulfillmentId)}/ship`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not create replacement shipment");
  }
}

export async function adminMarkReplacementDelivered(fulfillmentId: string) {
  const res = await fetch(
    `${getApiBase()}/api/admin/replacement-fulfillments/${encodeURIComponent(fulfillmentId)}/delivered`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" }
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not mark replacement delivered");
  }
}
