import { prisma } from "../../config/db";

import {
  ExpenseMappingInvalidError,
  ExpenseMappingNotFoundError
} from "./accounting-errors";
import {
  ALLOWED_EXPENSE_COA_CODES,
  EXPENSE_PAYMENT_ACCOUNT,
  normalizeExpenseMappingKey
} from "./expense.constants";
import { getAccountingAccountByCode } from "./seed-coa";

export async function listExpenseAccountMappings() {
  const rows = await prisma.accountingExpenseAccountMapping.findMany({
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }]
  });
  const withCounts = [];
  for (const row of rows) {
    const count = await prisma.expense.count({
      where: {
        expenseAccount: { equals: row.displayName, mode: "insensitive" }
      }
    });
    // Also count exact normalized matches via raw free-text scan is expensive; use display + normalized heuristic
    const countExact = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c FROM "Expense"
      WHERE UPPER(TRIM(REGEXP_REPLACE("expenseAccount", '\\s+', ' ', 'g'))) = ${row.normalizedSourceName}
    `;
    withCounts.push({
      ...row,
      expenseRowCount: Number(countExact[0]?.c ?? count)
    });
  }
  return withCounts;
}

export async function listUnmappedExpenseAccounts() {
  const rows = await prisma.$queryRaw<
    Array<{ expenseAccount: string; c: bigint }>
  >`
    SELECT "expenseAccount", COUNT(*)::bigint AS c
    FROM "Expense"
    GROUP BY "expenseAccount"
    ORDER BY c DESC, "expenseAccount" ASC
  `;
  const mapped = await prisma.accountingExpenseAccountMapping.findMany({
    where: { isActive: true },
    select: { normalizedSourceName: true }
  });
  const set = new Set(mapped.map((m) => m.normalizedSourceName));
  return rows
    .map((r) => ({
      expenseAccount: r.expenseAccount,
      normalized: normalizeExpenseMappingKey(r.expenseAccount),
      count: Number(r.c)
    }))
    .filter((r) => r.normalized && !set.has(r.normalized));
}

export async function upsertExpenseAccountMapping(input: {
  sourceName: string;
  accountingAccountCode: string;
  isActive?: boolean;
}) {
  const normalized = normalizeExpenseMappingKey(input.sourceName);
  if (!normalized) throw new ExpenseMappingInvalidError("sourceName required");
  if (!ALLOWED_EXPENSE_COA_CODES.has(input.accountingAccountCode)) {
    throw new ExpenseMappingInvalidError(
      `accountingAccountCode must be allowed EXPENSE CoA`,
      "INVALID_EXPENSE_COA"
    );
  }
  const acct = await getAccountingAccountByCode(input.accountingAccountCode);
  if (!acct || acct.type !== "EXPENSE" || !acct.isActive) {
    throw new ExpenseMappingInvalidError("Target CoA missing, inactive, or not EXPENSE type");
  }
  return prisma.accountingExpenseAccountMapping.upsert({
    where: { normalizedSourceName: normalized },
    create: {
      normalizedSourceName: normalized,
      displayName: input.sourceName.trim(),
      accountingAccountCode: input.accountingAccountCode,
      isActive: input.isActive ?? true
    },
    update: {
      displayName: input.sourceName.trim(),
      accountingAccountCode: input.accountingAccountCode,
      isActive: input.isActive ?? true
    }
  });
}

export async function setExpenseAccountMappingActive(id: string, isActive: boolean) {
  try {
    return await prisma.accountingExpenseAccountMapping.update({
      where: { id },
      data: { isActive }
    });
  } catch {
    throw new ExpenseMappingNotFoundError(id);
  }
}

export async function listExpensePaymentMappings() {
  const rows = await prisma.accountingExpensePaymentMapping.findMany({
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }]
  });
  const withCounts = [];
  for (const row of rows) {
    const countExact = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c FROM "Expense"
      WHERE "paidThrough" IS NOT NULL
        AND UPPER(TRIM(REGEXP_REPLACE("paidThrough", '\\s+', ' ', 'g'))) = ${row.normalizedSourceName}
    `;
    withCounts.push({ ...row, expenseRowCount: Number(countExact[0]?.c ?? 0) });
  }
  return withCounts;
}

export async function listUnmappedPaidThrough() {
  const rows = await prisma.$queryRaw<Array<{ paidThrough: string; c: bigint }>>`
    SELECT "paidThrough", COUNT(*)::bigint AS c
    FROM "Expense"
    WHERE "paidThrough" IS NOT NULL AND TRIM("paidThrough") <> ''
    GROUP BY "paidThrough"
    ORDER BY c DESC, "paidThrough" ASC
  `;
  const mapped = await prisma.accountingExpensePaymentMapping.findMany({
    where: { isActive: true },
    select: { normalizedSourceName: true }
  });
  const set = new Set(mapped.map((m) => m.normalizedSourceName));
  return rows
    .map((r) => ({
      paidThrough: r.paidThrough,
      normalized: normalizeExpenseMappingKey(r.paidThrough),
      count: Number(r.c)
    }))
    .filter((r) => r.normalized && !set.has(r.normalized));
}

export async function upsertExpensePaymentMapping(input: {
  sourceName: string;
  paidAccountCode?: string;
  bankAccountId?: string | null;
  isActive?: boolean;
}) {
  const normalized = normalizeExpenseMappingKey(input.sourceName);
  if (!normalized) throw new ExpenseMappingInvalidError("sourceName required");

  let paidAccountCode = input.paidAccountCode;
  let bankAccountId = input.bankAccountId ?? null;

  if (bankAccountId) {
    const { assertBankAccountPostable } = await import("./bank-account.service");
    const bank = await assertBankAccountPostable(bankAccountId);
    paidAccountCode =
      bank.accountType === "BANK"
        ? EXPENSE_PAYMENT_ACCOUNT.BANK
        : EXPENSE_PAYMENT_ACCOUNT.CASH;
  } else if (!paidAccountCode) {
    throw new ExpenseMappingInvalidError(
      "paidAccountCode or bankAccountId required",
      "INVALID_PAYMENT_ACCOUNT"
    );
  } else if (
    paidAccountCode !== EXPENSE_PAYMENT_ACCOUNT.CASH &&
    paidAccountCode !== EXPENSE_PAYMENT_ACCOUNT.BANK
  ) {
    throw new ExpenseMappingInvalidError("paidAccountCode must be 1000 or 1010", "INVALID_PAYMENT_ACCOUNT");
  }

  return prisma.accountingExpensePaymentMapping.upsert({
    where: { normalizedSourceName: normalized },
    create: {
      normalizedSourceName: normalized,
      displayName: input.sourceName.trim(),
      paidAccountCode,
      bankAccountId,
      isActive: input.isActive ?? true
    },
    update: {
      displayName: input.sourceName.trim(),
      paidAccountCode,
      bankAccountId,
      isActive: input.isActive ?? true
    }
  });
}

export async function setExpensePaymentMappingActive(id: string, isActive: boolean) {
  try {
    return await prisma.accountingExpensePaymentMapping.update({
      where: { id },
      data: { isActive }
    });
  } catch {
    throw new ExpenseMappingNotFoundError(id);
  }
}

/** Seed common paidThrough → Cash/Bank mappings (idempotent). */
export async function seedDefaultExpensePaymentMappings() {
  const defaults: Array<{ name: string; code: string }> = [
    { name: "Cash", code: EXPENSE_PAYMENT_ACCOUNT.CASH },
    { name: "Bank", code: EXPENSE_PAYMENT_ACCOUNT.BANK },
    { name: "UPI", code: EXPENSE_PAYMENT_ACCOUNT.BANK },
    { name: "NEFT", code: EXPENSE_PAYMENT_ACCOUNT.BANK },
    { name: "IMPS", code: EXPENSE_PAYMENT_ACCOUNT.BANK },
    { name: "RTGS", code: EXPENSE_PAYMENT_ACCOUNT.BANK },
    { name: "Cheque", code: EXPENSE_PAYMENT_ACCOUNT.BANK },
    { name: "Check", code: EXPENSE_PAYMENT_ACCOUNT.BANK }
  ];
  let created = 0;
  for (const d of defaults) {
    const normalized = normalizeExpenseMappingKey(d.name)!;
    const existing = await prisma.accountingExpensePaymentMapping.findUnique({
      where: { normalizedSourceName: normalized }
    });
    if (existing) continue;
    await prisma.accountingExpensePaymentMapping.create({
      data: {
        normalizedSourceName: normalized,
        displayName: d.name,
        paidAccountCode: d.code,
        isActive: true
      }
    });
    created += 1;
  }
  return { created };
}
