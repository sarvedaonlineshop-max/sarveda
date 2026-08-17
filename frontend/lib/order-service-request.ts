import { getApiBase } from "./api";

export const CANCEL_BEFORE_DELIVERY_REASONS = [
  { code: "mistake", label: "Placed the order by mistake" },
  { code: "price_high", label: "Found it cheaper somewhere else" },
  { code: "delivery_slow", label: "Delivery is taking too long" },
  { code: "change_address", label: "Need to change the delivery address" },
  { code: "wrong_item", label: "Ordered the wrong item, size, or colour" },
  { code: "change_quantity", label: "Need to change the quantity" },
  { code: "no_longer_needed", label: "No longer needed" },
  { code: "other", label: "Other" }
] as const;

export const REFUND_AFTER_DELIVERY_REASONS = [
  { code: "defective", label: "Item is defective or doesn't work" },
  { code: "wrong_item_sent", label: "Wrong item was sent" },
  { code: "damaged_delivery", label: "Damaged during delivery" },
  { code: "different_description", label: "Different from the description or photos" },
  { code: "missing_parts", label: "Missing parts or accessories" },
  { code: "replace_variant", label: "Want to replace with a different size or colour" },
  { code: "quality_issue", label: "Quality is not as expected" },
  { code: "extra_item", label: "Received an extra item I didn't order" },
  { code: "arrived_late", label: "Arrived too late" },
  { code: "changed_mind", label: "Changed my mind / no longer needed" },
  { code: "other", label: "Other" }
] as const;

export type OrderServiceRequestPublic = {
  id: string;
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY";
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  reasonLabel: string;
  message: string | null;
  createdAt: string;
};

export async function submitOrderCancelRequest(
  orderNumber: string,
  payload: {
    items: Array<{
      orderItemId: string;
      reasonCode: string;
      otherMessage?: string;
      message?: string;
    }>;
    message?: string;
    photosByIndex: Map<number, File[]>;
  }
): Promise<void> {
  const form = new FormData();
  form.set("items", JSON.stringify(payload.items));
  if (payload.message?.trim()) form.set("message", payload.message.trim());
  for (const [index, files] of Array.from(payload.photosByIndex.entries())) {
    for (const file of files) {
      form.append(`photo_${index}`, file);
    }
  }

  const res = await fetch(`${getApiBase()}/api/orders/${encodeURIComponent(orderNumber)}/cancel-request`, {
    method: "POST",
    credentials: "include",
    body: form
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not submit cancellation request");
  }
}

export async function submitOrderRefundRequest(
  orderNumber: string,
  payload: {
    items: Array<{
      orderItemId: string;
      reasonCode: string;
      otherMessage?: string;
      message?: string;
    }>;
    message?: string;
    photosByIndex: Map<number, File[]>;
  }
): Promise<void> {
  const form = new FormData();
  form.set("items", JSON.stringify(payload.items));
  if (payload.message?.trim()) form.set("message", payload.message.trim());
  for (const [index, files] of Array.from(payload.photosByIndex.entries())) {
    for (const file of files) {
      form.append(`photo_${index}`, file);
    }
  }

  const res = await fetch(`${getApiBase()}/api/orders/${encodeURIComponent(orderNumber)}/refund-request`, {
    method: "POST",
    credentials: "include",
    body: form
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not submit return/refund request");
  }
}

export function adminServiceRequestPhotoViewUrl(orderId: string, photoId: string): string {
  return `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/photos/${encodeURIComponent(photoId)}/view`;
}

export function adminServiceRequestPhotoDownloadUrl(orderId: string, photoId: string): string {
  return `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/photos/${encodeURIComponent(photoId)}/download`;
}

export async function fetchPendingServiceRequestCount(): Promise<number> {
  const res = await fetch(`${getApiBase()}/api/admin/orders/service-requests/pending-count`, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const json = (await res.json()) as { success?: boolean; data?: { count: number } };
  if (!res.ok || !json.success) return 0;
  return json.data?.count ?? 0;
}

export async function approveServiceRequest(orderId: string, requestId: string, adminNote?: string) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ adminNote: adminNote?.trim() || undefined })
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not approve request");
  }
}

export async function rejectServiceRequest(orderId: string, requestId: string, adminNote?: string) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ adminNote: adminNote?.trim() || undefined })
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not reject request");
  }
}

export async function processServiceRequestRefund(
  orderId: string,
  requestId: string,
  payload: {
    items: Array<{ requestItemId: string; amountInPaise: number }>;
    codRefundNote?: string;
  }
): Promise<{ message: string; totalRefundedInPaise: number; refundId?: string }> {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/refund`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }
  );
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: { message: string; totalRefundedInPaise: number; refundId?: string };
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not process refund");
  }
  return json.data;
}
