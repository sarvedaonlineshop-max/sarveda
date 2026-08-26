import { logger } from "../../config/logger";

import { AccountingError } from "./accounting-errors";
import { isAccountingCogsReversalEnabled } from "./accounting-flag";
import {
  assertBulkDiscoveryAllowed,
  resolveCogsReversalDiscoveryDryRun
} from "./production-guard";
import {
  postInventoryCogsReversal,
  previewInventoryCogsReversal
} from "./inventory-cogs-reversal-posting.service";
import { findInventoryCogsReversalDiscoveryCandidates } from "./inventory-cogs-reversal.snapshot.service";

export type InventoryCogsReversalDiscoveryOpts = {
  restockEventId?: string;
  orderId?: string;
  orderItemId?: string;
  variantId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  dryRun?: boolean;
  postedByUserId?: string;
};

export async function runInventoryCogsReversalDiscovery(opts: InventoryCogsReversalDiscoveryOpts = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const dryRun = resolveCogsReversalDiscoveryDryRun(opts.dryRun);

  assertBulkDiscoveryAllowed({
    orderId: opts.orderId,
    variantId: opts.variantId,
    restockEventId: opts.restockEventId,
    orderItemId: opts.orderItemId,
    limit,
    dryRun,
    persist: !dryRun
  });

  const candidates = await findInventoryCogsReversalDiscoveryCandidates({
    restockEventId: opts.restockEventId,
    orderId: opts.orderId,
    orderItemId: opts.orderItemId,
    variantId: opts.variantId,
    since: opts.since,
    until: opts.until,
    limit
  });

  const results: Array<Record<string, unknown>> = [];
  let posted = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const preview = await previewInventoryCogsReversal(candidate.id);
      if (!preview.eligibility.eligible) {
        skipped += 1;
        results.push({
          restockEventId: candidate.id,
          orderId: candidate.orderId,
          status: "skipped",
          code: preview.eligibility.code,
          reason: preview.eligibility.reason
        });
        continue;
      }

      if (dryRun) {
        results.push({
          restockEventId: candidate.id,
          orderId: candidate.orderId,
          status: "dry_run_eligible",
          code: preview.eligibility.code,
          proposal: preview.proposal,
          journalProposal: preview.journalProposal
        });
        continue;
      }

      if (!isAccountingCogsReversalEnabled()) {
        throw new AccountingError(
          "COGS reversal posting is disabled",
          "ACCOUNTING_COGS_REVERSAL_DISABLED",
          403
        );
      }

      const post = await postInventoryCogsReversal(candidate.id, {
        postedByUserId: opts.postedByUserId
      });
      posted += 1;
      results.push({
        restockEventId: candidate.id,
        orderId: candidate.orderId,
        status: post.duplicate ? "duplicate" : "posted",
        journalEntryId: post.journal?.id ?? null
      });
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "ERROR";
      results.push({
        restockEventId: candidate.id,
        orderId: candidate.orderId,
        status: "failed",
        code,
        reason: message
      });
    }
  }

  const summary = {
    dryRun,
    limit,
    scanned: candidates.length,
    posted,
    skipped,
    failed,
    cogsReversalEnabled: isAccountingCogsReversalEnabled(),
    results
  };

  logger.info("accounting_inventory_cogs_reversal_discovery", summary);
  return summary;
}
