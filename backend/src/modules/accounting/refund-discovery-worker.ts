/**
 * Accounting Refund Discovery Worker — ORDER_REFUNDED_FULL shadow posting (Phase 2C).
 *
 * Discovers committed Refund rows AFTER the fact. Never writes to commerce tables.
 * Default dryRun=true; persistence requires ACCOUNTING_REFUND_POSTING_ENABLED=1.
 *
 * V1 auto-posts ONLY a single unambiguous full monetary refund.
 * Partial / cumulative-full refunds are discovered for reconciliation only.
 */

import { logger } from "../../config/logger";

import { isNativeAccountingEnabled } from "./accounting-flag";
import {
  ORDER_REFUNDED_FULL_EVENT_TYPE,
  orderRefundedFullUniqueKey
} from "./order-refunded-full.constants";
import {
  postOrderRefundedFull,
  previewOrderRefundedFull
} from "./order-refunded-full-posting.service";
import {
  findRefundDiscoveryCandidates,
  loadOrderRefundContextByOrderId
} from "./order-refund-snapshot.service";
import { getPostingEvent } from "./posting-event.service";
import {
  assertBulkDiscoveryAllowed,
  resolveRefundDiscoveryDryRun
} from "./production-guard";

export type RefundDiscoveryScanOptions = {
  orderId?: string;
  orderNumber?: string;
  refundId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  dryRun?: boolean;
  postedByUserId?: string;
};

export type RefundDiscoveryOrderResult = {
  orderId: string;
  orderNumber: string;
  refundId?: string;
  eligible: boolean;
  autoPostable: boolean;
  reason?: string;
  code?: string;
  action: "skipped" | "preview" | "posted" | "duplicate" | "failed" | "sale_required";
  duplicate?: boolean;
  journalEntryNumber?: string;
  imbalancePaise?: number;
  error?: string;
};

export type RefundDiscoveryScanResult = {
  scanned: number;
  autoPostable: number;
  posted: number;
  duplicates: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  skippedModule: boolean;
  reason?: string;
  results: RefundDiscoveryOrderResult[];
};

export async function runOrderRefundedFullDiscovery(
  opts?: RefundDiscoveryScanOptions
): Promise<RefundDiscoveryScanResult> {
  const dryRun = resolveRefundDiscoveryDryRun(opts?.dryRun);
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 500);
  const since = opts?.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const until = opts?.until ?? new Date();

  if (!isNativeAccountingEnabled()) {
    return {
      scanned: 0,
      autoPostable: 0,
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
    refundId: opts?.refundId,
    limit,
    dryRun,
    persist: !dryRun
  });

  const candidates = await findRefundDiscoveryCandidates({
    orderId: opts?.orderId,
    orderNumber: opts?.orderNumber,
    refundId: opts?.refundId,
    since:
      opts?.orderId || opts?.orderNumber || opts?.refundId ? undefined : since,
    until:
      opts?.orderId || opts?.orderNumber || opts?.refundId ? undefined : until,
    limit
  });

  const results: RefundDiscoveryOrderResult[] = [];
  let autoPostable = 0;
  let posted = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const ctx = await loadOrderRefundContextByOrderId(candidate.orderId);
      const preview = await previewOrderRefundedFull(ctx);

      if (preview.eligibility.code === "SALE_JOURNAL_REQUIRED") {
        skipped += 1;
        results.push({
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          refundId: preview.eligibility.candidateRefundId,
          eligible: true,
          autoPostable: false,
          reason: preview.eligibility.reason,
          code: preview.eligibility.code,
          action: "sale_required"
        });
        continue;
      }

      if (!preview.eligibility.autoPostable) {
        skipped += 1;
        results.push({
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          refundId: preview.eligibility.candidateRefundId,
          eligible: preview.eligibility.eligible,
          autoPostable: false,
          reason: preview.eligibility.reason,
          code: preview.eligibility.code,
          action: "skipped"
        });
        continue;
      }

      autoPostable += 1;

      if (preview.buildError) {
        failed += 1;
        results.push({
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          refundId: preview.eligibility.candidateRefundId,
          eligible: true,
          autoPostable: true,
          action: "failed",
          error: preview.buildError.message,
          code: preview.buildError.code
        });
        continue;
      }

      if (dryRun) {
        results.push({
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          refundId: preview.eligibility.candidateRefundId,
          eligible: true,
          autoPostable: true,
          action: "preview",
          imbalancePaise: preview.proposal?.imbalancePaise,
          code: preview.eligibility.code
        });
        continue;
      }

      const existing = await getPostingEvent(
        ORDER_REFUNDED_FULL_EVENT_TYPE,
        orderRefundedFullUniqueKey(ctx.orderId)
      );
      if (existing?.status === "POSTED" && existing.journalEntry) {
        duplicates += 1;
        results.push({
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          refundId: preview.eligibility.candidateRefundId,
          eligible: true,
          autoPostable: true,
          action: "duplicate",
          duplicate: true,
          journalEntryNumber: existing.journalEntry.entryNumber,
          code: preview.eligibility.code
        });
        continue;
      }

      const postResult = await postOrderRefundedFull(ctx, {
        postedByUserId: opts?.postedByUserId
      });

      if (postResult.duplicate) {
        duplicates += 1;
        results.push({
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          refundId: preview.eligibility.candidateRefundId,
          eligible: true,
          autoPostable: true,
          action: "duplicate",
          duplicate: true,
          journalEntryNumber: postResult.journal.entryNumber,
          code: preview.eligibility.code
        });
      } else {
        posted += 1;
        results.push({
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          refundId: preview.eligibility.candidateRefundId,
          eligible: true,
          autoPostable: true,
          action: "posted",
          journalEntryNumber: postResult.journal.entryNumber,
          code: preview.eligibility.code
        });
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        orderId: candidate.orderId,
        orderNumber: candidate.orderNumber,
        refundId: candidate.refundId,
        eligible: false,
        autoPostable: false,
        action: "failed",
        error: message
      });
    }
  }

  logger.info("accounting_order_refunded_full_discovery", {
    scanned: candidates.length,
    autoPostable,
    posted,
    duplicates,
    skipped,
    failed,
    dryRun
  });

  return {
    scanned: candidates.length,
    autoPostable,
    posted,
    duplicates,
    skipped,
    failed,
    dryRun,
    skippedModule: false,
    results
  };
}
