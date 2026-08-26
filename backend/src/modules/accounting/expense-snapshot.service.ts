import { createHash } from "crypto";
import type { Expense, Vendor } from "@prisma/client";

import { prisma } from "../../config/db";

import { ExpenseSnapshotNotFoundError } from "./accounting-errors";
import { normalizeExpenseMappingKey } from "./expense.constants";
import type { ExpenseSnapshot } from "./expense.types";
import { resolveExpensePaymentGlCode } from "./bank-account.service";

type ExpenseRow = Expense & {
  vendor: Pick<Vendor, "id" | "name" | "gstin" | "billingState" | "billingCountry"> | null;
};

export function fingerprintExpenseFinancials(input: {
  status: string;
  amountInPaise: number;
  taxInPaise: number;
  taxInclusive: boolean;
  expenseDate: string;
  expenseAccount: string;
  mappedExpenseAccountCode: string | null;
  paidThrough: string | null;
  mappedPaymentAccountCode: string | null;
  mappedPaymentBankAccountId: string | null;
  vendorId: string | null;
  invoiceNumber: string | null;
  referenceNumber: string | null;
  reverseCharge: boolean;
  sourceOfSupply: string | null;
  destinationOfSupply: string | null;
  gstTreatment: string | null;
  currency: string;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function resolveExpenseAccountMapping(expenseAccount: string): Promise<{
  normalized: string | null;
  code: string | null;
  mappingId: string | null;
  active: boolean;
}> {
  const normalized = normalizeExpenseMappingKey(expenseAccount);
  if (!normalized) return { normalized: null, code: null, mappingId: null, active: false };
  const row = await prisma.accountingExpenseAccountMapping.findUnique({
    where: { normalizedSourceName: normalized }
  });
  if (!row) return { normalized, code: null, mappingId: null, active: false };
  return {
    normalized,
    code: row.isActive ? row.accountingAccountCode : null,
    mappingId: row.id,
    active: row.isActive
  };
}

export async function resolveExpensePaymentMapping(paidThrough: string | null): Promise<{
  normalized: string | null;
  code: string | null;
  bankAccountId: string | null;
  mappingId: string | null;
  active: boolean;
}> {
  const normalized = normalizeExpenseMappingKey(paidThrough);
  if (!normalized) return { normalized: null, code: null, bankAccountId: null, mappingId: null, active: false };
  const row = await prisma.accountingExpensePaymentMapping.findUnique({
    where: { normalizedSourceName: normalized },
    include: { bankAccount: { select: { id: true, glAccountCode: true, isActive: true } } }
  });
  if (!row) return { normalized, code: null, bankAccountId: null, mappingId: null, active: false };
  const bankActive = row.bankAccount?.isActive ?? false;
  return {
    normalized,
    code: row.isActive ? row.paidAccountCode : null,
    bankAccountId: row.isActive && bankActive ? row.bankAccountId : null,
    mappingId: row.id,
    active: row.isActive
  };
}

async function toSnapshot(row: ExpenseRow): Promise<ExpenseSnapshot> {
  const expenseMap = await resolveExpenseAccountMapping(row.expenseAccount);
  const paymentMap = await resolveExpensePaymentMapping(row.paidThrough);
  const expenseDateIso = row.expenseDate.toISOString().slice(0, 10);

  let resolvedPaymentGlAccountCode: string | null = null;
  if (paymentMap.code) {
    try {
      resolvedPaymentGlAccountCode = await resolveExpensePaymentGlCode({
        paidAccountCode: paymentMap.code,
        bankAccountId: paymentMap.bankAccountId
      });
    } catch {
      resolvedPaymentGlAccountCode = null;
    }
  }

  const sourceFingerprint = fingerprintExpenseFinancials({
    status: row.status,
    amountInPaise: row.amountInPaise,
    taxInPaise: row.taxInPaise,
    taxInclusive: row.taxInclusive,
    expenseDate: expenseDateIso,
    expenseAccount: row.expenseAccount,
    mappedExpenseAccountCode: expenseMap.code,
    paidThrough: row.paidThrough,
    mappedPaymentAccountCode: paymentMap.code,
    mappedPaymentBankAccountId: paymentMap.bankAccountId,
    vendorId: row.vendorId,
    invoiceNumber: row.invoiceNumber,
    referenceNumber: row.referenceNumber,
    reverseCharge: row.reverseCharge,
    sourceOfSupply: row.sourceOfSupply,
    destinationOfSupply: row.destinationOfSupply,
    gstTreatment: row.gstTreatment,
    currency: row.currency
  });

  return {
    expenseId: row.id,
    expenseDate: row.expenseDate,
    status: row.status,
    expenseAccount: row.expenseAccount,
    mappedExpenseAccountCode: expenseMap.code,
    paidThrough: row.paidThrough,
    mappedPaymentAccountCode: paymentMap.code,
    mappedPaymentBankAccountId: paymentMap.bankAccountId,
    resolvedPaymentGlAccountCode,
    amountInPaise: row.amountInPaise,
    taxInPaise: row.taxInPaise,
    taxInclusive: row.taxInclusive,
    currency: row.currency,
    vendorId: row.vendorId,
    vendorName: row.vendor?.name ?? null,
    vendorGstin: row.vendor?.gstin ?? null,
    vendorBillingState: row.vendor?.billingState ?? null,
    vendorBillingCountry: row.vendor?.billingCountry ?? null,
    invoiceNumber: row.invoiceNumber,
    referenceNumber: row.referenceNumber,
    expenseType: row.expenseType,
    hsnSac: row.hsnSac,
    gstTreatment: row.gstTreatment,
    sourceOfSupply: row.sourceOfSupply,
    destinationOfSupply: row.destinationOfSupply,
    reverseCharge: row.reverseCharge,
    notes: row.notes,
    sourceFingerprint,
    updatedAt: row.updatedAt
  };
}

const expenseInclude = {
  vendor: {
    select: { id: true, name: true, gstin: true, billingState: true, billingCountry: true }
  }
} as const;

export async function loadExpenseSnapshotById(expenseId: string): Promise<ExpenseSnapshot> {
  const row = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: expenseInclude
  });
  if (!row) throw new ExpenseSnapshotNotFoundError(expenseId);
  return toSnapshot(row);
}

export async function findExpenseDiscoveryCandidates(opts: {
  expenseId?: string;
  vendorId?: string;
  since?: Date;
  until?: Date;
  limit: number;
}) {
  if (opts.expenseId) {
    const one = await prisma.expense.findUnique({
      where: { id: opts.expenseId },
      select: { id: true, expenseDate: true, createdAt: true, status: true }
    });
    return one ? [one] : [];
  }
  return prisma.expense.findMany({
    where: {
      ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
      ...(opts.since || opts.until
        ? {
            expenseDate: {
              ...(opts.since ? { gte: opts.since } : {}),
              ...(opts.until ? { lte: opts.until } : {})
            }
          }
        : {})
    },
    orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: opts.limit,
    select: { id: true, expenseDate: true, createdAt: true, status: true }
  });
}
