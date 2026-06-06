export type ZohoSyncScenario = 1 | 2 | 3 | 4;

/** Scenario 1 = synced, 2 = count mismatch, 3 = Zoho-only, 4 = Sarveda-only */
export type ZohoScenarioKey = "synced" | "count_mismatch" | "zoho_only" | "sarveda_only";

export type ZohoItemAuditRow = {
  sku: string;
  itemId: string;
  name: string;
  stockOnHand: number;
};

export type ZohoActionResult = {
  ok: number;
  errors: number;
  messages: string[];
};

export type ZohoStockSyncResult = {
  synced: number;
  errors: number;
  skipped: number;
};

export function scenarioKeyFromNumber(n: ZohoSyncScenario): ZohoScenarioKey {
  if (n === 1) return "synced";
  if (n === 2) return "count_mismatch";
  if (n === 3) return "zoho_only";
  return "sarveda_only";
}

export function classifySkuPair(
  sarvedaOnHand: number | null,
  zoho: ZohoItemAuditRow | undefined
): ZohoSyncScenario | null {
  if (sarvedaOnHand === null && zoho) return 3;
  if (sarvedaOnHand !== null && !zoho) return 4;
  if (sarvedaOnHand !== null && zoho) {
    return sarvedaOnHand === zoho.stockOnHand ? 1 : 2;
  }
  return null;
}
