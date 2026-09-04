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

/** Reasons routed to the adjustment workflow — not standard cancellation. */
export const ADJUSTMENT_REASONS = [
  { code: "change_address", label: "Need to change the delivery address" },
  { code: "wrong_item", label: "Ordered the wrong item, size, or colour" },
  { code: "change_quantity", label: "Need to change the quantity" }
] as const;

export const CANCEL_ONLY_REASONS = CANCEL_BEFORE_DELIVERY_REASONS.filter(
  (r) => !ADJUSTMENT_REASONS.some((a) => a.code === r.code)
);

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

export type AdjustmentPreview = {
  oldMerchandisePaise: number;
  newMerchandisePaise: number;
  oldShippingPaise: number;
  newShippingPaise: number;
  oldGrandTotalPaise: number;
  newGrandTotalPaise: number;
  deltaPaise: number;
  classification: string;
  warnings: string[];
  canExecuteAutomatically: boolean;
  eligible: boolean;
  blockCode?: string;
  blockMessage?: string;
  inventoryWarnings: string[];
};

export type AdjustmentVariantOption = {
  id: string;
  sku: string;
  label: string;
  saleInPaise: number;
  inStock: boolean;
  isCurrent: boolean;
};

export type AdjustmentOptions = {
  orderItemId: string;
  productName: string;
  currentVariantId: string;
  currentQty: number;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
  variants: AdjustmentVariantOption[];
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

export async function submitOrderAdjustRequest(
  orderNumber: string,
  payload: {
    reasonCode: "change_address" | "wrong_item" | "change_quantity";
    orderItemId: string;
    message?: string;
    requestedVariantId?: string;
    requestedQty?: number;
    requestedAddress?: {
      fullName: string;
      phone: string;
      line1: string;
      line2?: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/orders/${encodeURIComponent(orderNumber)}/adjust-request`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not submit order change request");
  }
}

export async function fetchAdjustmentOptions(
  orderNumber: string,
  orderItemId: string
): Promise<AdjustmentOptions> {
  const q = new URLSearchParams({ orderItemId });
  const res = await fetch(
    `${getApiBase()}/api/orders/${encodeURIComponent(orderNumber)}/adjustment-options?${q.toString()}`,
    { credentials: "include", headers: { Accept: "application/json" } }
  );
  const json = (await res.json()) as { success?: boolean; data?: AdjustmentOptions; error?: string };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not load adjustment options");
  }
  return json.data;
}

export const RETURN_RESOLUTION_OPTIONS: Record<
  string,
  Array<{ code: string; label: string }>
> = {
  defective: [
    { code: "RETURN_FOR_REFUND", label: "Return for full refund" },
    { code: "REPLACEMENT", label: "Replace item" },
    { code: "PARTIAL_REFUND", label: "Partial refund" }
  ],
  wrong_item_sent: [
    { code: "RETURN_FOR_REFUND", label: "Return for refund" },
    { code: "REPLACEMENT", label: "Replace with correct item" }
  ],
  damaged_delivery: [
    { code: "RETURN_FOR_REFUND", label: "Return for refund" },
    { code: "REPLACEMENT", label: "Replacement" },
    { code: "PARTIAL_REFUND", label: "Partial refund" }
  ],
  different_description: [
    { code: "RETURN_FOR_REFUND", label: "Return for refund" },
    { code: "REPLACEMENT", label: "Replacement" },
    { code: "PARTIAL_REFUND", label: "Partial refund" }
  ],
  missing_parts: [
    { code: "REPLACEMENT", label: "Send missing part" },
    { code: "PARTIAL_REFUND", label: "Partial refund" },
    { code: "KEEP_ITEM_PARTIAL_REFUND", label: "Keep item — partial refund" }
  ],
  replace_variant: [{ code: "REPLACEMENT", label: "Replace with different size/colour" }],
  quality_issue: [
    { code: "RETURN_FOR_REFUND", label: "Return for refund" },
    { code: "PARTIAL_REFUND", label: "Partial refund" },
    { code: "KEEP_ITEM_PARTIAL_REFUND", label: "Keep item — partial refund" }
  ],
  extra_item: [{ code: "RETURN_FOR_REFUND", label: "Return extra item" }],
  arrived_late: [
    { code: "RETURN_FOR_REFUND", label: "Return for refund" },
    { code: "PARTIAL_REFUND", label: "Partial refund" },
    { code: "KEEP_ITEM_PARTIAL_REFUND", label: "Keep item — partial refund" }
  ],
  changed_mind: [{ code: "RETURN_FOR_REFUND", label: "Return for refund" }],
  other: [
    { code: "RETURN_FOR_REFUND", label: "Return for refund" },
    { code: "REPLACEMENT", label: "Replacement" },
    { code: "PARTIAL_REFUND", label: "Partial refund" }
  ]
};

/** Reasons that require at least one photo before submission (mirrors backend RETURN_REASON_SPEC). */
export const RETURN_EVIDENCE_REQUIRED = new Set([
  "defective",
  "wrong_item_sent",
  "damaged_delivery",
  "different_description",
  "missing_parts",
  "replace_variant",
  "quality_issue",
  "changed_mind"
]);

export const RETURN_EVIDENCE_HINT: Record<string, string> = {
  defective: "Photos or a short video showing the issue. Unboxing video if it may relate to transit.",
  wrong_item_sent: "Photo of the item received, SKU/label and packaging.",
  damaged_delivery: "Photos of outer packaging, shipping label, inner packaging and the damaged product.",
  different_description: "Photos/video showing how the item differs from the listing.",
  missing_parts: "Photo of all contents received and the packaging.",
  replace_variant: "Clear photos of the product condition before reverse pickup.",
  quality_issue: "Photos showing the quality concern (encouraged) plus a short written explanation.",
  changed_mind: "Clear photos of the product condition before reverse pickup."
};

export async function submitOrderRefundRequest(
  orderNumber: string,
  payload: {
    items: Array<{
      orderItemId: string;
      reasonCode: string;
      qty?: number;
      requestedResolution?: string;
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

export async function fetchAdjustmentPreview(
  orderId: string,
  requestId: string
): Promise<AdjustmentPreview> {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/adjustment-preview`,
    { credentials: "include", headers: { Accept: "application/json" } }
  );
  const json = (await res.json()) as { success?: boolean; data?: AdjustmentPreview; error?: string };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not load adjustment preview");
  }
  return json.data;
}

export async function executeAdjustment(
  orderId: string,
  requestId: string,
  adminNote?: string
): Promise<{ message: string }> {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/execute-adjustment`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ adminNote: adminNote?.trim() || undefined })
    }
  );
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: { message: string };
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not execute adjustment");
  }
  return json.data;
}

export async function markAdjustmentNeedsDiscussion(
  orderId: string,
  requestId: string,
  adminNote?: string
): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/needs-discussion`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ adminNote: adminNote?.trim() || undefined })
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not update request");
  }
}

export async function convertAdjustmentToCancellation(
  orderId: string,
  requestId: string,
  adminNote?: string
): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/convert-to-cancellation`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ adminNote: adminNote?.trim() || undefined })
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not convert to cancellation");
  }
}

export async function adminCreateSupplementaryPayment(orderId: string, requestId: string) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/supplementary-payment`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({})
    }
  );
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      supplementaryPaymentId: string;
      amountInPaise: number;
      provider: string;
      razorpayOrderId?: string;
      razorpayKeyId?: string;
      stripeCheckoutUrl?: string;
      paypalApprovalUrl?: string;
    };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not create supplementary payment");
  }
  return json.data;
}

export async function createCustomerSupplementaryPayment(orderNumber: string, requestId: string) {
  const res = await fetch(
    `${getApiBase()}/api/orders/${encodeURIComponent(orderNumber)}/supplementary-payment`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ requestId })
    }
  );
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      supplementaryPaymentId: string;
      amountInPaise: number;
      provider: string;
      razorpayOrderId?: string;
      razorpayKeyId?: string;
      stripeCheckoutUrl?: string;
      paypalApprovalUrl?: string;
    };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not start additional payment");
  }
  return json.data;
}

export async function verifySupplementaryRazorpayPayment(body: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const res = await fetch(`${getApiBase()}/api/payments/supplementary/razorpay/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Payment verification failed");
  }
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

export async function adminUpdateReturnShipment(
  orderId: string,
  requestId: string,
  body: { courier?: string; awb?: string; trackingUrl?: string; physicalStatus?: string }
) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/return-shipment`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) throw new Error(json.error || "Failed");
}

export async function adminMarkReturnReceived(orderId: string, requestId: string) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/return-received`,
    { method: "POST", credentials: "include" }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) throw new Error(json.error || "Failed");
}

export async function adminMarkReturnDisposition(
  orderId: string,
  requestId: string,
  disposition: "RESTOCKABLE" | "DAMAGED_NON_RESTOCKABLE" | "NEEDS_REVIEW"
) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/return-disposition`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ disposition })
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) throw new Error(json.error || "Failed");
}

export async function adminFetchReturnRefundPreview(orderId: string, requestId: string) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/refund-preview`,
    { method: "GET", credentials: "include", headers: { Accept: "application/json" } }
  );
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: ReturnRefundPreview;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not load refund preview");
  }
  return json.data;
}

export type ReturnRefundPreview = {
  requestId: string;
  orderId: string;
  orderNumber: string;
  caseNumber: string | null;
  executable: boolean;
  blockCode?: string;
  blockMessage?: string;
  shippingPolicy: string;
  paymentProvider: string | null;
  refundDestinationLabel: string;
  currency: string;
  lines: Array<{
    requestItemId: string;
    orderItemId: string;
    nameSnapshot: string;
    skuSnapshot: string;
    qtySelected: number;
    qtyOrdered: number;
    merchandiseRefundPaise: number;
    shippingRefundPaise: number;
    otherAdjustmentPaise: number;
    alreadyRefundedPaise: number;
    lineTotalRefundPaise: number;
    explanation: string;
  }>;
  merchandiseRefundPaise: number;
  shippingRefundPaise: number;
  otherAdjustmentPaise: number;
  alreadyRefundedPaise: number;
  totalRefundNowPaise: number;
  remainingGatewayPaise: number;
  approvedQtySelected: number;
  orderedQtyOnLines: number;
};

export async function adminProcessReturnRefund(
  orderId: string,
  requestId: string,
  codRefundNote?: string
) {
  const res = await fetch(
    `${getApiBase()}/api/admin/orders/${encodeURIComponent(orderId)}/service-requests/${encodeURIComponent(requestId)}/refund`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ codRefundNote: codRefundNote?.trim() || undefined })
    }
  );
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: {
      message: string;
      totalRefundedInPaise: number;
      refundIds: string[];
      preview?: ReturnRefundPreview;
    };
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Refund failed");
  }
  return json.data;
}

export async function adminShipReplacement(
  fulfillmentId: string,
  body: { awb?: string; courier?: string; trackingUrl?: string }
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
  if (!res.ok || !json.success) throw new Error(json.error || "Failed");
}
