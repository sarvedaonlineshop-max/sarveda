/**
 * Accounting Discovery Worker — ORDER_PAID shadow posting (Phase 2B).
 *
 * Discovers committed paid orders AFTER the fact. Never writes to commerce tables.
 * Default dryRun=true; persistence requires ACCOUNTING_SALES_POSTING_ENABLED=1.
 */

import { logger } from "../../config/logger";

import { isNativeAccountingEnabled } from "./accounting-flag";
import { isOrderEligibleForOrderPaidPosting } from "./order-eligibility";
import {
  ORDER_PAID_EVENT_TYPE,
  orderPaidUniqueKey
} from "./order-paid.constants";
import {
  postOrderPaidJournal,
  previewOrderPaidJournal
} from "./order-paid-posting.service";
import {
  findOrderDiscoveryCandidates,
  loadOrderPaidSnapshotById
} from "./order-snapshot.service";
import { getPostingEvent } from "./posting-event.service";
import {
  assertBulkDiscoveryAllowed,
  resolveDiscoveryDryRun
} from "./production-guard";
import { buildReconciliationRowFromProposal } from "./reconciliation.service";

export const DISCOVERY_WORKER_QUEUE = "accounting-discovery";

export type DiscoveryScanOptions = {
  orderId?: string;
  orderNumber?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  dryRun?: boolean;
  postedByUserId?: string;
};

export type DiscoveryOrderResult = {
  orderId: string;
  orderNumber: string;
  eligible: boolean;
  reason?: string;
  code?: string;
  action: "skipped" | "preview" | "posted" | "duplicate" | "failed";
  duplicate?: boolean;
  journalEntryNumber?: string;
  imbalancePaise?: number;
  error?: string;
};

export type DiscoveryScanResult = {
  scanned: number;
  eligible: number;
  posted: number;
  duplicates: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  skippedModule: boolean;
  reason?: string;
  results: DiscoveryOrderResult[];
  reconciliationPreview?: ReturnType<typeof buildReconciliationRowFromProposal>[];
};

export async function runOrderPaidDiscovery(
  opts?: DiscoveryScanOptions
): Promise<DiscoveryScanResult> {
  const dryRun = resolveDiscoveryDryRun(opts?.dryRun);
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
      results: []
    };
  }

  assertBulkDiscoveryAllowed({
    orderId: opts?.orderId,
    orderNumber: opts?.orderNumber,
    limit,
    dryRun,
    persist: !dryRun
  });

  const candidates = await findOrderDiscoveryCandidates({
    orderId: opts?.orderId,
    orderNumber: opts?.orderNumber,
    since: opts?.orderId || opts?.orderNumber ? undefined : since,
    until: opts?.orderId || opts?.orderNumber ? undefined : until,
    limit
  });

  const results: DiscoveryOrderResult[] = [];
  const reconciliationPreview = [];
  let eligible = 0;
  let posted = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const snapshot = await loadOrderPaidSnapshotById(candidate.orderId);
      const preview = await previewOrderPaidJournal(snapshot);

      if (!preview.eligibility.eligible) {
        skipped += 1;
        results.push({
          orderId: snapshot.orderId,
          orderNumber: snapshot.orderNumber,
          eligible: false,
          reason: preview.eligibility.reason,
          code: preview.eligibility.code,
          action: "skipped"
        });
        continue;
      }

      eligible += 1;

      if (preview.buildError) {
        failed += 1;
        results.push({
          orderId: snapshot.orderId,
          orderNumber: snapshot.orderNumber,
          eligible: true,
          action: "failed",
          error: preview.buildError.message
        });
        continue;
      }

      reconciliationPreview.push(
        buildReconciliationRowFromProposal(
          snapshot,
          preview.proposal,
          preview.eligibility
        )
      );

      if (dryRun) {
        results.push({
          orderId: snapshot.orderId,
          orderNumber: snapshot.orderNumber,
          eligible: true,
          action: "preview",
          imbalancePaise: preview.proposal?.imbalancePaise
        });
        continue;
      }

      const existing = await getPostingEvent(
        ORDER_PAID_EVENT_TYPE,
        orderPaidUniqueKey(snapshot.orderId)
      );
      if (existing?.status === "POSTED" && existing.journalEntry) {
        duplicates += 1;
        results.push({
          orderId: snapshot.orderId,
          orderNumber: snapshot.orderNumber,
          eligible: true,
          action: "duplicate",
          duplicate: true,
          journalEntryNumber: existing.journalEntry.entryNumber
        });
        continue;
      }

      const postResult = await postOrderPaidJournal(snapshot, {
        postedByUserId: opts?.postedByUserId
      });

      if (postResult.duplicate) {
        duplicates += 1;
        results.push({
          orderId: snapshot.orderId,
          orderNumber: snapshot.orderNumber,
          eligible: true,
          action: "duplicate",
          duplicate: true,
          journalEntryNumber: postResult.journal.entryNumber
        });
      } else {
        posted += 1;
        results.push({
          orderId: snapshot.orderId,
          orderNumber: snapshot.orderNumber,
          eligible: true,
          action: "posted",
          journalEntryNumber: postResult.journal.entryNumber
        });
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        orderId: candidate.orderId,
        orderNumber: candidate.orderNumber,
        eligible: false,
        action: "failed",
        error: message
      });
    }
  }

  logger.info("accounting_order_paid_discovery", {
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
    results,
    reconciliationPreview
  };
}

/** Read-only scan for health dashboard — counts missing POSTED events. */
export async function scanPaidOrdersForMissingAccountingEvents(
  opts?: DiscoveryScanOptions
): Promise<{
  scanned: number;
  missingEvents: number;
  skipped: boolean;
  dryRun: boolean;
  reason?: string;
  sampleMissingOrderIds?: string[];
}> {
  const dryRun = opts?.dryRun ?? true;

  if (!isNativeAccountingEnabled()) {
    return {
      scanned: 0,
      missingEvents: 0,
      skipped: true,
      dryRun,
      reason: "NATIVE_ACCOUNTING_ENABLED=0"
    };
  }

  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 500);
  const since = opts?.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const until = opts?.until ?? new Date();

  const candidates = await findOrderDiscoveryCandidates({
    orderId: opts?.orderId,
    orderNumber: opts?.orderNumber,
    since: opts?.orderId ? undefined : since,
    until: opts?.orderId ? undefined : until,
    limit
  });

  const missing: string[] = [];
  for (const c of candidates) {
    const snapshot = await loadOrderPaidSnapshotById(c.orderId);
    const eligibility = isOrderEligibleForOrderPaidPosting(snapshot);
    if (!eligibility.eligible) continue;

    const existing = await getPostingEvent(
      ORDER_PAID_EVENT_TYPE,
      orderPaidUniqueKey(c.orderId)
    );
    if (!existing || existing.status !== "POSTED") {
      missing.push(c.orderId);
    }
  }

  return {
    scanned: candidates.length,
    missingEvents: missing.length,
    skipped: false,
    dryRun,
    sampleMissingOrderIds: missing.slice(0, 10)
  };
}

export function startAccountingDiscoveryWorker(): void {
  logger.info("accounting_discovery_worker_on_demand", {
    note: "Phase 2B — invoke via POST /api/admin/accounting/order-paid/discover (not auto-scheduled)"
  });
}
