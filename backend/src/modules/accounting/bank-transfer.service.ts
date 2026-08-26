import { createHash } from "crypto";
import type { AccountingBankTransferKind, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  BankTransferImmutableError,
  BankTransferNotEligibleError,
  BankTransferNotFoundError
} from "./accounting-errors";
import {
  assertBankAccountPostable,
  assertTransferKindMatchesAccounts
} from "./bank-account.service";
import { nextBankTransferNumberInTx } from "./bank-transfer-sequence";
import type { BankTransferSnapshot } from "./bank-transfer.types";

export function fingerprintBankTransfer(input: {
  transferDate: string;
  amountInPaise: number;
  currency: string;
  transferKind: string;
  sourceBankAccountId: string;
  destinationBankAccountId: string;
  reference: string | null;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function toSnapshot(transferId: string): Promise<BankTransferSnapshot> {
  const row = await prisma.accountingBankTransfer.findUnique({
    where: { id: transferId },
    include: {
      sourceBankAccount: true,
      destinationBankAccount: true
    }
  });
  if (!row) throw new BankTransferNotFoundError(transferId);

  return {
    transferId: row.id,
    transferNumber: row.transferNumber,
    transferDate: row.transferDate,
    amountInPaise: row.amountInPaise,
    currency: row.currency,
    transferKind: row.transferKind,
    sourceBankAccountId: row.sourceBankAccountId,
    sourceGlAccountCode: row.sourceBankAccount.glAccountCode,
    sourceAccountName: row.sourceBankAccount.name,
    destinationBankAccountId: row.destinationBankAccountId,
    destinationGlAccountCode: row.destinationBankAccount.glAccountCode,
    destinationAccountName: row.destinationBankAccount.name,
    reference: row.reference,
    memo: row.memo,
    status: row.status,
    sourcePayloadHash: row.sourcePayloadHash,
    updatedAt: row.updatedAt
  };
}

export async function loadBankTransferSnapshot(transferId: string): Promise<BankTransferSnapshot> {
  return toSnapshot(transferId);
}

export async function validateTransferDraftInput(input: {
  transferDate: Date;
  amountInPaise: number;
  currency?: string;
  transferKind: AccountingBankTransferKind;
  sourceBankAccountId: string;
  destinationBankAccountId: string;
  reference?: string | null;
}) {
  if (input.amountInPaise <= 0) {
    throw new BankTransferNotEligibleError("Amount must be > 0", "INVALID_AMOUNT");
  }
  const currency = (input.currency ?? "INR").toUpperCase();
  if (currency !== "INR") {
    throw new BankTransferNotEligibleError("Non-INR deferred in V1", "MULTI_CURRENCY_DEFERRED");
  }
  if (input.sourceBankAccountId === input.destinationBankAccountId) {
    throw new BankTransferNotEligibleError(
      "Source and destination must differ",
      "SAME_SOURCE_DEST"
    );
  }

  const source = await assertBankAccountPostable(input.sourceBankAccountId);
  const dest = await assertBankAccountPostable(input.destinationBankAccountId);
  if (source.currency !== currency || dest.currency !== currency) {
    throw new BankTransferNotEligibleError("Currency mismatch", "CURRENCY_MISMATCH");
  }

  assertTransferKindMatchesAccounts(input.transferKind, source.accountType, dest.accountType);

  return {
    reference: input.reference?.trim() || null,
    currency
  };
}

export async function createBankTransferDraft(input: {
  transferDate: Date;
  amountInPaise: number;
  currency?: string;
  transferKind: AccountingBankTransferKind;
  sourceBankAccountId: string;
  destinationBankAccountId: string;
  reference?: string | null;
  memo?: string | null;
  createdByUserId?: string | null;
}) {
  const { reference, currency } = await validateTransferDraftInput(input);
  const hash = fingerprintBankTransfer({
    transferDate: input.transferDate.toISOString().slice(0, 10),
    amountInPaise: input.amountInPaise,
    currency,
    transferKind: input.transferKind,
    sourceBankAccountId: input.sourceBankAccountId,
    destinationBankAccountId: input.destinationBankAccountId,
    reference
  });

  return prisma.$transaction(async (tx) => {
    const transferNumber = await nextBankTransferNumberInTx(tx, input.transferDate);
    return tx.accountingBankTransfer.create({
      data: {
        transferNumber,
        transferDate: input.transferDate,
        amountInPaise: input.amountInPaise,
        currency,
        transferKind: input.transferKind,
        sourceBankAccountId: input.sourceBankAccountId,
        destinationBankAccountId: input.destinationBankAccountId,
        reference,
        memo: input.memo?.trim() || null,
        status: "DRAFT",
        sourcePayloadHash: hash,
        createdByUserId: input.createdByUserId ?? null
      },
      include: {
        sourceBankAccount: true,
        destinationBankAccount: true
      }
    });
  });
}

export async function updateBankTransferDraft(
  transferId: string,
  input: {
    transferDate?: Date;
    amountInPaise?: number;
    transferKind?: AccountingBankTransferKind;
    sourceBankAccountId?: string;
    destinationBankAccountId?: string;
    reference?: string | null;
    memo?: string | null;
  }
) {
  const existing = await prisma.accountingBankTransfer.findUnique({ where: { id: transferId } });
  if (!existing) throw new BankTransferNotFoundError(transferId);
  if (existing.status !== "DRAFT") {
    throw new BankTransferImmutableError("edited");
  }

  const transferDate = input.transferDate ?? existing.transferDate;
  const amountInPaise = input.amountInPaise ?? existing.amountInPaise;
  const transferKind = input.transferKind ?? existing.transferKind;
  const sourceBankAccountId = input.sourceBankAccountId ?? existing.sourceBankAccountId;
  const destinationBankAccountId =
    input.destinationBankAccountId ?? existing.destinationBankAccountId;
  const reference =
    input.reference !== undefined ? input.reference?.trim() || null : existing.reference;

  const { currency } = await validateTransferDraftInput({
    transferDate,
    amountInPaise,
    currency: existing.currency,
    transferKind,
    sourceBankAccountId,
    destinationBankAccountId,
    reference
  });

  const hash = fingerprintBankTransfer({
    transferDate: transferDate.toISOString().slice(0, 10),
    amountInPaise,
    currency,
    transferKind,
    sourceBankAccountId,
    destinationBankAccountId,
    reference
  });

  await prisma.accountingBankTransfer.update({
    where: { id: transferId },
    data: {
      transferDate,
      amountInPaise,
      transferKind,
      sourceBankAccountId,
      destinationBankAccountId,
      reference,
      memo: input.memo !== undefined ? input.memo?.trim() || null : existing.memo,
      sourcePayloadHash: hash
    }
  });

  return toSnapshot(transferId);
}

export async function listBankTransfers(opts: { limit: number; status?: string }) {
  return prisma.accountingBankTransfer.findMany({
    where:
      opts.status && opts.status !== "ALL"
        ? { status: opts.status as "DRAFT" | "POSTED" | "VOID" }
        : undefined,
    orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
    take: opts.limit,
    include: {
      sourceBankAccount: { select: { id: true, name: true, glAccountCode: true } },
      destinationBankAccount: { select: { id: true, name: true, glAccountCode: true } },
      journalEntry: { select: { entryNumber: true, status: true } }
    }
  });
}

export async function deleteBankTransferDraft(transferId: string) {
  const existing = await prisma.accountingBankTransfer.findUnique({ where: { id: transferId } });
  if (!existing) throw new BankTransferNotFoundError(transferId);
  if (existing.status === "POSTED") {
    throw new BankTransferImmutableError("deleted");
  }
  await prisma.accountingBankTransfer.delete({ where: { id: transferId } });
}
