import { getApiBase } from "./api";

export type ReturnQcDisposition = "SELLABLE" | "REPACK" | "WRITE_OFF";

export type ReturnQcLine = {
  orderItemId: string;
  quantity: number;
  disposition: ReturnQcDisposition;
  note?: string;
};

/**
 * Submit the warehouse QC review as one atomic review payload. Each returned
 * item/unit can have its own disposition, so mixed-condition returns are safe.
 */
export async function adminPerformReturnQc(
  orderId: string,
  requestId: string,
  lines: ReturnQcLine[]
) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/return-qc`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ lines })
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not record return QC review");
  }
  return json;
}

export async function adminPerformRepairHoldQc(
  orderId: string,
  requestId: string,
  lines: Array<{ orderItemId: string; quantity: number }>
) {
  return adminPerformReturnQc(
    orderId,
    requestId,
    lines.map((line) => ({
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      disposition: "REPACK" as const,
      note: "Repair / refurbish before resale"
    }))
  );
}

export async function adminReleaseRepairedItemToSellable(
  orderId: string,
  requestId: string,
  qcLineId: string
) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/qc-lines/${encodeURIComponent(qcLineId)}/release-repack`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" }
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not release repaired item to sellable stock");
  }
}
