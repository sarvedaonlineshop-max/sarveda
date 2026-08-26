/**
 * Bounded Razorpay settlement discovery — GET-only import + optional post.
 */
import { logger } from "../../config/logger";

import { isNativeAccountingEnabled } from "./accounting-flag";
import {
  assertBulkDiscoveryAllowed,
  resolveSettlementDiscoveryDryRun
} from "./production-guard";
import {
  createRazorpaySettlementReadClient,
  type RazorpaySettlementReadClient
} from "./razorpay-settlement.adapter";
import {
  importRazorpaySettlementEvidence,
  postRazorpaySettlement,
  previewRazorpaySettlement
} from "./settlement-posting.service";

export type SettlementDiscoveryOptions = {
  settlementId?: string;
  limit?: number;
  dryRun?: boolean;
  from?: number;
  to?: number;
  client?: RazorpaySettlementReadClient;
  postedByUserId?: string;
};

export type SettlementDiscoveryResult = {
  scanned: number;
  imported: number;
  posted: number;
  duplicates: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  skippedModule: boolean;
  results: Array<{
    providerSettlementId: string;
    action: string;
    error?: string;
    journalEntryNumber?: string;
    duplicate?: boolean;
  }>;
};

export async function runRazorpaySettlementDiscovery(
  opts?: SettlementDiscoveryOptions
): Promise<SettlementDiscoveryResult> {
  const dryRun = resolveSettlementDiscoveryDryRun(opts?.dryRun);
  const limit = Math.min(Math.max(opts?.limit ?? 5, 1), 50);
  const client = opts?.client ?? createRazorpaySettlementReadClient();

  if (!isNativeAccountingEnabled()) {
    return {
      scanned: 0,
      imported: 0,
      posted: 0,
      duplicates: 0,
      skipped: 0,
      failed: 0,
      dryRun,
      skippedModule: true,
      results: []
    };
  }

  assertBulkDiscoveryAllowed({
    settlementId: opts?.settlementId,
    limit,
    dryRun,
    persist: !dryRun
  });

  let ids: string[] = [];
  if (opts?.settlementId?.trim()) {
    ids = [opts.settlementId.trim()];
  } else {
    const list = await client.listSettlements({
      from: opts?.from,
      to: opts?.to,
      count: limit,
      skip: 0
    });
    ids = list.map((s) => s.id).slice(0, limit);
  }

  const results: SettlementDiscoveryResult["results"] = [];
  let imported = 0;
  let posted = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      if (dryRun) {
        const preview = await previewRazorpaySettlement(id, {
          client,
          persistEvidence: true
        });
        imported += 1;
        results.push({
          providerSettlementId: id,
          action: preview.proposal?.balanced ? "preview" : "preview_unbalanced"
        });
        continue;
      }

      await importRazorpaySettlementEvidence(id, client);
      imported += 1;
      const post = await postRazorpaySettlement(id, {
        client,
        postedByUserId: opts?.postedByUserId
      });
      if (post.duplicate) {
        duplicates += 1;
        results.push({
          providerSettlementId: id,
          action: "duplicate",
          duplicate: true,
          journalEntryNumber: post.journal.entryNumber
        });
      } else {
        posted += 1;
        results.push({
          providerSettlementId: id,
          action: "posted",
          journalEntryNumber: post.journal.entryNumber
        });
      }
    } catch (err) {
      failed += 1;
      skipped += 1;
      results.push({
        providerSettlementId: id,
        action: "failed",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const out = {
    scanned: ids.length,
    imported,
    posted,
    duplicates,
    skipped,
    failed,
    dryRun,
    skippedModule: false,
    results
  };
  logger.info("accounting_razorpay_settlement_discovery", {
    dryRun: out.dryRun,
    scanned: out.scanned,
    posted: out.posted,
    duplicates: out.duplicates,
    failed: out.failed
  });
  return out;
}
