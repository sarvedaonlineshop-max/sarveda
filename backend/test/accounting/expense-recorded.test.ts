import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import {
  AccountingExpensePostingDisabledError,
  ExpenseNotEligibleForPostingError
} from "../../src/modules/accounting/accounting-errors";
import {
  assertBulkDiscoveryAllowed,
  assertExpensePostingPersistenceAllowed
} from "../../src/modules/accounting/production-guard";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { EXPENSE_DOCUMENT_TYPE, EXPENSE_RECORDED_EVENT_TYPE } from "../../src/modules/accounting/expense.constants";
import { buildExpenseRecordedJournal } from "../../src/modules/accounting/expense-journal.builder";
import {
  seedDefaultExpensePaymentMappings,
  setExpenseAccountMappingActive,
  upsertExpenseAccountMapping,
  upsertExpensePaymentMapping
} from "../../src/modules/accounting/expense-mapping.service";
import {
  postExpenseById,
  previewExpenseById
} from "../../src/modules/accounting/expense-posting.service";
import { loadExpenseSnapshotById } from "../../src/modules/accounting/expense-snapshot.service";
import { buildReconciliationV5ExpenseRow } from "../../src/modules/accounting/reconciliation.service";
import { createSyntheticVendor, createSyntheticVendorBill } from "../helpers/accounting-purchases";
import { cleanupAccountingTestData, getInventory, prisma } from "../helpers/commerce";
import { createStockVariantForPurchase } from "../helpers/accounting-purchases";

async function createExpense(opts: {
  expenseAccount?: string;
  paidThrough?: string | null;
  amountInPaise?: number;
  taxInPaise?: number;
  taxInclusive?: boolean;
  status?: "DRAFT" | "RECORDED";
  vendorId?: string | null;
  invoiceNumber?: string | null;
  referenceNumber?: string | null;
  reverseCharge?: boolean;
  sourceOfSupply?: string | null;
  destinationOfSupply?: string | null;
  currency?: string;
  expenseDate?: Date;
}) {
  return prisma.expense.create({
    data: {
      expenseAccount: opts.expenseAccount ?? `TEST-ACC-EXP-Office-${randomUUID().slice(0, 6)}`,
      paidThrough: opts.paidThrough === undefined ? "Bank" : opts.paidThrough,
      amountInPaise: opts.amountInPaise ?? 10_000,
      taxInPaise: opts.taxInPaise ?? 0,
      taxInclusive: opts.taxInclusive ?? false,
      status: opts.status ?? "RECORDED",
      vendorId: opts.vendorId ?? null,
      invoiceNumber: opts.invoiceNumber ?? null,
      referenceNumber: opts.referenceNumber ?? null,
      reverseCharge: opts.reverseCharge ?? false,
      sourceOfSupply: opts.sourceOfSupply ?? null,
      destinationOfSupply: opts.destinationOfSupply ?? "Karnataka",
      currency: opts.currency ?? "INR",
      expenseDate: opts.expenseDate ?? new Date(),
      expenseType: "SERVICES"
    }
  });
}

describe("EXPENSE_RECORDED_V1", () => {
  const expenseIds: string[] = [];
  const billIds: string[] = [];
  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalExpense = process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED;
  const originalSeller = process.env.SELLER_STATE;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
    await seedDefaultExpensePaymentMappings();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
    await seedDefaultExpensePaymentMappings();
    await upsertExpenseAccountMapping({
      sourceName: "Office Supplies",
      accountingAccountCode: "5310"
    });
    await upsertExpenseAccountMapping({
      sourceName: "Professional Fees",
      accountingAccountCode: "5320"
    });
  });

  afterEach(async () => {
    if (expenseIds.length) {
      await prisma.expense.deleteMany({ where: { id: { in: expenseIds.splice(0) } } });
    }
    for (const id of billIds.splice(0)) {
      await prisma.vendorBillLine.deleteMany({ where: { billId: id } });
      await prisma.vendorBill.deleteMany({ where: { id } });
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = originalExpense ?? "0";
    if (originalSeller === undefined) delete process.env.SELLER_STATE;
    else process.env.SELLER_STATE = originalSeller;
  });

  it("1-3. mapped non-tax bank / cash / UPI", async () => {
    for (const [paid, credit] of [
      ["Bank", "1010"],
      ["Cash", "1000"],
      ["UPI", "1010"]
    ] as const) {
      const e = await createExpense({
        expenseAccount: "Office Supplies",
        paidThrough: paid,
        amountInPaise: 5_000
      });
      expenseIds.push(e.id);
      const post = await postExpenseById(e.id);
      expect(post.proposal.lines.find((l) => l.creditInPaise > 0)?.accountCode).toBe(credit);
      expect(post.proposal.lines.find((l) => l.debitInPaise > 0)?.accountCode).toBe("5310");
    }
  });

  it("4-5. unmapped expense / payment blocked", async () => {
    const e1 = await createExpense({
      expenseAccount: "Unmapped Weird Category XYZ",
      paidThrough: "Bank"
    });
    expenseIds.push(e1.id);
    await expect(postExpenseById(e1.id)).rejects.toMatchObject({ code: "EXPENSE_ACCOUNT_UNMAPPED" });

    const e2 = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Mystery Wallet"
    });
    expenseIds.push(e2.id);
    await expect(postExpenseById(e2.id)).rejects.toMatchObject({ code: "PAYMENT_ACCOUNT_UNMAPPED" });
  });

  it("6-7. tax-exclusive and tax-inclusive amount semantics", async () => {
    const excl = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      amountInPaise: 10_000,
      taxInPaise: 1_800,
      taxInclusive: false,
      vendorId: (await createSyntheticVendor()).id,
      invoiceNumber: `INV-EX-${randomUUID().slice(0, 6)}`,
      sourceOfSupply: "Karnataka",
      destinationOfSupply: "Karnataka"
    });
    expenseIds.push(excl.id);
    const p1 = await postExpenseById(excl.id);
    expect(p1.proposal.diagnostics.amount.grossPaymentInPaise).toBe(11_800);
    expect(p1.proposal.diagnostics.amount.netExpenseInPaise).toBe(10_000);

    const vendor = await createSyntheticVendor();
    const incl = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      amountInPaise: 11_800,
      taxInPaise: 1_800,
      taxInclusive: true,
      vendorId: vendor.id,
      invoiceNumber: `INV-IN-${randomUUID().slice(0, 6)}`,
      sourceOfSupply: "Karnataka",
      destinationOfSupply: "Karnataka"
    });
    expenseIds.push(incl.id);
    const p2 = await postExpenseById(incl.id);
    expect(p2.proposal.diagnostics.amount.netExpenseInPaise).toBe(10_000);
    expect(p2.proposal.diagnostics.amount.grossPaymentInPaise).toBe(11_800);
  });

  it("8-10. intra / interstate / no-GST", async () => {
    const vIntra = await createSyntheticVendor({ billingState: "Karnataka" });
    const intra = await createExpense({
      expenseAccount: "Professional Fees",
      paidThrough: "Bank",
      amountInPaise: 10_000,
      taxInPaise: 1_800,
      vendorId: vIntra.id,
      invoiceNumber: "INV-INTRA-1",
      sourceOfSupply: "Karnataka",
      destinationOfSupply: "Karnataka"
    });
    expenseIds.push(intra.id);
    const pIntra = await postExpenseById(intra.id);
    expect(pIntra.proposal.diagnostics.gst.jurisdiction).toBe("INTRA_STATE");
    expect(pIntra.proposal.lines.some((l) => l.accountCode === "2200")).toBe(true);

    const vInter = await createSyntheticVendor({ billingState: "Maharashtra", gstin: "27AAAAA0000A1Z5" });
    const inter = await createExpense({
      expenseAccount: "Professional Fees",
      paidThrough: "Bank",
      amountInPaise: 10_000,
      taxInPaise: 1_800,
      vendorId: vInter.id,
      invoiceNumber: "INV-INTER-1",
      sourceOfSupply: "Maharashtra",
      destinationOfSupply: "Karnataka"
    });
    expenseIds.push(inter.id);
    const pInter = await postExpenseById(inter.id);
    expect(pInter.proposal.diagnostics.gst.jurisdiction).toBe("INTER_STATE");
    expect(pInter.proposal.lines.some((l) => l.accountCode === "2202")).toBe(true);

    const none = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Cash",
      amountInPaise: 2_000,
      taxInPaise: 0
    });
    expenseIds.push(none.id);
    const pNone = await postExpenseById(none.id);
    expect(pNone.proposal.diagnostics.gst.jurisdiction).toBe("NONE");
  });

  it("11-13. GST gap / jurisdiction / RCM blocked", async () => {
    const missing = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      amountInPaise: 10_000,
      taxInPaise: 1_800,
      invoiceNumber: null,
      referenceNumber: null
    });
    expenseIds.push(missing.id);
    await expect(postExpenseById(missing.id)).rejects.toMatchObject({ code: "GST_DATA_GAP" });

    const rcm = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      reverseCharge: true
    });
    expenseIds.push(rcm.id);
    await expect(postExpenseById(rcm.id)).rejects.toMatchObject({ code: "RCM_DATA_GAP" });
  });

  it("14-15. DRAFT blocked; RECORDED posts", async () => {
    const draft = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      status: "DRAFT"
    });
    expenseIds.push(draft.id);
    await expect(postExpenseById(draft.id)).rejects.toMatchObject({ code: "DRAFT" });

    const rec = await createExpense({ expenseAccount: "Office Supplies", paidThrough: "Bank" });
    expenseIds.push(rec.id);
    const post = await postExpenseById(rec.id);
    expect(post.duplicate).toBe(false);
  });

  it("16-17. duplicate / 20 concurrent posts → 1 journal", async () => {
    const e = await createExpense({ expenseAccount: "Office Supplies", paidThrough: "Bank" });
    expenseIds.push(e.id);
    const results = await Promise.all(Array.from({ length: 20 }, () => postExpenseById(e.id)));
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    const events = await prisma.accountingPostingEvent.findMany({
      where: { eventType: EXPENSE_RECORDED_EVENT_TYPE, sourceId: e.id }
    });
    expect(events).toHaveLength(1);
  });

  it("18. source changed after post", async () => {
    const e = await createExpense({ expenseAccount: "Office Supplies", paidThrough: "Bank" });
    expenseIds.push(e.id);
    await postExpenseById(e.id);
    await prisma.expense.update({ where: { id: e.id }, data: { amountInPaise: 12_000 } });
    const preview = await previewExpenseById(e.id);
    expect(preview.sourceChangedAfterPost).toBe(true);
  });

  it("19-22. bill duplicate high/possible/different vendor/different invoice", async () => {
    const vendor = await createSyntheticVendor();
    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      referenceNumber: "SUP-DUP-001",
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);

    const high = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      vendorId: vendor.id,
      invoiceNumber: "SUP-DUP-001",
      amountInPaise: bill.totalInPaise,
      taxInPaise: 0,
      taxInclusive: true
    });
    expenseIds.push(high.id);
    await expect(postExpenseById(high.id)).rejects.toMatchObject({ code: "DUPLICATE_RISK" });

    const possible = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      vendorId: vendor.id,
      invoiceNumber: "SUP-DUP-001",
      amountInPaise: bill.totalInPaise + 500,
      taxInPaise: 0,
      taxInclusive: true
    });
    expenseIds.push(possible.id);
    const prev = await previewExpenseById(possible.id);
    expect(prev.duplicate.classification).toBe("POSSIBLE_DUPLICATE_BILL_EXPENSE");
    await expect(postExpenseById(possible.id)).rejects.toBeInstanceOf(ExpenseNotEligibleForPostingError);
    const ack = await postExpenseById(possible.id, { acknowledgePossibleDuplicate: true });
    expect(ack.duplicate).toBe(false);

    const otherVendor = await createSyntheticVendor();
    const okDiffVendor = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      vendorId: otherVendor.id,
      invoiceNumber: "SUP-DUP-001",
      amountInPaise: bill.totalInPaise,
      taxInclusive: true
    });
    expenseIds.push(okDiffVendor.id);
    expect((await postExpenseById(okDiffVendor.id)).duplicate).toBe(false);

    const okDiffInv = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      vendorId: vendor.id,
      invoiceNumber: "SUP-OTHER-999",
      amountInPaise: 3_000
    });
    expenseIds.push(okDiffInv.id);
    expect((await postExpenseById(okDiffInv.id)).duplicate).toBe(false);
  });

  it("26. closed period", async () => {
    await prisma.accountingPeriod.create({
      data: {
        name: "2019-01",
        startDate: new Date("2019-01-01"),
        endDate: new Date("2019-01-31"),
        status: "CLOSED"
      }
    });
    const e = await createExpense({
      expenseAccount: "Office Supplies",
      paidThrough: "Bank",
      expenseDate: new Date("2019-01-15")
    });
    expenseIds.push(e.id);
    await expect(postExpenseById(e.id)).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_CLOSED" });
  });

  it("27-29. feature flag / production dual / bulk guard", async () => {
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "0";
    expect(() => assertExpensePostingPersistenceAllowed()).toThrow(AccountingExpensePostingDisabledError);
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";

    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertExpensePostingPersistenceAllowed()).toThrow();
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db";

    expect(() =>
      assertBulkDiscoveryAllowed({
        expenseId: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        dryRun: true,
        persist: false
      })
    ).not.toThrow();
  });

  it("30-33. document link, recon, mapping disable", async () => {
    const e = await createExpense({ expenseAccount: "Office Supplies", paidThrough: "Bank" });
    expenseIds.push(e.id);
    const post = await postExpenseById(e.id);
    const links = await prisma.accountingDocumentLink.findMany({
      where: { journalEntryId: post.journal.id }
    });
    expect(links.some((l) => l.documentType === EXPENSE_DOCUMENT_TYPE)).toBe(true);

    const recon = await buildReconciliationV5ExpenseRow(e.id);
    expect(recon.status).toBe("POSTED");

    const map = await upsertExpenseAccountMapping({
      sourceName: "Temp Disable Map",
      accountingAccountCode: "5380"
    });
    await setExpenseAccountMappingActive(map.id, false);
    const blocked = await createExpense({
      expenseAccount: "Temp Disable Map",
      paidThrough: "Bank"
    });
    expenseIds.push(blocked.id);
    await expect(postExpenseById(blocked.id)).rejects.toMatchObject({ code: "EXPENSE_ACCOUNT_UNMAPPED" });
  });

  it("34-37. no inventory / bill / payment mutation; expense CRUD untouched", async () => {
    const stock = await createStockVariantForPurchase();
    const beforeInv = await getInventory(stock.variantId);
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, quantity: 1, rateInPaise: 1_000, taxClass: "gst-zero-rate" }]
    });
    billIds.push(bill.id);
    const beforeBill = await prisma.vendorBill.findUniqueOrThrow({ where: { id: bill.id } });
    const beforePayments = await prisma.accountingVendorPayment.count();

    const e = await createExpense({ expenseAccount: "Office Supplies", paidThrough: "Cash" });
    expenseIds.push(e.id);
    await postExpenseById(e.id);

    expect((await getInventory(stock.variantId))?.onHand).toBe(beforeInv?.onHand);
    const afterBill = await prisma.vendorBill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(afterBill.paidInPaise).toBe(beforeBill.paidInPaise);
    expect(afterBill.status).toBe(beforeBill.status);
    expect(await prisma.accountingVendorPayment.count()).toBe(beforePayments);

    // Expense update still works (purchases CRUD)
    await prisma.expense.update({ where: { id: e.id }, data: { notes: "ops note" } });
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: e.id } })).notes).toBe("ops note");
  });

  it("builder pure no DB for mapped snapshot", async () => {
    const e = await createExpense({ expenseAccount: "Office Supplies", paidThrough: "Bank" });
    expenseIds.push(e.id);
    const snap = await loadExpenseSnapshotById(e.id);
    const proposal = buildExpenseRecordedJournal(snap, {
      duplicateClass: "NO_DUPLICATE",
      failOnGstGap: false
    });
    expect(proposal.balanced).toBe(true);
    expect(proposal.calcVersion).toBe("EXPENSE_RECORDED_V1");
  });
});
