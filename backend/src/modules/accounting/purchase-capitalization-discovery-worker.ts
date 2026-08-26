import { isNativeAccountingEnabled, isAccountingInventoryValuationEnabled } from "./accounting-flag";
import { assertBulkDiscoveryAllowed, resolvePurchaseCapitalizationDiscoveryDryRun } from "./production-guard";
import {
  INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE,
  PURCHASE_CAPITALIZATION_DISCOVERY_MAX
} from "./purchase-capitalization.constants";
import { previewReceiptLineCapitalization } from "./purchase-capitalization-eligibility";
import { postPurchaseCapitalization } from "./purchase-capitalization-posting.service";
import { findPurchaseCapitalizationDiscoveryCandidates } from "./purchase-capitalization-snapshot.service";

export type PurchaseCapitalizationDiscoveryInput = {
  receiptId?: string;
  purchaseOrderId?: string;
  vendorBillId?: string;
  variantId?: string;
  since?: string;
  until?: string;
  limit?: number;
  dryRun?: boolean;
};

export async function runPurchaseCapitalizationDiscovery(input: PurchaseCapitalizationDiscoveryInput) {
  if (!isNativeAccountingEnabled()) {
    return {
      dryRun: true,
      scanned: 0,
      eligible: 0,
      posted: 0,
      skipped: 0,
      rows: [] as Array<Record<string, unknown>>,
      warnings: ["NATIVE_ACCOUNTING_ENABLED is off"]
    };
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), PURCHASE_CAPITALIZATION_DISCOVERY_MAX);
  const dryRun = resolvePurchaseCapitalizationDiscoveryDryRun(input.dryRun);

  assertBulkDiscoveryAllowed({
    receiptId: input.receiptId,
    purchaseOrderId: input.purchaseOrderId,
    vendorBillId: input.vendorBillId,
    variantId: input.variantId,
    limit,
    dryRun,
    persist: !dryRun
  });

  const candidates = await findPurchaseCapitalizationDiscoveryCandidates({
    receiptId: input.receiptId,
    purchaseOrderId: input.purchaseOrderId,
    vendorBillId: input.vendorBillId,
    variantId: input.variantId,
    since: input.since ? new Date(input.since) : undefined,
    until: input.until ? new Date(input.until) : undefined,
    limit
  });

  const rows: Array<Record<string, unknown>> = [];
  let eligible = 0;
  let posted = 0;
  let skipped = 0;

  for (const c of candidates) {
    try {
      const preview = await previewReceiptLineCapitalization(c.receiptLineId);
      const row: Record<string, unknown> = {
        receiptLineId: c.receiptLineId,
        receiptId: c.receiptId,
        receivedAt: c.receivedAt.toISOString(),
        sku: preview.snapshot?.sku ?? null,
        eligibility: preview.eligibility,
        proposal: preview.eligibility.eligible
          ? {
              capitalizationValueInPaise: preview.snapshot?.capitalizationValueInPaise,
              unitCostInPaise: preview.snapshot?.netUnitCostInPaise,
              quantityReceived: preview.snapshot?.quantityReceived
            }
          : null
      };

      if (preview.eligibility.eligible) {
        eligible++;
        if (!dryRun && isAccountingInventoryValuationEnabled()) {
          const result = await postPurchaseCapitalization(c.receiptLineId);
          row.posted = !result.duplicate;
          row.journalEntryId = result.journal.id;
          posted += result.duplicate ? 0 : 1;
          skipped += result.duplicate ? 1 : 0;
        }
      } else if (preview.eligibility.code === "ALREADY_POSTED") {
        skipped++;
      }

      rows.push(row);
    } catch (err) {
      rows.push({
        receiptLineId: c.receiptLineId,
        receiptId: c.receiptId,
        error: err instanceof Error ? err.message : String(err)
      });
      skipped++;
    }
  }

  return {
    dryRun,
    eventType: INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE,
    scanned: candidates.length,
    eligible,
    posted,
    skipped,
    rows
  };
}
