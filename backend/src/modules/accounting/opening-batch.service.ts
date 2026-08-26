/**
 * Phase 7B — production opening batch lifecycle (stage → validate → post).
 */
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import { isAccountingOpeningBalanceEnabled, isNativeAccountingEnabled } from "./accounting-flag";
import {
  PRODUCTION_OPENING_DOCUMENT_TYPE,
  PRODUCTION_OPENING_EVENT_TYPE,
  PRODUCTION_OPENING_SOURCE_TYPE,
  productionOpeningUniqueKey
} from "./opening.constants";
import {
  buildOpeningProposal,
  isBatchMutable,
  loadOpeningBatchGraph,
  validateOpeningBatch
} from "./opening-validation.service";
import { createAndPostJournalInTx } from "./journal.service";
import { getAccountingAccountByCode } from "./seed-coa";
import { getPostingEvent } from "./posting-event.service";
import { assertProductionOpeningPersistenceAllowed } from "./production-guard";
import { assertPostingEventTransition } from "./posting-event-state";

function yyyymm(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

async function nextOpeningBatchNumber(effectiveDate: Date): Promise<string> {
  const prefix = `OPEN-${yyyymm(effectiveDate)}-`;
  const last = await prisma.accountingOpeningBatch.findFirst({
    where: { batchNumber: { startsWith: prefix } },
    orderBy: { batchNumber: "desc" },
    select: { batchNumber: true }
  });
  const seq = last ? Number(last.batchNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

export async function createOpeningBatch(input: {
  effectiveDate: string;
  description?: string;
  source?: string;
  createdByUserId?: string;
  arApprovedZero?: boolean;
}) {
  if (!isAccountingOpeningBalanceEnabled()) {
    throw new Error("ACCOUNTING_OPENING_BALANCE_ENABLED is off");
  }
  const effectiveDate = new Date(`${input.effectiveDate}T00:00:00.000Z`);
  const posted = await prisma.accountingOpeningBatch.findFirst({
    where: { status: "POSTED" }
  });
  if (posted) {
    throw new Error(`A POSTED opening batch already exists: ${posted.batchNumber}`);
  }
  const batchNumber = await nextOpeningBatchNumber(effectiveDate);
  return prisma.accountingOpeningBatch.create({
    data: {
      batchNumber,
      effectiveDate,
      description: input.description ?? null,
      source: input.source ?? "MANUAL",
      createdByUserId: input.createdByUserId ?? null,
      arApprovedZero: input.arApprovedZero ?? false,
      status: "DRAFT"
    }
  });
}

export async function getOpeningBatch(batchId: string) {
  return loadOpeningBatchGraph(batchId);
}

export async function listOpeningBatches(limit = 25) {
  return prisma.accountingOpeningBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, limit))
  });
}

export async function replaceOpeningStaging(
  batchId: string,
  staging: {
    skuMappings?: Array<{
      newSarvedaSku: string;
      legacySku?: string | null;
      productName?: string | null;
      variantLabel?: string | null;
      matchStatus: "EXACT" | "MANUAL_MATCH" | "NEW_SKU" | "LEGACY_ONLY" | "UNKNOWN";
      openingQty: number;
      unitCostInPaise: number;
      source?: string | null;
      reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
      notes?: string | null;
    }>;
    inventoryLines?: Array<{
      sku: string;
      quantity: number;
      unitCostInPaise: number;
      source?: string | null;
      reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
    }>;
    bankLines?: Array<{
      name: string;
      bankName?: string | null;
      maskedAccountNumber?: string | null;
      ifsc?: string | null;
      accountType?: string;
      glAccountCode: string;
      openingBookBalanceInPaise: number;
      statementBalanceInPaise?: number | null;
      source?: string | null;
      reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
    }>;
    gatewayLines?: Array<{
      provider: string;
      glAccountCode: string;
      unsettledAmountInPaise: number;
      direction?: string;
      sourceReference?: string | null;
      reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
    }>;
    apLines?: Array<{
      vendorName: string;
      vendorId?: string | null;
      billNumber: string;
      billDate?: string | null;
      dueDate?: string | null;
      outstandingInPaise: number;
      gstComponentInPaise?: number;
      tdsInPaise?: number;
      currency?: string;
      reference?: string | null;
      source?: string | null;
      reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
    }>;
    arLines?: Array<{
      customerName: string;
      customerId?: string | null;
      invoiceReference: string;
      invoiceDate?: string | null;
      dueDate?: string | null;
      outstandingInPaise: number;
      currency?: string;
      source?: string | null;
      reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
    }>;
    gstLines?: Array<{
      accountCode: string;
      balanceInPaise: number;
      source?: string | null;
      reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
    }>;
    equityLines?: Array<{
      accountCode: string;
      amountInPaise: number;
      reason?: string | null;
      reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
    }>;
    arApprovedZero?: boolean;
    equity3900Reason?: string | null;
    equity3900Reviewer?: string | null;
    equity3900Approved?: boolean;
  }
) {
  const batch = await prisma.accountingOpeningBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("Opening batch not found");
  if (!isBatchMutable(batch)) throw new Error(`Batch status ${batch.status} is not mutable`);

  // Resolve inventory variants + ops onHand
  const invRows = staging.inventoryLines ?? [];
  const resolvedInv: Array<{
    sku: string;
    variantId: string | null;
    quantity: number;
    unitCostInPaise: number;
    totalCostInPaise: number;
    operationalOnHand: number;
    quantityMismatch: boolean;
    source: string | null;
    reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
    sortOrder: number;
  }> = [];
  for (let i = 0; i < invRows.length; i++) {
    const row = invRows[i]!;
    const variant = await prisma.productVariant.findUnique({
      where: { sku: row.sku },
      include: { inventory: true }
    });
    const onHand = variant?.inventory?.onHand ?? 0;
    const qty = row.quantity;
    resolvedInv.push({
      sku: row.sku,
      variantId: variant?.id ?? null,
      quantity: qty,
      unitCostInPaise: row.unitCostInPaise,
      totalCostInPaise: qty * row.unitCostInPaise,
      operationalOnHand: onHand,
      quantityMismatch: variant ? onHand !== qty : true,
      source: row.source ?? null,
      reviewStatus: row.reviewStatus ?? "PENDING",
      sortOrder: i
    });
  }

  const skuRows = staging.skuMappings ?? [];
  const resolvedSku: Array<{
    newSarvedaSku: string;
    legacySku: string | null;
    productName: string | null;
    variantLabel: string | null;
    matchStatus: "EXACT" | "MANUAL_MATCH" | "NEW_SKU" | "LEGACY_ONLY" | "UNKNOWN";
    openingQty: number;
    unitCostInPaise: number;
    source: string | null;
    reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
    variantId: string | null;
    notes: string | null;
    sortOrder: number;
  }> = [];
  for (let i = 0; i < skuRows.length; i++) {
    const m = skuRows[i]!;
    const variant = await prisma.productVariant.findUnique({ where: { sku: m.newSarvedaSku } });
    resolvedSku.push({
      newSarvedaSku: m.newSarvedaSku,
      legacySku: m.legacySku ?? null,
      productName: m.productName ?? null,
      variantLabel: m.variantLabel ?? null,
      matchStatus: m.matchStatus,
      openingQty: m.openingQty,
      unitCostInPaise: m.unitCostInPaise,
      source: m.source ?? null,
      reviewStatus: m.reviewStatus ?? "PENDING",
      variantId: variant?.id ?? null,
      notes: m.notes ?? null,
      sortOrder: i
    });
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(staging))
    .digest("hex");

  await prisma.$transaction(async (tx) => {
    await tx.accountingOpeningSkuMapping.deleteMany({ where: { batchId } });
    await tx.accountingOpeningInventoryLine.deleteMany({ where: { batchId } });
    await tx.accountingOpeningBankLine.deleteMany({ where: { batchId } });
    await tx.accountingOpeningGatewayLine.deleteMany({ where: { batchId } });
    await tx.accountingOpeningApLine.deleteMany({ where: { batchId } });
    await tx.accountingOpeningArLine.deleteMany({ where: { batchId } });
    await tx.accountingOpeningGstLine.deleteMany({ where: { batchId } });
    await tx.accountingOpeningEquityLine.deleteMany({ where: { batchId } });

    if (resolvedSku.length) {
      await tx.accountingOpeningSkuMapping.createMany({
        data: resolvedSku.map((r) => ({ ...r, batchId }))
      });
    }
    if (resolvedInv.length) {
      await tx.accountingOpeningInventoryLine.createMany({
        data: resolvedInv.map((r) => ({ ...r, batchId }))
      });
    }
    if (staging.bankLines?.length) {
      await tx.accountingOpeningBankLine.createMany({
        data: staging.bankLines.map((b, i) => ({
          batchId,
          name: b.name,
          bankName: b.bankName ?? null,
          maskedAccountNumber: b.maskedAccountNumber ?? null,
          ifsc: b.ifsc ?? null,
          accountType: b.accountType ?? "BANK",
          glAccountCode: b.glAccountCode,
          openingBookBalanceInPaise: b.openingBookBalanceInPaise,
          statementBalanceInPaise: b.statementBalanceInPaise ?? null,
          source: b.source ?? null,
          reviewStatus: b.reviewStatus ?? "PENDING",
          sortOrder: i
        }))
      });
    }
    if (staging.gatewayLines?.length) {
      await tx.accountingOpeningGatewayLine.createMany({
        data: staging.gatewayLines.map((g, i) => ({
          batchId,
          provider: g.provider,
          glAccountCode: g.glAccountCode,
          unsettledAmountInPaise: g.unsettledAmountInPaise,
          direction: g.direction ?? "ASSET",
          sourceReference: g.sourceReference ?? null,
          reviewStatus: g.reviewStatus ?? "PENDING",
          sortOrder: i
        }))
      });
    }
    if (staging.apLines?.length) {
      await tx.accountingOpeningApLine.createMany({
        data: staging.apLines.map((a, i) => ({
          batchId,
          vendorName: a.vendorName,
          vendorId: a.vendorId ?? null,
          billNumber: a.billNumber,
          billDate: a.billDate ? new Date(`${a.billDate}T00:00:00.000Z`) : null,
          dueDate: a.dueDate ? new Date(`${a.dueDate}T00:00:00.000Z`) : null,
          outstandingInPaise: a.outstandingInPaise,
          gstComponentInPaise: a.gstComponentInPaise ?? 0,
          tdsInPaise: a.tdsInPaise ?? 0,
          currency: a.currency ?? "INR",
          reference: a.reference ?? null,
          source: a.source ?? null,
          reviewStatus: a.reviewStatus ?? "PENDING",
          remainingOutstandingInPaise: a.outstandingInPaise,
          sortOrder: i
        }))
      });
    }
    if (staging.arLines?.length) {
      await tx.accountingOpeningArLine.createMany({
        data: staging.arLines.map((a, i) => ({
          batchId,
          customerName: a.customerName,
          customerId: a.customerId ?? null,
          invoiceReference: a.invoiceReference,
          invoiceDate: a.invoiceDate ? new Date(`${a.invoiceDate}T00:00:00.000Z`) : null,
          dueDate: a.dueDate ? new Date(`${a.dueDate}T00:00:00.000Z`) : null,
          outstandingInPaise: a.outstandingInPaise,
          currency: a.currency ?? "INR",
          source: a.source ?? null,
          reviewStatus: a.reviewStatus ?? "PENDING",
          sortOrder: i
        }))
      });
    }
    if (staging.gstLines?.length) {
      await tx.accountingOpeningGstLine.createMany({
        data: staging.gstLines.map((g, i) => ({
          batchId,
          accountCode: g.accountCode,
          balanceInPaise: g.balanceInPaise,
          source: g.source ?? null,
          reviewStatus: g.reviewStatus ?? "PENDING",
          sortOrder: i
        }))
      });
    }
    if (staging.equityLines?.length) {
      await tx.accountingOpeningEquityLine.createMany({
        data: staging.equityLines.map((e, i) => ({
          batchId,
          accountCode: e.accountCode,
          amountInPaise: e.amountInPaise,
          reason: e.reason ?? null,
          reviewStatus: e.reviewStatus ?? "PENDING",
          sortOrder: i
        }))
      });
    }

    await tx.accountingOpeningBatch.update({
      where: { id: batchId },
      data: {
        status: "DRAFT",
        sourceFingerprint: fingerprint,
        arApprovedZero: staging.arApprovedZero ?? batch.arApprovedZero,
        equity3900Reason: staging.equity3900Reason ?? batch.equity3900Reason,
        equity3900Reviewer: staging.equity3900Reviewer ?? batch.equity3900Reviewer,
        equity3900Approved: staging.equity3900Approved ?? batch.equity3900Approved,
        validatedAt: null,
        validationSummary: Prisma.DbNull
      }
    });
  });

  const reloaded = await loadOpeningBatchGraph(batchId);
  if (reloaded) {
    const proposal = buildOpeningProposal(reloaded);
    await prisma.accountingOpeningBatch.update({
      where: { id: batchId },
      data: {
        totalDebitInPaise: proposal.totalDebitInPaise,
        totalCreditInPaise: proposal.totalCreditInPaise
      }
    });
  }

  return loadOpeningBatchGraph(batchId);
}

export async function markOpeningBatchValidated(batchId: string) {
  const result = await validateOpeningBatch(batchId);
  if (result.status === "FAIL") {
    await prisma.accountingOpeningBatch.update({
      where: { id: batchId },
      data: { validationSummary: result as unknown as Prisma.InputJsonValue, validatedAt: null }
    });
    return { ok: false as const, validation: result };
  }
  await prisma.accountingOpeningBatch.update({
    where: { id: batchId },
    data: {
      status: "VALIDATED",
      validatedAt: new Date(),
      validationSummary: result as unknown as Prisma.InputJsonValue,
      totalDebitInPaise: result.proposedDebitInPaise,
      totalCreditInPaise: result.proposedCreditInPaise
    }
  });
  return { ok: true as const, validation: result };
}

export async function previewOpeningBatchPost(batchId: string) {
  const batch = await loadOpeningBatchGraph(batchId);
  if (!batch) throw new Error("Opening batch not found");
  const validation = await validateOpeningBatch(batchId);
  const proposal = buildOpeningProposal(batch);
  return { batch, validation, proposal };
}

async function getOrCreateLockedOpeningEvent(
  tx: Prisma.TransactionClient,
  input: {
    eventType: string;
    sourceType: string;
    sourceId: string;
    uniqueKey: string;
    payloadJson?: Prisma.InputJsonValue;
  }
) {
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "AccountingPostingEvent" (
      "id", "eventType", "sourceType", "sourceId", "uniqueKey", "payloadJson",
      "status", "attemptCount", "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid(),
      ${input.eventType},
      ${input.sourceType},
      ${input.sourceId},
      ${input.uniqueKey},
      ${input.payloadJson ?? null}::jsonb,
      'PENDING'::"AccountingPostingEventStatus",
      0,
      NOW(),
      NOW()
    )
    ON CONFLICT ("eventType", "uniqueKey") DO NOTHING
    RETURNING id
  `;
  const eventId =
    inserted[0]?.id ??
    (
      await tx.accountingPostingEvent.findUniqueOrThrow({
        where: {
          eventType_uniqueKey: { eventType: input.eventType, uniqueKey: input.uniqueKey }
        },
        select: { id: true }
      })
    ).id;
  await tx.$queryRaw`SELECT id FROM "AccountingPostingEvent" WHERE id = ${eventId}::uuid FOR UPDATE`;
  return tx.accountingPostingEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: { journalEntry: { include: { lines: true } } }
  });
}

/**
 * Atomically posts opening journal + FIFO layers + bank registry + batch status.
 * Replay of the same uniqueKey is idempotent and does not duplicate subledgers.
 */
export async function postOpeningBatch(
  batchId: string,
  opts?: { postedByUserId?: string; forcePersist?: boolean }
) {
  if (!opts?.forcePersist) {
    assertProductionOpeningPersistenceAllowed();
  }
  if (!isNativeAccountingEnabled() && !opts?.forcePersist) {
    throw new Error("NATIVE_ACCOUNTING_ENABLED is required to post openings");
  }

  const existingPosted = await prisma.accountingOpeningBatch.findFirst({
    where: { status: "POSTED", NOT: { id: batchId } }
  });
  if (existingPosted) {
    throw new Error(`Another POSTED opening batch exists: ${existingPosted.batchNumber}`);
  }

  const batchPre = await loadOpeningBatchGraph(batchId);
  if (!batchPre) throw new Error("Opening batch not found");
  if (batchPre.status === "POSTED") {
    const uniqueKey = productionOpeningUniqueKey(batchId);
    const event = await getPostingEvent(PRODUCTION_OPENING_EVENT_TYPE, uniqueKey);
    return {
      duplicate: true as const,
      batch: batchPre,
      journal: event?.journalEntry ?? null,
      event,
      validation: await validateOpeningBatch(batchId)
    };
  }
  if (batchPre.status === "CANCELLED") throw new Error("Cancelled batch cannot post");

  const validation = await validateOpeningBatch(batchId);
  if (validation.status === "FAIL") {
    throw new Error(
      `Opening validation FAIL: ${validation.checks
        .filter((c) => c.status === "FAIL")
        .map((c) => c.code)
        .join(", ")}`
    );
  }

  assertDocumentDateAllowedForPosting(batchPre.effectiveDate);
  await assertEntryDateInOpenPeriod(batchPre.effectiveDate);

  const proposal = buildOpeningProposal(batchPre);
  if (proposal.totalDebitInPaise !== proposal.totalCreditInPaise) {
    throw new Error("Opening proposal unbalanced");
  }
  if (proposal.totalDebitInPaise === 0) {
    throw new Error("Opening proposal has zero value");
  }

  const accountIds = new Map<string, string>();
  for (const line of proposal.lines) {
    if (accountIds.has(line.accountCode)) continue;
    const acct = await getAccountingAccountByCode(line.accountCode);
    if (!acct) throw new Error(`Missing CoA account ${line.accountCode}`);
    accountIds.set(line.accountCode, acct.id);
  }

  const uniqueKey = productionOpeningUniqueKey(batchId);
  const payloadJson = {
    batchNumber: batchPre.batchNumber,
    fingerprint: batchPre.sourceFingerprint,
    totals: {
      debit: proposal.totalDebitInPaise,
      credit: proposal.totalCreditInPaise
    }
  } as Prisma.InputJsonValue;

  const result = await prisma.$transaction(async (tx) => {
    const event = await getOrCreateLockedOpeningEvent(tx, {
      eventType: PRODUCTION_OPENING_EVENT_TYPE,
      sourceType: PRODUCTION_OPENING_SOURCE_TYPE,
      sourceId: batchId,
      uniqueKey,
      payloadJson
    });

    if (event.status === "POSTED" && event.journalEntry) {
      return { duplicate: true as const, event, journal: event.journalEntry };
    }

    if (event.status === "POSTED" && !event.journalEntry) {
      throw new Error(`Opening posting event ${uniqueKey} POSTED without journal`);
    }

    let workingStatus = event.status;
    if (event.status === "FAILED") {
      assertPostingEventTransition("FAILED", "RETRYING");
      await tx.accountingPostingEvent.update({
        where: { id: event.id },
        data: { status: "RETRYING", attemptCount: { increment: 1 } }
      });
      workingStatus = "RETRYING";
    }

    const journal = await createAndPostJournalInTx(tx, {
      entryDate: batchPre.effectiveDate,
      memo: `PRODUCTION_OPENING_BALANCE ${batchPre.batchNumber}`,
      postedByUserId: opts?.postedByUserId,
      lines: proposal.lines.map((l, i) => ({
        accountId: accountIds.get(l.accountCode)!,
        debitInPaise: l.debitInPaise,
        creditInPaise: l.creditInPaise,
        lineMemo: l.memo,
        sortOrder: i
      }))
    });

    assertPostingEventTransition(workingStatus, "POSTED");
    const updated = await tx.accountingPostingEvent.update({
      where: { id: event.id },
      data: {
        status: "POSTED",
        journalEntryId: journal.id,
        processedAt: new Date(),
        attemptCount: { increment: workingStatus === "PENDING" ? 1 : 0 },
        lastError: null,
        payloadJson
      },
      include: { journalEntry: { include: { lines: true } } }
    });

    await tx.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: PRODUCTION_OPENING_DOCUMENT_TYPE,
          documentId: batchId,
          journalEntryId: journal.id
        }
      },
      create: {
        documentType: PRODUCTION_OPENING_DOCUMENT_TYPE,
        documentId: batchId,
        journalEntryId: journal.id
      },
      update: {}
    });

    for (const inv of batchPre.inventoryLines) {
      if (!inv.variantId || inv.quantity <= 0) continue;
      const fingerprint = `opening:${batchId}:${inv.sku}`;
      const existingLayer = await tx.accountingInventoryCostLayer.findFirst({
        where: {
          sourceType: "OPENING",
          sourceId: inv.id,
          sourceLineId: inv.id,
          sourceFingerprint: fingerprint
        }
      });
      if (existingLayer) {
        await tx.accountingOpeningInventoryLine.update({
          where: { id: inv.id },
          data: { costLayerId: existingLayer.id }
        });
        continue;
      }
      const layer = await tx.accountingInventoryCostLayer.create({
        data: {
          variantId: inv.variantId,
          sourceType: "OPENING",
          sourceId: inv.id,
          sourceLineId: inv.id,
          quantityOriginal: inv.quantity,
          quantityRemaining: inv.quantity,
          unitCostInPaise: inv.unitCostInPaise,
          totalCostInPaise: inv.totalCostInPaise,
          effectiveAt: batchPre.effectiveDate,
          sourceFingerprint: fingerprint,
          status: "ACTIVE"
        }
      });
      await tx.accountingOpeningInventoryLine.update({
        where: { id: inv.id },
        data: { costLayerId: layer.id }
      });
    }

    for (const bank of batchPre.bankLines) {
      const existing = await tx.accountingBankAccount.findFirst({
        where: { glAccountCode: bank.glAccountCode }
      });
      if (!existing) {
        await tx.accountingBankAccount.create({
          data: {
            name: bank.name,
            bankName: bank.bankName,
            maskedAccountNumber: bank.maskedAccountNumber,
            ifsc: bank.ifsc,
            glAccountCode: bank.glAccountCode,
            accountType: bank.accountType === "CASH" ? "CASH" : "BANK",
            currency: "INR",
            isActive: true,
            isDefault: false
          }
        });
      }
    }

    await tx.accountingOpeningBatch.update({
      where: { id: batchId },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        journalEntryId: journal.id,
        postingEventId: updated.id,
        totalDebitInPaise: proposal.totalDebitInPaise,
        totalCreditInPaise: proposal.totalCreditInPaise,
        validationSummary: validation as unknown as Prisma.InputJsonValue
      }
    });

    return { duplicate: false as const, event: updated, journal };
  });

  logger.info("accounting_production_opening_posted", {
    batchId,
    batchNumber: batchPre.batchNumber,
    journalId: result.journal.id,
    duplicate: result.duplicate
  });

  return {
    duplicate: result.duplicate,
    batch: await loadOpeningBatchGraph(batchId),
    journal: result.journal,
    event: result.event,
    validation
  };
}
