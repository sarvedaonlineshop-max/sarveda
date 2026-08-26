import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import { PreCutoverPostingBlockedError } from "../../src/modules/accounting/accounting-errors";
import {
  classifyCutover,
  getAccountingCutoverDate,
  resetAccountingCutoverCache
} from "../../src/modules/accounting/accounting-cutover";
import { computeApAgingBucket } from "../../src/modules/accounting/ap-aging";
import { assertEntryDateInOpenPeriod } from "../../src/modules/accounting/accounting-period.service";
import { ClosedAccountingPeriodError } from "../../src/modules/accounting/accounting-errors";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import {
  seedDefaultExpensePaymentMappings,
  upsertExpenseAccountMapping
} from "../../src/modules/accounting/expense-mapping.service";
import { postExpenseRecordedJournal } from "../../src/modules/accounting/expense-posting.service";
import { loadExpenseSnapshotById } from "../../src/modules/accounting/expense-snapshot.service";
import { postVendorBillPostedJournal } from "../../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../../src/modules/accounting/vendor-bill-snapshot.service";
import {
  buildPurchaseAccountingDashboard,
  buildPurchaseReconciliationReport,
  buildVendorPaymentReconciliationRow
} from "../../src/modules/accounting/purchase-reconciliation.service";
import { buildReconciliationV4BillRow, buildReconciliationV5ExpenseRow } from "../../src/modules/accounting/reconciliation.service";
import { postVendorPayment } from "../../src/modules/accounting/vendor-payment-posting.service";
import { createVendorPaymentDraft } from "../../src/modules/accounting/vendor-payment.service";
import { markBillPaid } from "../../src/modules/purchases/purchases.service";
import { cleanupAccountingTestData, getInventory, prisma } from "../helpers/commerce";
import {
  cleanupSyntheticVendorBill,
  createStockVariantForPurchase,
  createSyntheticVendor,
  createSyntheticVendorBill
} from "../helpers/accounting-purchases";

async function postApBill(opts: Parameters<typeof createSyntheticVendorBill>[0]) {
  const bill = await createSyntheticVendorBill(opts);
  const snap = await loadVendorBillSnapshotById(bill.id);
  await postVendorBillPostedJournal(snap, { forcePersist: true });
  return bill;
}

async function createExpense(opts: {
  vendorId?: string | null;
  expenseAccount?: string;
  amountInPaise?: number;
  expenseDate?: Date;
  invoiceNumber?: string | null;
}) {
  return prisma.expense.create({
    data: {
      expenseAccount: opts.expenseAccount ?? `TEST-ACC-EXP-Office-${randomUUID().slice(0, 6)}`,
      paidThrough: "Bank",
      amountInPaise: opts.amountInPaise ?? 10_000,
      taxInPaise: 0,
      taxInclusive: false,
      status: "RECORDED",
      vendorId: opts.vendorId ?? null,
      invoiceNumber: opts.invoiceNumber ?? null,
      expenseDate: opts.expenseDate ?? new Date(),
      expenseType: "SERVICES",
      destinationOfSupply: "Karnataka"
    }
  });
}

describe("Phase 3C3 purchase recon + cutover", () => {
  const billIds: string[] = [];
  const paymentIds: string[] = [];
  const expenseIds: string[] = [];
  const periodIds: string[] = [];

  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalPurchases = process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED;
  const originalVp = process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED;
  const originalExpense = process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED;
  const originalCutover = process.env.ACCOUNTING_CUTOVER_DATE;
  const originalForward = process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY;
  const originalSeller = process.env.SELLER_STATE;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
    await seedDefaultExpensePaymentMappings();
    await upsertExpenseAccountMapping({
      sourceName: "TEST-ACC-EXP-Office",
      accountingAccountCode: "5310"
    });
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    resetAccountingCutoverCache();
    delete process.env.ACCOUNTING_CUTOVER_DATE;
    delete process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY;
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
    await seedDefaultExpensePaymentMappings();
    await upsertExpenseAccountMapping({
      sourceName: "TEST-ACC-EXP-Office",
      accountingAccountCode: "5310"
    });
  });

  afterEach(async () => {
    for (const id of periodIds.splice(0)) {
      await prisma.accountingPeriod.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of paymentIds.splice(0)) {
      await prisma.accountingVendorPayment.deleteMany({ where: { id } }).catch(() => undefined);
    }
    for (const id of expenseIds.splice(0)) {
      await prisma.expense.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of billIds.splice(0)) {
      await cleanupSyntheticVendorBill(id);
    }
    resetAccountingCutoverCache();
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = originalPurchases ?? "0";
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = originalVp ?? "0";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = originalExpense ?? "0";
    if (originalCutover === undefined) delete process.env.ACCOUNTING_CUTOVER_DATE;
    else process.env.ACCOUNTING_CUTOVER_DATE = originalCutover;
    if (originalForward === undefined) delete process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY;
    else process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY = originalForward;
    if (originalSeller === undefined) delete process.env.SELLER_STATE;
    else process.env.SELLER_STATE = originalSeller;
    resetAccountingCutoverCache();
  });

  it("1. unpaid bill aging uses dueDate and native outstanding", async () => {
    const pastDue = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const bill = await postApBill({
      billDate: pastDue,
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await prisma.vendorBill.update({
      where: { id: bill.id },
      data: { dueDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) }
    });
    const recon = await buildReconciliationV4BillRow(bill.id);
    expect(recon.outstandingNativeApInPaise).toBeGreaterThan(0);
    expect(recon.agingBucket).toBe("31_60");
    expect(recon.overdue).toBe(true);
  });

  it("2–3. partial and full native payment aging", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, quantity: 1, rateInPaise: 20_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const half = Math.floor(bill.totalInPaise / 2);
    const partial = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: half,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-PARTIAL-001",
      allocations: [{ vendorBillId: bill.id, amountInPaise: half }]
    });
    paymentIds.push(partial.id);
    await postVendorPayment(partial.id, { forcePersist: true });
    const partialRecon = await buildReconciliationV4BillRow(bill.id);
    expect(partialRecon.status).toBe("PARTIALLY_PAID");
    expect(partialRecon.agingBucket).not.toBe("PAID");

    const rest = bill.totalInPaise - half;
    const full = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: rest,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-FULL-002",
      allocations: [{ vendorBillId: bill.id, amountInPaise: rest }]
    });
    paymentIds.push(full.id);
    await postVendorPayment(full.id, { forcePersist: true });
    const paidRecon = await buildReconciliationV4BillRow(bill.id);
    expect(paidRecon.status).toBe("PAID");
    expect(paidRecon.agingBucket).toBe("PAID");
    expect(paidRecon.outstandingNativeApInPaise).toBe(0);
  });

  it("4–5. multiple payments and one payment multiple bills", async () => {
    const b1 = await postApBill({
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    const b2 = await postApBill({
      vendorId: b1.vendorId,
      lines: [{ variantId: null, quantity: 1, rateInPaise: 15_000, taxClass: "gst18" }]
    });
    billIds.push(b1.id, b2.id);

    const p1 = await createVendorPaymentDraft({
      vendorId: b1.vendorId,
      paymentDate: new Date(),
      amountInPaise: b1.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-P1-001",
      allocations: [{ vendorBillId: b1.id, amountInPaise: b1.totalInPaise }]
    });
    paymentIds.push(p1.id);
    await postVendorPayment(p1.id, { forcePersist: true });

    const p2 = await createVendorPaymentDraft({
      vendorId: b1.vendorId,
      paymentDate: new Date(),
      amountInPaise: b2.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-P2-001",
      allocations: [{ vendorBillId: b2.id, amountInPaise: b2.totalInPaise }]
    });
    paymentIds.push(p2.id);
    await postVendorPayment(p2.id, { forcePersist: true });

    const b3 = await postApBill({
      vendorId: b1.vendorId,
      lines: [{ variantId: null, quantity: 1, rateInPaise: 8_000, taxClass: "gst18" }]
    });
    const b4 = await postApBill({
      vendorId: b1.vendorId,
      lines: [{ variantId: null, quantity: 1, rateInPaise: 12_000, taxClass: "gst18" }]
    });
    billIds.push(b3.id, b4.id);
    const combo = await createVendorPaymentDraft({
      vendorId: b1.vendorId,
      paymentDate: new Date(),
      amountInPaise: b3.totalInPaise + b4.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-COMBO-001",
      allocations: [
        { vendorBillId: b3.id, amountInPaise: b3.totalInPaise },
        { vendorBillId: b4.id, amountInPaise: b4.totalInPaise }
      ]
    });
    paymentIds.push(combo.id);
    await postVendorPayment(combo.id, { forcePersist: true });
    const row = await buildVendorPaymentReconciliationRow(combo.id);
    expect(row.allocations).toHaveLength(2);
    expect(row.status).toBe("MATCHED");
  });

  it("6–7. ops paid / partial vs native", async () => {
    const full = await postApBill({
      status: "PAID",
      paidInPaise: undefined,
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(full.id);
    const fullRecon = await buildReconciliationV4BillRow(full.id);
    expect(fullRecon.status).toBe("OPS_PAID_NATIVE_UNPAID");
    expect(fullRecon.nativeVendorPaymentInPaise).toBe(0);
    expect(fullRecon.opsPaidExplanation).toContain("not financial authority");

    const partialBill = await postApBill({
      status: "OPEN",
      paidInPaise: 3_000,
      lines: [{ variantId: null, quantity: 1, rateInPaise: 20_000, taxClass: "gst18" }]
    });
    billIds.push(partialBill.id);
    await markBillPaid(partialBill.id, 3_000);
    const partialRecon = await buildReconciliationV4BillRow(partialBill.id);
    expect(partialRecon.status).toBe("OPS_PARTIAL_NATIVE_UNPAID");
  });

  it("8–11. pre/post cutover classification for bills and expenses", async () => {
    process.env.ACCOUNTING_CUTOVER_DATE = "2026-06-01T00:00:00.000Z";
    resetAccountingCutoverCache();

    const preBill = await createSyntheticVendorBill({
      billDate: new Date("2026-05-15T12:00:00.000Z"),
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(preBill.id);
    const postBill = await createSyntheticVendorBill({
      billDate: new Date("2026-06-15T12:00:00.000Z"),
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(postBill.id);

    const preRecon = await buildReconciliationV4BillRow(preBill.id);
    const postRecon = await buildReconciliationV4BillRow(postBill.id);
    expect(preRecon.cutoverClassification).toBe("PRE_CUTOVER");
    expect(postRecon.cutoverClassification).toBe("POST_CUTOVER");

    const preExp = await createExpense({
      expenseAccount: "TEST-ACC-EXP-Office",
      expenseDate: new Date("2026-05-20T12:00:00.000Z")
    });
    const postExp = await createExpense({
      expenseAccount: "TEST-ACC-EXP-Office",
      expenseDate: new Date("2026-06-20T12:00:00.000Z")
    });
    expenseIds.push(preExp.id, postExp.id);

    const preExpRecon = await buildReconciliationV5ExpenseRow(preExp.id);
    const postExpRecon = await buildReconciliationV5ExpenseRow(postExp.id);
    expect(preExpRecon.cutoverClassification).toBe("PRE_CUTOVER");
    expect(preExpRecon.historicalClassification).toBe("PRE_CUTOVER");
    expect(postExpRecon.cutoverClassification).toBe("POST_CUTOVER");
  });

  it("12. duplicate bill+expense surfaced on both sides", async () => {
    const vendor = await createSyntheticVendor();
    const ref = `DUP-${randomUUID().slice(0, 8)}`;
    const bill = await postApBill({
      vendorId: vendor.id,
      referenceNumber: ref,
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst-zero-rate" }]
    });
    billIds.push(bill.id);
    const expense = await createExpense({
      vendorId: vendor.id,
      expenseAccount: "TEST-ACC-EXP-Office",
      amountInPaise: 10_000,
      invoiceNumber: ref
    });
    expenseIds.push(expense.id);
    const billRecon = await buildReconciliationV4BillRow(bill.id);
    const expRecon = await buildReconciliationV5ExpenseRow(expense.id);
    expect(billRecon.billExpenseDuplicateClass).toBe("DUPLICATE_SUPPLIER_DOCUMENT");
    expect(expRecon.duplicateClass).toBe("DUPLICATE_SUPPLIER_DOCUMENT");
  });

  it("13–14. unmapped expense and GST data gap classification", async () => {
    const unmapped = await createExpense({ expenseAccount: "UNKNOWN-ACCOUNT-XYZ" });
    expenseIds.push(unmapped.id);
    const unmappedRecon = await buildReconciliationV5ExpenseRow(unmapped.id);
    expect(unmappedRecon.historicalClassification).toBe("NEEDS_ACCOUNT_MAPPING");

    const gstGap = await createExpense({
      expenseAccount: "TEST-ACC-EXP-Office",
      amountInPaise: 11_800,
      vendorId: (await createSyntheticVendor()).id
    });
    expenseIds.push(gstGap.id);
    await prisma.expense.update({
      where: { id: gstGap.id },
      data: { taxInPaise: 1_800, sourceOfSupply: null, destinationOfSupply: null }
    });
    const gapRecon = await buildReconciliationV5ExpenseRow(gstGap.id);
    expect(["GST_DATA_GAP", "DATA_GAP"]).toContain(gapRecon.status);
  });

  it("16–17. closed period and cutover forward-only posting guard", async () => {
    const closedStart = new Date("2026-01-01T00:00:00.000Z");
    const closedEnd = new Date("2026-12-31T23:59:59.999Z");
    const period = await prisma.accountingPeriod.create({
      data: {
        name: "TEST-CLOSED-2026",
        startDate: closedStart,
        endDate: closedEnd,
        status: "CLOSED"
      }
    });
    periodIds.push(period.id);
    await expect(assertEntryDateInOpenPeriod(new Date("2026-06-15"))).rejects.toBeInstanceOf(
      ClosedAccountingPeriodError
    );
    await prisma.accountingPeriod.delete({ where: { id: period.id } });
    periodIds.pop();

    process.env.ACCOUNTING_CUTOVER_DATE = "2026-08-01T00:00:00.000Z";
    process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY = "1";
    resetAccountingCutoverCache();
    const preBill = await createSyntheticVendorBill({
      billDate: new Date("2026-07-01T12:00:00.000Z"),
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(preBill.id);
    const snap = await loadVendorBillSnapshotById(preBill.id);
    await expect(postVendorBillPostedJournal(snap, { forcePersist: true })).rejects.toBeInstanceOf(
      PreCutoverPostingBlockedError
    );
    await expect(
      postVendorBillPostedJournal(snap, { forcePersist: true, allowPreCutover: true })
    ).resolves.toBeDefined();

    expect(classifyCutover(new Date("2026-07-31T23:59:59.999Z"))).toBe("PRE_CUTOVER");
    expect(classifyCutover(new Date("2026-08-01T00:00:00.000Z"))).toBe("POST_CUTOVER");
    expect(getAccountingCutoverDate()?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("18–20. dashboard outstanding and aging totals", async () => {
    const b1 = await postApBill({
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    const b2 = await postApBill({
      lines: [{ variantId: null, quantity: 1, rateInPaise: 20_000, taxClass: "gst18" }]
    });
    billIds.push(b1.id, b2.id);
    const dash = await buildPurchaseAccountingDashboard({ billLimit: 50, expenseLimit: 50 });
    expect(dash.vendorBills.totalNativeApRecognizedInPaise).toBeGreaterThanOrEqual(
      b1.totalInPaise + b2.totalInPaise
    );
    expect(dash.vendorBills.totalNativeOutstandingInPaise).toBeGreaterThan(0);

    const report = await buildPurchaseReconciliationReport({
      billIds: [b1.id, b2.id],
      expenseIds: [],
      paymentIds: []
    });
    expect(report.version).toBe("purchase-recon-v5");
    expect(report.bills).toHaveLength(2);
  });

  it("21–22. no fabricated VendorPayment or bank journal from ops paid", async () => {
    const bill = await postApBill({
      status: "PAID",
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const payments = await prisma.accountingVendorPayment.count({
      where: { vendorId: bill.vendorId }
    });
    expect(payments).toBe(0);
    const bankLines = await prisma.accountingJournalLine.count({
      where: { account: { code: { in: ["1010", "1000"] } } }
    });
    expect(bankLines).toBe(0);
  });

  it("23–24. mark paid unchanged; posting does not mutate inventory", async () => {
    const stock = await createStockVariantForPurchase();
    const onHandBefore = (await getInventory(stock.variantId))!.onHand;
    const bill = await postApBill({
      lines: [{ variantId: stock.variantId, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await markBillPaid(bill.id, bill.totalInPaise);
    const updated = await prisma.vendorBill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(updated.paidInPaise).toBe(bill.totalInPaise);
    expect(updated.status).toBe("PAID");
    const onHandAfter = (await getInventory(stock.variantId))!.onHand;
    expect(onHandAfter).toBe(onHandBefore);
  });

  it("aging bucket helper: CURRENT when not past due", () => {
    const bucket = computeApAgingBucket({
      outstandingNativeApInPaise: 1000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      billDate: new Date()
    });
    expect(bucket).toBe("CURRENT");
  });
});
