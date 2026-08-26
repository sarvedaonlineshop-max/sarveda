import type { AccountingBankAccountType, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import {
  BankAccountInvalidError,
  BankAccountNotFoundError
} from "./accounting-errors";
import {
  BANK_REGISTRY_RESERVED_GL_CODES,
  maskAccountNumber
} from "./bank-account.constants";
import { getAccountingAccountByCode } from "./seed-coa";

const CASH_TYPES: AccountingBankAccountType[] = ["CASH", "PETTY_CASH"];
const BANK_TYPES: AccountingBankAccountType[] = ["BANK"];

export async function bankAccountHasFinancialUsage(bankAccountId: string): Promise<boolean> {
  const row = await prisma.accountingBankAccount.findUnique({
    where: { id: bankAccountId },
    select: { glAccountCode: true }
  });
  if (!row) return false;

  const acct = await getAccountingAccountByCode(row.glAccountCode);
  if (!acct) return false;

  const journalLine = await prisma.accountingJournalLine.findFirst({
    where: {
      accountId: acct.id,
      journalEntry: { status: "POSTED" }
    },
    select: { id: true }
  });
  if (journalLine) return true;

  const postedTransfer = await prisma.accountingBankTransfer.findFirst({
    where: {
      status: "POSTED",
      OR: [{ sourceBankAccountId: bankAccountId }, { destinationBankAccountId: bankAccountId }]
    },
    select: { id: true }
  });
  if (postedTransfer) return true;

  const postedVendorPayment = await prisma.accountingVendorPayment.findFirst({
    where: { bankAccountId, status: "POSTED" },
    select: { id: true }
  });
  return Boolean(postedVendorPayment);
}

export async function computeBookBalanceForGlCode(glAccountCode: string): Promise<number> {
  const acct = await getAccountingAccountByCode(glAccountCode);
  if (!acct) return 0;

  const agg = await prisma.accountingJournalLine.aggregate({
    where: {
      accountId: acct.id,
      journalEntry: { status: "POSTED" }
    },
    _sum: { debitInPaise: true, creditInPaise: true }
  });

  return (agg._sum.debitInPaise ?? 0) - (agg._sum.creditInPaise ?? 0);
}

export async function listBankAccounts(opts?: { includeInactive?: boolean }) {
  const rows = await prisma.accountingBankAccount.findMany({
    where: opts?.includeInactive ? undefined : { isActive: true },
    orderBy: [{ accountType: "asc" }, { name: "asc" }]
  });

  const withBalances = [];
  for (const row of rows) {
    const bookBalanceInPaise = await computeBookBalanceForGlCode(row.glAccountCode);
    withBalances.push({ ...row, bookBalanceInPaise });
  }
  return withBalances;
}

export async function getBankAccountById(id: string) {
  const row = await prisma.accountingBankAccount.findUnique({ where: { id } });
  if (!row) throw new BankAccountNotFoundError(id);
  const bookBalanceInPaise = await computeBookBalanceForGlCode(row.glAccountCode);
  return { ...row, bookBalanceInPaise };
}

function assertBankRegistryGlAllowed(glAccountCode: string) {
  if (BANK_REGISTRY_RESERVED_GL_CODES.has(glAccountCode.trim())) {
    throw new BankAccountInvalidError(
      `GL ${glAccountCode} is reserved (clearing/AR/inventory) and cannot be a bank registry account`,
      "GL_RESERVED_NON_BANK"
    );
  }
}

async function assertAssetGlAccount(glAccountCode: string) {
  assertBankRegistryGlAllowed(glAccountCode);
  const acct = await getAccountingAccountByCode(glAccountCode);
  if (!acct) {
    throw new BankAccountInvalidError(`GL account ${glAccountCode} not found`, "GL_NOT_FOUND");
  }
  if (acct.type !== "ASSET") {
    throw new BankAccountInvalidError(`GL ${glAccountCode} must be ASSET type`, "GL_NOT_ASSET");
  }
  if (!acct.isActive) {
    throw new BankAccountInvalidError(`GL ${glAccountCode} is inactive`, "GL_INACTIVE");
  }
  return acct;
}

async function clearOtherDefaults(
  tx: Prisma.TransactionClient,
  accountType: AccountingBankAccountType,
  excludeId?: string
) {
  await tx.accountingBankAccount.updateMany({
    where: {
      accountType,
      isDefault: true,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    data: { isDefault: false }
  });
}

async function clearOtherRazorpayTargets(tx: Prisma.TransactionClient, excludeId?: string) {
  await tx.accountingBankAccount.updateMany({
    where: {
      razorpaySettlementTarget: true,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    data: { razorpaySettlementTarget: false }
  });
}

export async function createBankAccount(input: {
  name: string;
  bankName?: string | null;
  maskedAccountNumber?: string | null;
  ifsc?: string | null;
  currency?: string;
  glAccountCode: string;
  accountType: AccountingBankAccountType;
  isDefault?: boolean;
  statementImportEnabled?: boolean;
  razorpaySettlementTarget?: boolean;
  createdByUserId?: string | null;
  createGlIfMissing?: boolean;
}) {
  const currency = (input.currency ?? "INR").toUpperCase();
  if (currency !== "INR") {
    throw new BankAccountInvalidError("Non-INR deferred in V1", "MULTI_CURRENCY_DEFERRED");
  }

  const glCode = input.glAccountCode.trim();
  if (!glCode) throw new BankAccountInvalidError("glAccountCode required");
  assertBankRegistryGlAllowed(glCode);

  const existingRegistry = await prisma.accountingBankAccount.findUnique({
    where: { glAccountCode: glCode }
  });
  if (existingRegistry) {
    throw new BankAccountInvalidError(
      `GL ${glCode} already linked to bank account ${existingRegistry.name}`,
      "DUPLICATE_GL"
    );
  }

  let gl = await getAccountingAccountByCode(glCode);
  if (!gl && input.createGlIfMissing) {
    gl = await prisma.accountingAccount.create({
      data: {
        code: glCode,
        name: input.name.trim(),
        type: "ASSET",
        currency,
        isActive: true,
        isSystem: false,
        description: `Bank registry GL for ${input.name.trim()}`
      }
    });
  } else {
    await assertAssetGlAccount(glCode);
  }

  const masked = maskAccountNumber(input.maskedAccountNumber);

  const row = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await clearOtherDefaults(tx, input.accountType);
    }
    if (input.razorpaySettlementTarget) {
      await clearOtherRazorpayTargets(tx);
    }

    return tx.accountingBankAccount.create({
      data: {
        name: input.name.trim(),
        bankName: input.bankName?.trim() || null,
        maskedAccountNumber: masked,
        ifsc: input.ifsc?.trim() || null,
        currency,
        glAccountCode: glCode,
        accountType: input.accountType,
        isActive: true,
        isDefault: input.isDefault ?? false,
        statementImportEnabled: input.statementImportEnabled ?? false,
        razorpaySettlementTarget: input.razorpaySettlementTarget ?? false,
        createdByUserId: input.createdByUserId ?? null
      }
    });
  });

  await writeAccountingAuditLog({
    actorUserId: input.createdByUserId,
    action: "BANK_ACCOUNT_CREATED",
    entityType: "BANK_ACCOUNT",
    entityId: row.id,
    afterJson: { glAccountCode: row.glAccountCode, accountType: row.accountType }
  });

  return getBankAccountById(row.id);
}

export async function updateBankAccountMetadata(
  id: string,
  input: {
    name?: string;
    bankName?: string | null;
    maskedAccountNumber?: string | null;
    ifsc?: string | null;
    isDefault?: boolean;
    statementImportEnabled?: boolean;
    razorpaySettlementTarget?: boolean;
    actorUserId?: string | null;
  }
) {
  const existing = await prisma.accountingBankAccount.findUnique({ where: { id } });
  if (!existing) throw new BankAccountNotFoundError(id);

  const masked =
    input.maskedAccountNumber !== undefined
      ? maskAccountNumber(input.maskedAccountNumber)
      : undefined;

  const row = await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await clearOtherDefaults(tx, existing.accountType, id);
    }
    if (input.razorpaySettlementTarget === true) {
      await clearOtherRazorpayTargets(tx, id);
    }

    return tx.accountingBankAccount.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.bankName !== undefined ? { bankName: input.bankName?.trim() || null } : {}),
        ...(masked !== undefined ? { maskedAccountNumber: masked } : {}),
        ...(input.ifsc !== undefined ? { ifsc: input.ifsc?.trim() || null } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.statementImportEnabled !== undefined
          ? { statementImportEnabled: input.statementImportEnabled }
          : {}),
        ...(input.razorpaySettlementTarget !== undefined
          ? { razorpaySettlementTarget: input.razorpaySettlementTarget }
          : {})
      }
    });
  });

  await writeAccountingAuditLog({
    actorUserId: input.actorUserId,
    action: "BANK_ACCOUNT_MODIFIED",
    entityType: "BANK_ACCOUNT",
    entityId: id,
    beforeJson: {
      name: existing.name,
      isDefault: existing.isDefault,
      razorpaySettlementTarget: existing.razorpaySettlementTarget
    },
    afterJson: {
      name: row.name,
      isDefault: row.isDefault,
      razorpaySettlementTarget: row.razorpaySettlementTarget
    }
  });

  return getBankAccountById(id);
}

export async function deactivateBankAccount(id: string, actorUserId?: string | null) {
  const existing = await prisma.accountingBankAccount.findUnique({ where: { id } });
  if (!existing) throw new BankAccountNotFoundError(id);

  const row = await prisma.accountingBankAccount.update({
    where: { id },
    data: { isActive: false, isDefault: false, razorpaySettlementTarget: false }
  });

  await writeAccountingAuditLog({
    actorUserId,
    action: "BANK_ACCOUNT_DEACTIVATED",
    entityType: "BANK_ACCOUNT",
    entityId: id,
    beforeJson: { isActive: true },
    afterJson: { isActive: false }
  });

  return row;
}

export async function assertBankAccountPostable(bankAccountId: string) {
  const row = await prisma.accountingBankAccount.findUnique({ where: { id: bankAccountId } });
  if (!row) throw new BankAccountNotFoundError(bankAccountId);
  if (!row.isActive) {
    throw new BankAccountInvalidError(`Bank account ${row.name} is inactive`, "BANK_ACCOUNT_INACTIVE");
  }
  await assertAssetGlAccount(row.glAccountCode);
  return row;
}

export async function resolveRazorpayTargetBankGlCode(opts?: {
  targetBankAccountId?: string | null;
}): Promise<string> {
  const { LEGACY_BANK_ACCOUNT_CODE } = await import("./bank-account.constants");

  if (opts?.targetBankAccountId) {
    const row = await assertBankAccountPostable(opts.targetBankAccountId);
    if (row.accountType !== "BANK") {
      throw new BankAccountInvalidError(
        "Razorpay settlement target must be a BANK account",
        "INVALID_SETTLEMENT_TARGET"
      );
    }
    return row.glAccountCode;
  }

  const configured = await prisma.accountingBankAccount.findFirst({
    where: { razorpaySettlementTarget: true, isActive: true, accountType: "BANK" },
    orderBy: { createdAt: "asc" }
  });
  if (configured) return configured.glAccountCode;

  return LEGACY_BANK_ACCOUNT_CODE;
}

export function assertTransferKindMatchesAccounts(
  kind: "INTERNAL_TRANSFER" | "CASH_DEPOSIT" | "CASH_WITHDRAWAL",
  sourceType: AccountingBankAccountType,
  destType: AccountingBankAccountType
) {
  if (kind === "INTERNAL_TRANSFER") {
    if (sourceType !== "BANK" || destType !== "BANK") {
      throw new BankAccountInvalidError(
        "INTERNAL_TRANSFER requires BANK → BANK accounts",
        "INVALID_TRANSFER_KIND"
      );
    }
  } else if (kind === "CASH_DEPOSIT") {
    if (!CASH_TYPES.includes(sourceType) || !BANK_TYPES.includes(destType)) {
      throw new BankAccountInvalidError(
        "CASH_DEPOSIT requires CASH/PETTY_CASH → BANK",
        "INVALID_TRANSFER_KIND"
      );
    }
  } else if (kind === "CASH_WITHDRAWAL") {
    if (!BANK_TYPES.includes(sourceType) || !CASH_TYPES.includes(destType)) {
      throw new BankAccountInvalidError(
        "CASH_WITHDRAWAL requires BANK → CASH/PETTY_CASH",
        "INVALID_TRANSFER_KIND"
      );
    }
  }
}

export async function resolveVendorPaymentBankAccount(
  paymentMethod: string,
  bankAccountId?: string | null
): Promise<{ bankAccountId: string | null; glAccountCode: string; paidAccountCode: string }> {
  const { PAYMENT_METHOD_TO_ACCOUNT } = await import("./vendor-payment.constants");
  const { LEGACY_BANK_ACCOUNT_CODE, LEGACY_CASH_ACCOUNT_CODE } = await import(
    "./bank-account.constants"
  );

  if (bankAccountId) {
    const row = await assertBankAccountPostable(bankAccountId);
    const isCashMethod = paymentMethod === "CASH";
    const isCashAccount = CASH_TYPES.includes(row.accountType);
    if (isCashMethod !== isCashAccount) {
      throw new BankAccountInvalidError(
        "Payment method does not match bank account type",
        "METHOD_ACCOUNT_MISMATCH"
      );
    }
    const legacyCode =
      row.accountType === "BANK" ? LEGACY_BANK_ACCOUNT_CODE : LEGACY_CASH_ACCOUNT_CODE;
    return {
      bankAccountId: row.id,
      glAccountCode: row.glAccountCode,
      paidAccountCode: legacyCode
    };
  }

  const legacyCode =
    PAYMENT_METHOD_TO_ACCOUNT[paymentMethod as keyof typeof PAYMENT_METHOD_TO_ACCOUNT];
  return {
    bankAccountId: null,
    glAccountCode: legacyCode,
    paidAccountCode: legacyCode
  };
}

export async function resolveExpensePaymentGlCode(mapping: {
  paidAccountCode: string;
  bankAccountId: string | null;
}): Promise<string> {
  if (mapping.bankAccountId) {
    const row = await assertBankAccountPostable(mapping.bankAccountId);
    return row.glAccountCode;
  }
  return mapping.paidAccountCode;
}
