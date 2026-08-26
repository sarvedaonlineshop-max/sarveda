import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  VendorBillJournalImbalanceError,
  VendorBillNotEligibleForPostingError
} from "./accounting-errors";
import { evaluateVendorBillEligibility, isVendorBillEligibleForPosting } from "./vendor-bill-eligibility";
import { buildVendorBillPostedJournal } from "./vendor-bill-journal.builder";
import type { VendorBillJournalProposal, VendorBillSnapshot } from "./vendor-bill.types";
import {
  PURCHASE_ORDER_DOCUMENT_TYPE,
  VENDOR_BILL_DOCUMENT_TYPE,
  VENDOR_BILL_POSTED_EVENT_TYPE,
  VENDOR_BILL_POSTED_SOURCE_TYPE,
  vendorBillPostedUniqueKey
} from "./vendor-bill.constants";
import { getAccountingAccountByCode } from "./seed-coa";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertPurchasesPostingPersistenceAllowed } from "./production-guard";
import { loadVendorBillSnapshot } from "./vendor-bill-snapshot.service";

export type VendorBillPreviewResult = {
  snapshot: VendorBillSnapshot;
  eligibility: Awaited<ReturnType<typeof evaluateVendorBillEligibility>>;
  proposal: VendorBillJournalProposal | null;
  buildError?: { message: string; code: string };
  postingEvent: Awaited<ReturnType<typeof getPostingEvent>>;
  sourceChangedAfterPost: boolean;
};

export async function previewVendorBillPostedJournal(
  snapshot: VendorBillSnapshot
): Promise<VendorBillPreviewResult> {
  const eligibility = await evaluateVendorBillEligibility(snapshot);
  const uniqueKey = vendorBillPostedUniqueKey(snapshot.billId);
  const postingEvent = await getPostingEvent(VENDOR_BILL_POSTED_EVENT_TYPE, uniqueKey);

  let sourceChangedAfterPost = false;
  if (postingEvent?.status === "POSTED" && postingEvent.payloadJson) {
    const payload = postingEvent.payloadJson as Record<string, unknown>;
    const meta = (payload.reconciliationMetadata ?? {}) as Record<string, unknown>;
    const priorFp = typeof meta.sourceFingerprint === "string" ? meta.sourceFingerprint : null;
    if (priorFp && priorFp !== snapshot.sourceFingerprint) {
      sourceChangedAfterPost = true;
    }
  }

  if (!eligibility.eligible && eligibility.code !== "ALREADY_POSTED") {
    return { snapshot, eligibility, proposal: null, postingEvent, sourceChangedAfterPost };
  }

  try {
    const proposal = buildVendorBillPostedJournal(snapshot, {
      failOnImbalance: false,
      failOnGstDataGap: false
    });
    // If GST gap with tax, surface as build error for clarity on auto-post path
    if (
      snapshot.taxInPaise > 0 &&
      !proposal.diagnostics.gst.gstRecognized &&
      eligibility.eligible
    ) {
      return {
        snapshot,
        eligibility: {
          ...eligibility,
          eligible: false,
          code: "GST_DATA_GAP",
          reason: "Tax present but provisional Input GST evidence insufficient",
          warnings: [
            ...eligibility.warnings,
            ...proposal.diagnostics.warnings,
            "GST_DATA_GAP"
          ]
        },
        proposal,
        buildError: {
          message: "GST_DATA_GAP — fail closed until GSTIN/state/reference/jurisdiction evidence exists",
          code: "GST_DATA_GAP"
        },
        postingEvent,
        sourceChangedAfterPost
      };
    }
    return { snapshot, eligibility, proposal, postingEvent, sourceChangedAfterPost };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof VendorBillJournalImbalanceError ? err.code : "VENDOR_BILL_BUILD_FAILED";
    return {
      snapshot,
      eligibility,
      proposal: null,
      buildError: { message, code },
      postingEvent,
      sourceChangedAfterPost
    };
  }
}

async function resolveAccountIds(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const code of [...new Set(codes)]) {
    const acct = await getAccountingAccountByCode(code);
    if (!acct) {
      throw new VendorBillNotEligibleForPostingError(
        `Missing chart of accounts entry: ${code}`,
        "MISSING_ACCOUNT"
      );
    }
    map.set(code, acct.id);
  }
  return map;
}

export type PostVendorBillResult = {
  duplicate: boolean;
  proposal: VendorBillJournalProposal;
  event: Awaited<ReturnType<typeof postJournalFromEvent>>["event"];
  journal: Awaited<ReturnType<typeof postJournalFromEvent>>["journal"];
};

export async function postVendorBillPostedJournal(
  snapshot: VendorBillSnapshot,
  opts?: { postedByUserId?: string; forcePersist?: boolean; allowPreCutover?: boolean }
): Promise<PostVendorBillResult> {
  if (!opts?.forcePersist) {
    assertPurchasesPostingPersistenceAllowed();
  }

  const { assertDocumentDateAllowedForPosting } = await import("./accounting-cutover");
  assertDocumentDateAllowedForPosting(snapshot.billDate, {
    allowPreCutover: opts?.allowPreCutover
  });

  // Eligibility ignores ALREADY_POSTED — postJournalFromEvent returns duplicate idempotently.
  const eligibility = isVendorBillEligibleForPosting(snapshot);
  if (!eligibility.eligible) {
    throw new VendorBillNotEligibleForPostingError(
      eligibility.reason ?? "Not eligible",
      eligibility.code
    );
  }

  const proposal = buildVendorBillPostedJournal(snapshot, {
    failOnImbalance: true,
    failOnGstDataGap: true
  });
  if (!proposal.balanced) {
    throw new VendorBillJournalImbalanceError(
      proposal.totalDebitPaise,
      proposal.totalCreditPaise,
      proposal.imbalancePaise
    );
  }

  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const uniqueKey = vendorBillPostedUniqueKey(snapshot.billId);

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    billNumber: snapshot.billNumber,
    diagnostics: proposal.diagnostics,
    reconciliationMetadata: proposal.reconciliationMetadata
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: VENDOR_BILL_POSTED_EVENT_TYPE,
    sourceType: VENDOR_BILL_POSTED_SOURCE_TYPE,
    sourceId: snapshot.billId,
    uniqueKey,
    payloadJson,
    entryDate: proposal.accountingDate,
    memo: proposal.memo,
    currency: proposal.currency,
    postedByUserId: opts?.postedByUserId,
    lines: proposal.lines.map((line, index) => ({
      accountId: accountIds.get(line.accountCode)!,
      debitInPaise: line.debitInPaise,
      creditInPaise: line.creditInPaise,
      lineMemo: line.lineMemo,
      sortOrder: index
    }))
  });

  if (!result.duplicate) {
    await prisma.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: VENDOR_BILL_DOCUMENT_TYPE,
          documentId: snapshot.billId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: VENDOR_BILL_DOCUMENT_TYPE,
        documentId: snapshot.billId,
        journalEntryId: result.journal.id
      },
      update: {}
    });

    if (snapshot.purchaseOrderId) {
      await prisma.accountingDocumentLink.upsert({
        where: {
          documentType_documentId_journalEntryId: {
            documentType: PURCHASE_ORDER_DOCUMENT_TYPE,
            documentId: snapshot.purchaseOrderId,
            journalEntryId: result.journal.id
          }
        },
        create: {
          documentType: PURCHASE_ORDER_DOCUMENT_TYPE,
          documentId: snapshot.purchaseOrderId,
          journalEntryId: result.journal.id
        },
        update: {}
      });
    }
  }

  return {
    duplicate: result.duplicate,
    proposal,
    event: result.event,
    journal: result.journal
  };
}

export async function previewVendorBillByIdentifier(identifier: {
  billId?: string;
  billNumber?: string;
}): Promise<VendorBillPreviewResult> {
  const snapshot = await loadVendorBillSnapshot(identifier);
  return previewVendorBillPostedJournal(snapshot);
}

export async function postVendorBillByIdentifier(
  identifier: { billId?: string; billNumber?: string },
  opts?: { postedByUserId?: string; forcePersist?: boolean }
): Promise<PostVendorBillResult> {
  const snapshot = await loadVendorBillSnapshot(identifier);
  return postVendorBillPostedJournal(snapshot, opts);
}
