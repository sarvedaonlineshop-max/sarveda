import { logger } from "../../config/logger";

import { isAccountingPurchasesPostingEnabled, isNativeAccountingEnabled } from "./accounting-flag";
import {
  assertBulkDiscoveryAllowed,
  resolvePurchasesDiscoveryDryRun
} from "./production-guard";
import {
  postVendorBillPostedJournal,
  previewVendorBillPostedJournal
} from "./vendor-bill-posting.service";
import {
  findVendorBillDiscoveryCandidates,
  loadVendorBillSnapshotById
} from "./vendor-bill-snapshot.service";
import { normalizeSupplierReference } from "./vendor-bill.constants";
import { prisma } from "../../config/db";

export type VendorBillDiscoveryInput = {
  billId?: string;
  billNumber?: string;
  vendorId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  dryRun?: boolean;
  postedByUserId?: string;
};

export type VendorBillDiscoveryRow = {
  billId: string;
  billNumber: string;
  status: string;
  eligible: boolean;
  code: string;
  posted: boolean;
  duplicate?: boolean;
  journalEntryNumber?: string;
  warnings: string[];
  duplicateSupplierReference?: boolean;
  error?: string;
};

export async function findDuplicateSupplierReferences(
  vendorId: string,
  referenceNumber: string | null,
  excludeBillId: string
): Promise<boolean> {
  const norm = normalizeSupplierReference(referenceNumber);
  if (!norm) return false;
  const peers = await prisma.vendorBill.findMany({
    where: {
      vendorId,
      id: { not: excludeBillId },
      referenceNumber: { not: null },
      status: { not: "VOID" }
    },
    select: { id: true, referenceNumber: true }
  });
  return peers.some((p) => normalizeSupplierReference(p.referenceNumber) === norm);
}

/**
 * Bounded VendorBill discovery — default dryRun=true.
 * Max 500. Deterministic order: billDate, createdAt, id.
 */
export async function runVendorBillDiscovery(
  input: VendorBillDiscoveryInput
): Promise<{
  dryRun: boolean;
  scanned: number;
  rows: VendorBillDiscoveryRow[];
}> {
  if (!isNativeAccountingEnabled()) {
    return { dryRun: true, scanned: 0, rows: [] };
  }

  const limit = Math.min(500, Math.max(1, input.limit ?? 50));
  const dryRun = resolvePurchasesDiscoveryDryRun(input.dryRun);

  assertBulkDiscoveryAllowed({
    orderId: undefined,
    orderNumber: undefined,
    refundId: undefined,
    settlementId: undefined,
    billId: input.billId,
    billNumber: input.billNumber,
    limit,
    dryRun,
    persist: !dryRun && isAccountingPurchasesPostingEnabled()
  });

  const candidates = await findVendorBillDiscoveryCandidates({
    billId: input.billId,
    billNumber: input.billNumber,
    vendorId: input.vendorId,
    since: input.since,
    until: input.until,
    limit
  });

  const rows: VendorBillDiscoveryRow[] = [];

  for (const c of candidates) {
    try {
      const snapshot = await loadVendorBillSnapshotById(c.id);
      const dupRef = await findDuplicateSupplierReferences(
        snapshot.vendorId,
        snapshot.referenceNumber,
        snapshot.billId
      );
      const preview = await previewVendorBillPostedJournal(snapshot);
      const warnings = [
        ...preview.eligibility.warnings,
        ...(preview.proposal?.diagnostics.warnings ?? []),
        ...(dupRef ? ["DUPLICATE_SUPPLIER_REFERENCE"] : []),
        ...(preview.sourceChangedAfterPost
          ? ["SOURCE_CHANGED_AFTER_POST", "REVERSAL_REQUIRED"]
          : [])
      ];

      // Ambiguous duplicate financials: same vendor+ref and both OPEN with similar totals → block auto-post
      let blockAutoPost = false;
      if (dupRef && preview.eligibility.eligible && !dryRun) {
        const norm = normalizeSupplierReference(snapshot.referenceNumber);
        const peers = await prisma.vendorBill.findMany({
          where: {
            vendorId: snapshot.vendorId,
            id: { not: snapshot.billId },
            status: { in: ["OPEN", "PAID"] },
            referenceNumber: { not: null }
          },
          select: { id: true, referenceNumber: true, totalInPaise: true }
        });
        const conflict = peers.find(
          (p) =>
            normalizeSupplierReference(p.referenceNumber) === norm &&
            Math.abs(p.totalInPaise - snapshot.totalInPaise) <= 2
        );
        if (conflict) {
          blockAutoPost = true;
          warnings.push("DUPLICATE_SUPPLIER_REFERENCE_AMBIGUOUS");
        }
      }

      if (
        !dryRun &&
        preview.eligibility.eligible &&
        !blockAutoPost &&
        isAccountingPurchasesPostingEnabled()
      ) {
        const post = await postVendorBillPostedJournal(snapshot, {
          postedByUserId: input.postedByUserId
        });
        rows.push({
          billId: snapshot.billId,
          billNumber: snapshot.billNumber,
          status: snapshot.status,
          eligible: true,
          code: "POSTED",
          posted: true,
          duplicate: post.duplicate,
          journalEntryNumber: post.journal.entryNumber,
          warnings: [...new Set(warnings)],
          duplicateSupplierReference: dupRef
        });
      } else {
        rows.push({
          billId: snapshot.billId,
          billNumber: snapshot.billNumber,
          status: snapshot.status,
          eligible: preview.eligibility.eligible && !blockAutoPost,
          code: blockAutoPost
            ? "DUPLICATE_SUPPLIER_REFERENCE"
            : preview.buildError?.code ?? preview.eligibility.code,
          posted: preview.postingEvent?.status === "POSTED",
          journalEntryNumber: undefined,
          warnings: [...new Set(warnings)],
          duplicateSupplierReference: dupRef,
          error: preview.buildError?.message
        });
      }
    } catch (err) {
      rows.push({
        billId: c.id,
        billNumber: c.billNumber,
        status: c.status,
        eligible: false,
        code: "ERROR",
        posted: false,
        warnings: [],
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  logger.info("accounting_vendor_bill_discovery", {
    dryRun,
    scanned: candidates.length,
    posted: rows.filter((r) => r.posted && r.code === "POSTED").length
  });

  return { dryRun, scanned: candidates.length, rows };
}
