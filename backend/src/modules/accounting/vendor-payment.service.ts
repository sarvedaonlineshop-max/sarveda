import { createHash } from "crypto";
import type { AccountingVendorPaymentMethod, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  VendorPaymentImmutableError,
  VendorPaymentNotEligibleError,
  VendorPaymentNotFoundError
} from "./accounting-errors";
import {
  PAYMENT_METHOD_TO_ACCOUNT,
  utrRequiredForMethod
} from "./vendor-payment.constants";
import { nextVendorPaymentNumberInTx } from "./vendor-payment-sequence";
import { resolveVendorPaymentBankAccount } from "./bank-account.service";
import { getNativeBillOutstanding } from "./vendor-payment-outstanding";
import type {
  VendorPaymentAllocationInput,
  VendorPaymentSnapshot
} from "./vendor-payment.types";

export function fingerprintVendorPayment(input: {
  vendorId: string;
  paymentDate: string;
  amountInPaise: number;
  paymentMethod: string;
  paidAccountCode: string;
  bankAccountId: string | null;
  utr: string | null;
  allocations: Array<{ vendorBillId: string; amountInPaise: number }>;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function validatePaymentDraftInput(input: {
  vendorId: string;
  paymentDate: Date;
  amountInPaise: number;
  currency?: string;
  paymentMethod: AccountingVendorPaymentMethod;
  utr?: string | null;
  bankAccountId?: string | null;
  allocations: VendorPaymentAllocationInput[];
  excludePaymentId?: string;
}): Promise<{
  paidAccountCode: string;
  creditGlAccountCode: string;
  bankAccountId: string | null;
  utr: string | null;
  warnings: string[];
}> {
  const warnings: string[] = [];
  if (input.amountInPaise <= 0) {
    throw new VendorPaymentNotEligibleError("Payment amount must be > 0", "INVALID_AMOUNT");
  }
  const currency = (input.currency ?? "INR").toUpperCase();
  if (currency !== "INR") {
    throw new VendorPaymentNotEligibleError("Non-INR deferred in V1", "MULTI_CURRENCY_DEFERRED");
  }
  if (!input.allocations.length) {
    throw new VendorPaymentNotEligibleError("At least one allocation required", "MISSING_ALLOCATIONS");
  }
  for (const a of input.allocations) {
    if (a.amountInPaise <= 0) {
      throw new VendorPaymentNotEligibleError("Allocation amounts must be > 0", "INVALID_ALLOCATION");
    }
  }
  const allocSum = input.allocations.reduce((s, a) => s + a.amountInPaise, 0);
  if (allocSum !== input.amountInPaise) {
    throw new VendorPaymentNotEligibleError(
      `Allocations ${allocSum} must equal payment amount ${input.amountInPaise}`,
      "ALLOCATION_AMOUNT_MISMATCH"
    );
  }
  const billIds = input.allocations.map((a) => a.vendorBillId);
  if (new Set(billIds).size !== billIds.length) {
    throw new VendorPaymentNotEligibleError("Duplicate bill in allocations", "DUPLICATE_ALLOCATION");
  }

  const paidResolved = await resolveVendorPaymentBankAccount(
    input.paymentMethod,
    input.bankAccountId
  );
  const paidAccountCode = paidResolved.paidAccountCode;
  const creditGlAccountCode = paidResolved.glAccountCode;
  const bankAccountId = paidResolved.bankAccountId;
  const utr = input.utr?.trim() || null;
  if (utrRequiredForMethod(input.paymentMethod)) {
    if (!utr || utr.length < 3) {
      throw new VendorPaymentNotEligibleError(
        "UTR/reference required (min 3 chars) for non-cash payments",
        "UTR_REQUIRED"
      );
    }
  }

  for (const a of input.allocations) {
    const bill = await prisma.vendorBill.findUnique({
      where: { id: a.vendorBillId },
      select: { id: true, vendorId: true, billNumber: true, status: true }
    });
    if (!bill) {
      throw new VendorPaymentNotEligibleError(`Bill not found: ${a.vendorBillId}`, "BILL_NOT_FOUND");
    }
    if (bill.vendorId !== input.vendorId) {
      throw new VendorPaymentNotEligibleError(
        `Bill ${bill.billNumber} belongs to another vendor`,
        "WRONG_VENDOR"
      );
    }
    if (bill.status === "VOID" || bill.status === "DRAFT") {
      throw new VendorPaymentNotEligibleError(
        `Bill ${bill.billNumber} status ${bill.status} cannot be paid`,
        "BILL_STATUS_INVALID"
      );
    }
    const outstanding = await getNativeBillOutstanding(a.vendorBillId, {
      excludePaymentId: input.excludePaymentId
    });
    if (!outstanding.hasApJournal) {
      throw new VendorPaymentNotEligibleError(
        `Bill ${bill.billNumber} has no POSTED VENDOR_BILL_POSTED journal`,
        "MISSING_AP_JOURNAL"
      );
    }
    if (a.amountInPaise > outstanding.outstandingInPaise) {
      throw new VendorPaymentNotEligibleError(
        `Allocation ${a.amountInPaise} exceeds native outstanding ${outstanding.outstandingInPaise} for ${bill.billNumber}`,
        "OVER_ALLOCATION"
      );
    }
  }

  return { paidAccountCode, creditGlAccountCode, bankAccountId, utr, warnings };
}

async function toSnapshot(paymentId: string): Promise<VendorPaymentSnapshot> {
  const row = await prisma.accountingVendorPayment.findUnique({
    where: { id: paymentId },
    include: {
      vendor: { select: { id: true, name: true } },
      allocations: true,
      bankAccount: { select: { id: true, glAccountCode: true } }
    }
  });
  if (!row) throw new VendorPaymentNotFoundError(paymentId);

  const creditGlAccountCode = row.bankAccount?.glAccountCode ?? row.paidAccountCode;

  const allocations = [];
  for (const a of row.allocations) {
    const bill = await prisma.vendorBill.findUnique({
      where: { id: a.vendorBillId },
      select: { billNumber: true }
    });
    const o = await getNativeBillOutstanding(a.vendorBillId, {
      excludePaymentId: row.status === "DRAFT" ? undefined : row.id
    });
    allocations.push({
      vendorBillId: a.vendorBillId,
      billNumber: bill?.billNumber ?? a.vendorBillId,
      amountInPaise: a.amountInPaise,
      nativeOutstandingBeforeInPaise: o.outstandingInPaise + (row.status === "POSTED" ? a.amountInPaise : 0)
    });
  }

  return {
    paymentId: row.id,
    paymentNumber: row.paymentNumber,
    vendorId: row.vendorId,
    vendorName: row.vendor.name,
    paymentDate: row.paymentDate,
    amountInPaise: row.amountInPaise,
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    paidAccountCode: row.paidAccountCode,
    creditGlAccountCode,
    bankAccountId: row.bankAccountId,
    utr: row.utr,
    notes: row.notes,
    status: row.status,
    sourcePayloadHash: row.sourcePayloadHash,
    allocations,
    updatedAt: row.updatedAt
  };
}

export async function loadVendorPaymentSnapshot(paymentId: string): Promise<VendorPaymentSnapshot> {
  return toSnapshot(paymentId);
}

export async function createVendorPaymentDraft(input: {
  vendorId: string;
  paymentDate: Date;
  amountInPaise: number;
  currency?: string;
  paymentMethod: AccountingVendorPaymentMethod;
  utr?: string | null;
  bankAccountId?: string | null;
  notes?: string | null;
  allocations: VendorPaymentAllocationInput[];
  createdByUserId?: string | null;
}) {
  const { paidAccountCode, creditGlAccountCode, bankAccountId, utr } =
    await validatePaymentDraftInput(input);
  const hash = fingerprintVendorPayment({
    vendorId: input.vendorId,
    paymentDate: input.paymentDate.toISOString().slice(0, 10),
    amountInPaise: input.amountInPaise,
    paymentMethod: input.paymentMethod,
    paidAccountCode,
    bankAccountId,
    utr,
    allocations: input.allocations.map((a) => ({
      vendorBillId: a.vendorBillId,
      amountInPaise: a.amountInPaise
    }))
  });

  const payment = await prisma.$transaction(async (tx) => {
    const paymentNumber = await nextVendorPaymentNumberInTx(tx, input.paymentDate);
    return tx.accountingVendorPayment.create({
      data: {
        paymentNumber,
        vendorId: input.vendorId,
        paymentDate: input.paymentDate,
        amountInPaise: input.amountInPaise,
        currency: (input.currency ?? "INR").toUpperCase(),
        paymentMethod: input.paymentMethod,
        paidAccountCode,
        bankAccountId,
        utr,
        notes: input.notes?.trim() || null,
        status: "DRAFT",
        sourcePayloadHash: hash,
        createdByUserId: input.createdByUserId ?? null,
        allocations: {
          create: input.allocations.map((a) => ({
            vendorBillId: a.vendorBillId,
            amountInPaise: a.amountInPaise
          }))
        }
      },
      include: { allocations: true, vendor: { select: { id: true, name: true } } }
    });
  });

  return payment;
}

export async function updateVendorPaymentDraft(
  paymentId: string,
  input: {
    paymentDate?: Date;
    amountInPaise?: number;
    paymentMethod?: AccountingVendorPaymentMethod;
    utr?: string | null;
    bankAccountId?: string | null;
    notes?: string | null;
    allocations?: VendorPaymentAllocationInput[];
  }
) {
  const existing = await prisma.accountingVendorPayment.findUnique({
    where: { id: paymentId },
    include: { allocations: true }
  });
  if (!existing) throw new VendorPaymentNotFoundError(paymentId);
  if (existing.status !== "DRAFT") {
    throw new VendorPaymentImmutableError("edited");
  }

  const paymentDate = input.paymentDate ?? existing.paymentDate;
  const amountInPaise = input.amountInPaise ?? existing.amountInPaise;
  const paymentMethod = input.paymentMethod ?? existing.paymentMethod;
  const bankAccountId =
    input.bankAccountId !== undefined ? input.bankAccountId : existing.bankAccountId;
  const allocations =
    input.allocations ??
    existing.allocations.map((a) => ({
      vendorBillId: a.vendorBillId,
      amountInPaise: a.amountInPaise
    }));

  const { paidAccountCode, creditGlAccountCode, bankAccountId: resolvedBankId, utr } =
    await validatePaymentDraftInput({
    vendorId: existing.vendorId,
    paymentDate,
    amountInPaise,
    currency: existing.currency,
    paymentMethod,
    utr: input.utr !== undefined ? input.utr : existing.utr,
    bankAccountId,
    allocations,
    excludePaymentId: paymentId
  });

  const hash = fingerprintVendorPayment({
    vendorId: existing.vendorId,
    paymentDate: paymentDate.toISOString().slice(0, 10),
    amountInPaise,
    paymentMethod,
    paidAccountCode,
    bankAccountId: resolvedBankId,
    utr,
    allocations: allocations.map((a) => ({
      vendorBillId: a.vendorBillId,
      amountInPaise: a.amountInPaise
    }))
  });

  await prisma.$transaction(async (tx) => {
    await tx.accountingVendorPaymentAllocation.deleteMany({ where: { paymentId } });
    await tx.accountingVendorPayment.update({
      where: { id: paymentId },
      data: {
        paymentDate,
        amountInPaise,
        paymentMethod,
        paidAccountCode,
        bankAccountId: resolvedBankId,
        utr,
        notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        sourcePayloadHash: hash,
        allocations: {
          create: allocations.map((a) => ({
            vendorBillId: a.vendorBillId,
            amountInPaise: a.amountInPaise
          }))
        }
      }
    });
  });

  return prisma.accountingVendorPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { allocations: true, vendor: { select: { id: true, name: true } } }
  });
}

export async function deleteVendorPaymentDraft(paymentId: string) {
  const existing = await prisma.accountingVendorPayment.findUnique({ where: { id: paymentId } });
  if (!existing) throw new VendorPaymentNotFoundError(paymentId);
  if (existing.status === "POSTED") {
    throw new VendorPaymentImmutableError("deleted");
  }
  if (existing.status === "VOID") {
    throw new VendorPaymentNotEligibleError("Already VOID", "ALREADY_VOID");
  }
  await prisma.accountingVendorPayment.delete({ where: { id: paymentId } });
}

export async function listVendorPayments(opts: {
  vendorId?: string;
  status?: string;
  limit: number;
}) {
  return prisma.accountingVendorPayment.findMany({
    where: {
      ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
      ...(opts.status && opts.status !== "ALL"
        ? { status: opts.status as "DRAFT" | "POSTED" | "VOID" }
        : {})
    },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    take: opts.limit,
    include: {
      vendor: { select: { id: true, name: true } },
      allocations: true,
      journalEntry: { select: { entryNumber: true, status: true } }
    }
  });
}
