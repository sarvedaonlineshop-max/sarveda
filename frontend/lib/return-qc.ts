import { getApiBase } from "./api";

export async function adminPerformRepairHoldQc(
  orderId: string,
  requestId: string,
  lines: Array<{ orderItemId: string; quantity: number }>
) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/return-qc`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        lines: lines.map((line) => ({
          orderItemId: line.orderItemId,
          quantity: line.quantity,
          disposition: "REPACK",
          note: "Repair / refurbish before resale"
        }))
      })
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not place returned item in repair/refurbish hold");
  }
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
