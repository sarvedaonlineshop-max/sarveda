/** Age thresholds for outbound WhatsApp tick labels in admin chat. */
export const WA_PENDING_MS = 2 * 60 * 1000;
export const WA_STALE_MS = 15 * 60 * 1000;

export type WaDeliveryState =
  | "sending"
  | "pending"
  | "accepted"
  | "failed"
  | "delivered"
  | "read"
  | "unknown";

/**
 * "sent" means WhatsApp accepted the message. It is not a failure.
 * Only an explicit provider failure is "failed". A phone that never
 * confirms delivery stays "accepted".
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
    return "accepted";
  }
  return "unknown";
}
