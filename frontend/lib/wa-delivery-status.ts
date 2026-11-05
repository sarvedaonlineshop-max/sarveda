/** Age thresholds for outbound WhatsApp tick labels in admin chat. */
export const WA_PENDING_MS = 2 * 60 * 1000;
export const WA_STALE_MS = 15 * 60 * 1000;

export type WaDeliveryState =
  | "sending"
  | "pending"
  | "undelivered"
  | "failed"
  | "delivered"
  | "read"
  | "unknown";

/**
 * API "sent/accepted" ≠ delivered to the phone. After a short wait we surface
 * pending / not-delivered so admins do not assume success from gray ticks.
 */
export function resolveWaDeliveryState(
  status: string | null | undefined,
  createdAt: string,
  nowMs = Date.now()
): WaDeliveryState {
  const s = String(status || "").toLowerCase();
  if (s === "failed") return "failed";
  if (s === "read") return "read";
  if (s === "delivered") return "delivered";
  const age = Math.max(0, nowMs - new Date(createdAt).getTime());
  if (s === "queued" || s === "sent" || !s) {
    if (age < WA_PENDING_MS) return "sending";
    if (age < WA_STALE_MS) return "pending";
    return "undelivered";
  }
  return "unknown";
}
