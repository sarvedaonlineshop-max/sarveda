/**
 * Sarveda is the inventory master. Zoho Books is accounting-only (invoices, bills, payments).
 * When false (default), no stock pull/push/audit/mirror runs — routes remain for rollback.
 */
export function isZohoInventorySyncEnabled(): boolean {
  const v = (process.env.ZOHO_INVENTORY_SYNC ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

export const ZOHO_INVENTORY_SYNC_DISABLED_MESSAGE =
  "Zoho inventory sync is disabled — Sarveda is the stock master. Zoho is used for invoices/bills only.";
