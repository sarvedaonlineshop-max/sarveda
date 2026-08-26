import { logger } from "../../config/logger";

import { isNativeAccountingEnabled } from "./accounting-flag";
import { assertBulkDiscoveryAllowed, resolveCogsDiscoveryDryRun } from "./production-guard";
import {
  INVENTORY_COGS_RECOGNIZED_EVENT_TYPE,
  inventoryCogsRecognizedUniqueKey
} from "./inventory-cogs.constants";
import { postInventoryCogs, previewInventoryCogs } from "./inventory-cogs-posting.service";
import { findInventoryCogsDiscoveryCandidates } from "./inventory-cogs.snapshot.service";
import { getPostingEvent } from "./posting-event.service";

export async function runInventoryCogsDiscovery(opts?: {
  orderId?: string;
  since?: Date;
  until?: Date;
  variantId?: string;
  limit?: number;
  dryRun?: boolean;
  postedByUserId?: string;
}) {
  const dryRun = resolveCogsDiscoveryDryRun(opts?.dryRun);
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 500);
  const since = opts?.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const until = opts?.until ?? new Date();

  if (!isNativeAccountingEnabled()) {
    return {
      scanned: 0,
      eligible: 0,
      posted: 0,
      duplicates: 0,
      skipped: 0,
      failed: 0,
      dryRun,
      skippedModule: true,
      reason: "NATIVE_ACCOUNTING_ENABLED=0",
      results: [] as Array<Record<string, unknown>>
    };
  }

  assertBulkDiscoveryAllowed({
    orderId: opts?.orderId,
    variantId: opts?.variantId,
    limit,
    dryRun,
    persist: !dryRun
  });

  const candidates = await findInventoryCogsDiscoveryCandidates({
    orderId: opts?.orderId,
    since: opts?.orderId ? undefined : since,
    until: opts?.orderId ? undefined : until,
    variantId: opts?.variantId,
    limit
  });

  const results: Array<Record<string, unknown>> = [];
  let eligible = 0;
  let posted = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const preview = await previewInventoryCogs({ orderId: candidate.id });
      if (!preview.eligibility.eligible) {
        const existing = await getPostingEvent(
          INVENTORY_COGS_RECOGNIZED_EVENT_TYPE,
          inventoryCogsRecognizedUniqueKey(candidate.id)
        );
        if (existing?.status === "POSTED" && preview.eligibility.code === "ALREADY_POSTED") {
          duplicates += 1;
          results.push({
            orderId: candidate.id,
            orderNumber: candidate.orderNumber,
            action: "duplicate",
            code: preview.eligibility.code
          });
          continue;
        }
        skipped += 1;
        results.push({
          orderId: candidate.id,
          orderNumber: candidate.orderNumber,
          action: "skipped",
          code: preview.eligibility.code,
          reason: preview.eligibility.reason
        });
        continue;
      }

      eligible += 1;
      if (dryRun) {
        results.push({
          orderId: candidate.id,
          orderNumber: candidate.orderNumber,
          action: "preview",
          totalCogsInPaise: preview.journalProposal?.totalCogsInPaise ?? null
        });
        continue;
      }

      const post = await postInventoryCogs({ orderId: candidate.id }, { postedByUserId: opts?.postedByUserId });
      if (post.duplicate) {
        duplicates += 1;
        results.push({
          orderId: candidate.id,
          orderNumber: candidate.orderNumber,
          action: "duplicate",
          journalEntryNumber: post.journal.entryNumber
        });
      } else {
        posted += 1;
        results.push({
          orderId: candidate.id,
          orderNumber: candidate.orderNumber,
          action: "posted",
          journalEntryNumber: post.journal.entryNumber
        });
      }
    } catch (err) {
      failed += 1;
      results.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "failed",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  logger.info("accounting_inventory_cogs_discovery", {
    scanned: candidates.length,
    eligible,
    posted,
    duplicates,
    skipped,
    failed,
    dryRun
  });

  return {
    scanned: candidates.length,
    eligible,
    posted,
    duplicates,
    skipped,
    failed,
    dryRun,
    skippedModule: false,
    results
  };
}
