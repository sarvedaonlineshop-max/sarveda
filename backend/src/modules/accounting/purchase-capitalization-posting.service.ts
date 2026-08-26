import { prisma } from "../../config/db";

import { AccountingError } from "./accounting-errors";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import { getAccountingAccountByCode } from "./seed-coa";
import {
  INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE,
  INVENTORY_PURCHASE_CAPITALIZED_SOURCE_TYPE
} from "./purchase-capitalization.constants";
import {
  assessPurchaseCapitalizationEligibility,
  loadReceiptLineCapitalizationOrThrow,
  previewReceiptLineCapitalization
} from "./purchase-capitalization-eligibility";
import { buildInventoryPurchaseCapitalizationJournal } from "./purchase-capitalization-journal.builder";
import { postJournalFromEvent } from "./posting-event.service";
import { assertPurchaseCapitalizationPersistenceAllowed } from "./production-guard";

async function resolveAccountIds(codes: string[]) {
  const unique = [...new Set(codes)];
  const accounts = await Promise.all(unique.map((code) => getAccountingAccountByCode(code)));
  const map = new Map<string, string>();
  for (let i = 0; i < unique.length; i++) {
    const acc = accounts[i];
    if (!acc) throw new AccountingError(`Account ${unique[i]} not found`, "ACCOUNT_NOT_FOUND");
    map.set(unique[i]!, acc.id);
  }
  return map;
}

export async function previewPurchaseCapitalization(receiptLineId: string) {
  const { snapshot, eligibility } = await previewReceiptLineCapitalization(receiptLineId);
  const proposal = snapshot ? buildInventoryPurchaseCapitalizationJournal(snapshot) : null;
  return { snapshot, eligibility, proposal };
}

export async function postPurchaseCapitalization(
  receiptLineId: string,
  opts?: { postedByUserId?: string; forcePersist?: boolean }
) {
  if (!opts?.forcePersist) {
    assertPurchaseCapitalizationPersistenceAllowed();
  }

  const snapshot = await loadReceiptLineCapitalizationOrThrow(receiptLineId);
  const eligibility = await assessPurchaseCapitalizationEligibility(snapshot);

  if (!eligibility.eligible && eligibility.code === "ALREADY_POSTED") {
    const { getPostingEvent } = await import("./posting-event.service");
    const { INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE, inventoryPurchaseCapitalizedUniqueKey } =
      await import("./purchase-capitalization.constants");
    const uniqueKey = inventoryPurchaseCapitalizedUniqueKey(snapshot.receiptId, snapshot.receiptLineId);
    const event = await getPostingEvent(INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE, uniqueKey);
    const journal = event?.journalEntryId
      ? await prisma.accountingJournalEntry.findUniqueOrThrow({
          where: { id: event.journalEntryId },
          include: { lines: true }
        })
      : null;
    const proposal = buildInventoryPurchaseCapitalizationJournal(snapshot);
    return {
      snapshot,
      proposal,
      journal: journal!,
      duplicate: true as const,
      eligibility
    };
  }

  if (!eligibility.eligible) {
    throw new AccountingError(eligibility.reason, eligibility.code, 409);
  }

  const proposal = buildInventoryPurchaseCapitalizationJournal(snapshot);
  if (!proposal.balanced) {
    throw new AccountingError(
      `Capitalization journal imbalanced by ${proposal.imbalancePaise} paise`,
      "JOURNAL_IMBALANCE",
      409
    );
  }

  assertDocumentDateAllowedForPosting(snapshot.receiptDate);
  await assertEntryDateInOpenPeriod(snapshot.receiptDate);

  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));

  const payloadJson = {
    ...proposal.reconciliationMetadata,
    quantityReceived: snapshot.quantityReceived,
    unitCostInPaise: snapshot.netUnitCostInPaise,
    capitalizationValueInPaise: proposal.capitalizationValueInPaise,
    billSourceFingerprint: snapshot.billSourceFingerprint,
    calcVersion: proposal.calcVersion
  };

  const result = await postJournalFromEvent({
    eventType: INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE,
    sourceType: INVENTORY_PURCHASE_CAPITALIZED_SOURCE_TYPE,
    sourceId: snapshot.receiptLineId,
    uniqueKey: proposal.uniqueKey,
    payloadJson,
    entryDate: snapshot.receiptDate,
    memo: proposal.memo,
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
    await prisma.$transaction(async (tx) => {
      await tx.accountingInventoryCostLayer.create({
        data: {
          variantId: proposal.layerProposal.variantId,
          sourceType: "PURCHASE_RECEIPT",
          sourceId: snapshot.receiptId,
          sourceLineId: snapshot.receiptLineId,
          quantityOriginal: proposal.layerProposal.quantityOriginal,
          quantityRemaining: proposal.layerProposal.quantityRemaining,
          unitCostInPaise: proposal.layerProposal.unitCostInPaise,
          totalCostInPaise: proposal.layerProposal.totalCostInPaise,
          effectiveAt: proposal.layerProposal.effectiveAt,
          sourceFingerprint: proposal.layerProposal.sourceFingerprint,
          status: "ACTIVE"
        }
      });

      await tx.accountingDocumentLink.create({
        data: {
          documentType: "PURCHASE_RECEIPT",
          documentId: snapshot.receiptId,
          journalEntryId: result.journal.id
        }
      });
    });
  }

  return {
    snapshot,
    proposal,
    journal: result.journal,
    duplicate: result.duplicate,
    eligibility
  };
}
