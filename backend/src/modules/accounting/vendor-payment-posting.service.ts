import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  VendorPaymentJournalImbalanceError,
  VendorPaymentNotEligibleError
} from "./accounting-errors";
import { getAccountingAccountByCode } from "./seed-coa";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertVendorPaymentPostingPersistenceAllowed } from "./production-guard";
import { buildVendorPaymentMadeJournal } from "./vendor-payment-journal.builder";
import {
  VENDOR_BILL_DOCUMENT_TYPE,
  VENDOR_PAYMENT_DOCUMENT_TYPE,
  VENDOR_PAYMENT_MADE_EVENT_TYPE,
  VENDOR_PAYMENT_MADE_SOURCE_TYPE,
  vendorPaymentMadeUniqueKey
} from "./vendor-payment.constants";
import {
  loadVendorPaymentSnapshot,
  validatePaymentDraftInput
} from "./vendor-payment.service";
import type { VendorPaymentJournalProposal, VendorPaymentSnapshot } from "./vendor-payment.types";

export type VendorPaymentPreviewResult = {
  snapshot: VendorPaymentSnapshot;
  proposal: VendorPaymentJournalProposal | null;
  buildError?: { message: string; code: string };
  postingEvent: Awaited<ReturnType<typeof getPostingEvent>>;
  sourceChangedAfterPost: boolean;
};

export async function previewVendorPayment(
  paymentId: string
): Promise<VendorPaymentPreviewResult> {
  const snapshot = await loadVendorPaymentSnapshot(paymentId);
  const postingEvent = await getPostingEvent(
    VENDOR_PAYMENT_MADE_EVENT_TYPE,
    vendorPaymentMadeUniqueKey(paymentId)
  );

  let sourceChangedAfterPost = false;
  if (postingEvent?.status === "POSTED" && postingEvent.payloadJson) {
    const payload = postingEvent.payloadJson as Record<string, unknown>;
    const meta = (payload.reconciliationMetadata ?? {}) as Record<string, unknown>;
    const prior = typeof meta.sourceFingerprint === "string" ? meta.sourceFingerprint : null;
    if (prior && prior !== snapshot.sourcePayloadHash) {
      sourceChangedAfterPost = true;
    }
  }

  try {
    if (snapshot.status === "DRAFT") {
      await validatePaymentDraftInput({
        vendorId: snapshot.vendorId,
        paymentDate: snapshot.paymentDate,
        amountInPaise: snapshot.amountInPaise,
        currency: snapshot.currency,
        paymentMethod: snapshot.paymentMethod,
        utr: snapshot.utr,
        allocations: snapshot.allocations.map((a) => ({
          vendorBillId: a.vendorBillId,
          amountInPaise: a.amountInPaise
        })),
        excludePaymentId: paymentId
      });
    }
    const proposal = buildVendorPaymentMadeJournal(snapshot, { failOnImbalance: false });
    return { snapshot, proposal, postingEvent, sourceChangedAfterPost };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof VendorPaymentNotEligibleError
        ? err.code
        : err instanceof VendorPaymentJournalImbalanceError
          ? err.code
          : "VENDOR_PAYMENT_BUILD_FAILED";
    return {
      snapshot,
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
      throw new VendorPaymentNotEligibleError(`Missing CoA: ${code}`, "MISSING_ACCOUNT");
    }
    map.set(code, acct.id);
  }
  return map;
}

export type PostVendorPaymentResult = {
  duplicate: boolean;
  proposal: VendorPaymentJournalProposal;
  event: Awaited<ReturnType<typeof postJournalFromEvent>>["event"];
  journal: Awaited<ReturnType<typeof postJournalFromEvent>>["journal"];
};

export async function postVendorPayment(
  paymentId: string,
  opts?: { postedByUserId?: string; forcePersist?: boolean; allowPreCutover?: boolean }
): Promise<PostVendorPaymentResult> {
  if (!opts?.forcePersist) {
    assertVendorPaymentPostingPersistenceAllowed();
  }

  const snapshot = await loadVendorPaymentSnapshot(paymentId);
  const { assertDocumentDateAllowedForPosting } = await import("./accounting-cutover");
  assertDocumentDateAllowedForPosting(snapshot.paymentDate, {
    allowPreCutover: opts?.allowPreCutover
  });
  if (snapshot.status === "VOID") {
    throw new VendorPaymentNotEligibleError("VOID payment cannot be posted", "PAYMENT_VOID");
  }

  // Re-validate allocations against current outstanding (exclude self if already posted → duplicate path)
  if (snapshot.status === "DRAFT") {
    await validatePaymentDraftInput({
      vendorId: snapshot.vendorId,
      paymentDate: snapshot.paymentDate,
      amountInPaise: snapshot.amountInPaise,
      currency: snapshot.currency,
      paymentMethod: snapshot.paymentMethod,
      utr: snapshot.utr,
      allocations: snapshot.allocations.map((a) => ({
        vendorBillId: a.vendorBillId,
        amountInPaise: a.amountInPaise
      })),
      excludePaymentId: paymentId
    });
  }

  const proposal = buildVendorPaymentMadeJournal(snapshot, { failOnImbalance: true });
  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const uniqueKey = vendorPaymentMadeUniqueKey(paymentId);

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    paymentNumber: snapshot.paymentNumber,
    diagnostics: proposal.diagnostics,
    reconciliationMetadata: proposal.reconciliationMetadata
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: VENDOR_PAYMENT_MADE_EVENT_TYPE,
    sourceType: VENDOR_PAYMENT_MADE_SOURCE_TYPE,
    sourceId: paymentId,
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
    await prisma.accountingVendorPayment.update({
      where: { id: paymentId },
      data: {
        status: "POSTED",
        postingEventId: result.event.id,
        journalEntryId: result.journal.id,
        lastError: null
      }
    });

    await prisma.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: VENDOR_PAYMENT_DOCUMENT_TYPE,
          documentId: paymentId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: VENDOR_PAYMENT_DOCUMENT_TYPE,
        documentId: paymentId,
        journalEntryId: result.journal.id
      },
      update: {}
    });

    for (const a of snapshot.allocations) {
      await prisma.accountingDocumentLink.upsert({
        where: {
          documentType_documentId_journalEntryId: {
            documentType: VENDOR_BILL_DOCUMENT_TYPE,
            documentId: a.vendorBillId,
            journalEntryId: result.journal.id
          }
        },
        create: {
          documentType: VENDOR_BILL_DOCUMENT_TYPE,
          documentId: a.vendorBillId,
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
