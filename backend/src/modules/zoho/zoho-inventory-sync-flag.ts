/**
 * Zoho Books inventory sync is permanently retired.
 * Sarveda is the sole inventory master — no Zoho push/pull/mirror.
 */
export function isZohoInventorySyncEnabled(): boolean {
  return false;
}

export const ZOHO_INVENTORY_SYNC_DISABLED_MESSAGE =
  "Zoho inventory sync is retired — Sarveda is the sole stock master.";
