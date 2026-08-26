import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingVendorPaymentPostingDisabledError,
  VendorPaymentImmutableError,
  VendorPaymentNotEligibleError
} from "../../src/modules/accounting/accounting-errors";
import { assertVendorPaymentPostingPersistenceAllowed } from "../../src/modules/accounting/production-guard";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { postVendorBillPostedJournal } from "../../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../../src/modules/accounting/vendor-bill-snapshot.service";
import {
  VENDOR_PAYMENT_ACCOUNT,
  VENDOR_PAYMENT_DOCUMENT_TYPE,
  VENDOR_PAYMENT_MADE_EVENT_TYPE
} from "../../src/modules/accounting/vendor-payment.constants";
import { VENDOR_BILL_DOCUMENT_TYPE } from "../../src/modules/accounting/vendor-bill.constants";
import { buildVendorPaymentMadeJournal } from "../../src/modules/accounting/vendor-payment-journal.builder";
import {
  getNativeBillOutstanding,
  listOpenBillsWithNativeOutstanding
} from "../../src/modules/accounting/vendor-payment-outstanding";
import {
  createVendorPaymentDraft,
  deleteVendorPaymentDraft,
  loadVendorPaymentSnapshot,
  updateVendorPaymentDraft
} from "../../src/modules/accounting/vendor-payment.service";
import {
  postVendorPayment,
  previewVendorPayment
} from "../../src/modules/accounting/vendor-payment-posting.service";
import { buildReconciliationV4BillRow } from "../../src/modules/accounting/reconciliation.service";
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

describe("VENDOR_PAYMENT_MADE_V1", () => {
  const billIds: string[] = [];
  const paymentIds: string[] = [];
  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalPurchases = process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED;
  const originalVp = process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED;
  const originalSeller = process.env.SELLER_STATE;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
  });

  afterEach(async () => {
    for (const id of paymentIds.splice(0)) {
      await prisma.accountingVendorPayment.deleteMany({ where: { id } }).catch(() => undefined);
    }
    for (const id of billIds.splice(0)) {
      await cleanupSyntheticVendorBill(id);
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = originalPurchases ?? "0";
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = originalVp ?? "0";
    if (originalSeller === undefined) delete process.env.SELLER_STATE;
    else process.env.SELLER_STATE = originalSeller;
  });

  it("1. one payment → one bill full settle", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-FULL-001",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    const post = await postVendorPayment(draft.id);
    expect(post.duplicate).toBe(false);
    expect(post.proposal.lines.find((l) => l.accountCode === "2000")?.debitInPaise).toBe(bill.totalInPaise);
    expect(post.proposal.lines.find((l) => l.accountCode === "1010")?.creditInPaise).toBe(bill.totalInPaise);
    const o = await getNativeBillOutstanding(bill.id);
    expect(o.outstandingInPaise).toBe(0);
  });

  it("2. partial payment leaves outstanding", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 20_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const half = Math.floor(bill.totalInPaise / 2);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: half,
      paymentMethod: "UPI",
      utr: "UPI-PART-1",
      allocations: [{ vendorBillId: bill.id, amountInPaise: half }]
    });
    paymentIds.push(draft.id);
    await postVendorPayment(draft.id);
    const o = await getNativeBillOutstanding(bill.id);
    expect(o.outstandingInPaise).toBe(bill.totalInPaise - half);
    expect(o.allocatedInPaise).toBe(half);
  });

  it("3. one payment → multiple bills", async () => {
    const vendor = await createSyntheticVendor({ name: "TEST-ACC-VPAY-MULTI-BILL" });
    const b1 = await postApBill({
      vendorId: vendor.id,
      lines: [{ variantId: null, itemName: "A", quantity: 1, rateInPaise: 5_000, taxClass: "gst18" }]
    });
    const b2 = await postApBill({
      vendorId: vendor.id,
      lines: [{ variantId: null, itemName: "B", quantity: 1, rateInPaise: 7_000, taxClass: "gst18" }]
    });
    billIds.push(b1.id, b2.id);
    const amount = b1.totalInPaise + b2.totalInPaise;
    const draft = await createVendorPaymentDraft({
      vendorId: vendor.id,
      paymentDate: new Date(),
      amountInPaise: amount,
      paymentMethod: "CHEQUE",
      utr: "CHQ-99",
      allocations: [
        { vendorBillId: b1.id, amountInPaise: b1.totalInPaise },
        { vendorBillId: b2.id, amountInPaise: b2.totalInPaise }
      ]
    });
    paymentIds.push(draft.id);
    const post = await postVendorPayment(draft.id);
    expect(post.journal.totalDebitInPaise).toBe(amount);
    expect((await getNativeBillOutstanding(b1.id)).outstandingInPaise).toBe(0);
    expect((await getNativeBillOutstanding(b2.id)).outstandingInPaise).toBe(0);
  });

  it("4. multiple payments → one bill", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 30_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const a1 = Math.floor(bill.totalInPaise / 3);
    const a2 = bill.totalInPaise - a1;
    const d1 = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: a1,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-M1",
      allocations: [{ vendorBillId: bill.id, amountInPaise: a1 }]
    });
    paymentIds.push(d1.id);
    await postVendorPayment(d1.id);
    const d2 = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: a2,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-M2",
      allocations: [{ vendorBillId: bill.id, amountInPaise: a2 }]
    });
    paymentIds.push(d2.id);
    await postVendorPayment(d2.id);
    expect((await getNativeBillOutstanding(bill.id)).outstandingInPaise).toBe(0);
  });

  it("5. over-allocation blocked", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 8_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await expect(
      createVendorPaymentDraft({
        vendorId: bill.vendorId,
        paymentDate: new Date(),
        amountInPaise: bill.totalInPaise + 1,
        paymentMethod: "BANK_TRANSFER",
        utr: "UTR-OVER",
        allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise + 1 }]
      })
    ).rejects.toMatchObject({ code: "OVER_ALLOCATION" });
  });

  it("6-7. payment amount must equal allocations", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 8_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await expect(
      createVendorPaymentDraft({
        vendorId: bill.vendorId,
        paymentDate: new Date(),
        amountInPaise: bill.totalInPaise,
        paymentMethod: "BANK_TRANSFER",
        utr: "UTR-MIS",
        allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise - 100 }]
      })
    ).rejects.toMatchObject({ code: "ALLOCATION_AMOUNT_MISMATCH" });
  });

  it("8. wrong vendor bill blocked", async () => {
    const v1 = await createSyntheticVendor();
    const v2 = await createSyntheticVendor();
    const bill = await postApBill({
      vendorId: v2.id,
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 5_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await expect(
      createVendorPaymentDraft({
        vendorId: v1.id,
        paymentDate: new Date(),
        amountInPaise: bill.totalInPaise,
        paymentMethod: "BANK_TRANSFER",
        utr: "UTR-WV",
        allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
      })
    ).rejects.toMatchObject({ code: "WRONG_VENDOR" });
  });

  it("9. bill with no native AP journal blocked", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 5_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await expect(
      createVendorPaymentDraft({
        vendorId: bill.vendorId,
        paymentDate: new Date(),
        amountInPaise: bill.totalInPaise,
        paymentMethod: "BANK_TRANSFER",
        utr: "UTR-NOAP",
        allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
      })
    ).rejects.toMatchObject({ code: "MISSING_AP_JOURNAL" });
  });

  it.each([
    ["BANK_TRANSFER", "1010"] as const,
    ["UPI", "1010"] as const,
    ["CHEQUE", "1010"] as const,
    ["CASH", "1000"] as const
  ])("10-13. %s credits %s", async (method, account) => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 4_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: method,
      utr: method === "CASH" ? null : `UTR-${method}`,
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    const snap = await loadVendorPaymentSnapshot(draft.id);
    const proposal = buildVendorPaymentMadeJournal(snap);
    expect(proposal.lines.find((l) => l.creditInPaise > 0)?.accountCode).toBe(account);
    expect(account === "1010" ? VENDOR_PAYMENT_ACCOUNT.BANK : VENDOR_PAYMENT_ACCOUNT.CASH).toBe(account);
  });

  it("14-15. payment numbers unique under concurrency", async () => {
    const vendor = await createSyntheticVendor({ name: "TEST-ACC-VPAY-NUM" });
    const bills = [];
    for (let i = 0; i < 20; i++) {
      const b = await postApBill({
        vendorId: vendor.id,
        lines: [{ variantId: null, itemName: `L${i}`, quantity: 1, rateInPaise: 1_000, taxClass: "gst18" }]
      });
      billIds.push(b.id);
      bills.push(b);
    }
    const created = await Promise.all(
      bills.map((b) =>
        createVendorPaymentDraft({
          vendorId: vendor.id,
          paymentDate: new Date(),
          amountInPaise: b.totalInPaise,
          paymentMethod: "BANK_TRANSFER",
          utr: `UTR-NUM-${b.id.slice(0, 8)}`,
          allocations: [{ vendorBillId: b.id, amountInPaise: b.totalInPaise }]
        })
      )
    );
    paymentIds.push(...created.map((c) => c.id));
    const numbers = created.map((c) => c.paymentNumber);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers.every((n) => /^VP-\d{6}-\d{5}$/.test(n))).toBe(true);
  });

  it("16-17. duplicate / concurrent post → one event/journal", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 6_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-IDEM",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => postVendorPayment(draft.id))
    );
    const created = results.filter((r) => !r.duplicate);
    expect(created.length).toBe(1);
    const events = await prisma.accountingPostingEvent.findMany({
      where: { eventType: VENDOR_PAYMENT_MADE_EVENT_TYPE, sourceId: draft.id }
    });
    expect(events).toHaveLength(1);
    const journals = await prisma.accountingJournalEntry.findMany({
      where: { id: events[0]!.journalEntryId! }
    });
    expect(journals).toHaveLength(1);
  });

  it("18. closed period rejects post", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 5_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const paymentDate = new Date("2020-01-15T00:00:00.000Z");
    await prisma.accountingPeriod.create({
      data: {
        name: "2020-01",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2020-01-31"),
        status: "CLOSED"
      }
    });
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate,
      amountInPaise: bill.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-CLOSED",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    await expect(postVendorPayment(draft.id)).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_CLOSED" });
  });

  it("19-21. DRAFT editable; POSTED immutable; delete blocked", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 9_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-EDIT",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    await updateVendorPaymentDraft(draft.id, { utr: "UTR-EDIT-2" });
    await postVendorPayment(draft.id);
    await expect(updateVendorPaymentDraft(draft.id, { utr: "X" })).rejects.toBeInstanceOf(
      VendorPaymentImmutableError
    );
    await expect(deleteVendorPaymentDraft(draft.id)).rejects.toBeInstanceOf(VendorPaymentImmutableError);
  });

  it("22. Mark paid alone creates no payment journal", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 5_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await markBillPaid(bill.id, bill.totalInPaise);
    const payments = await prisma.accountingVendorPayment.count();
    const events = await prisma.accountingPostingEvent.count({
      where: { eventType: VENDOR_PAYMENT_MADE_EVENT_TYPE }
    });
    expect(payments).toBe(0);
    expect(events).toBe(0);
    const recon = await buildReconciliationV4BillRow(bill.id);
    expect(recon.status).toBe("OPS_PAID_NATIVE_UNPAID");
  });

  it("23. historical PAID bill fabricates no payment", async () => {
    const bill = await createSyntheticVendorBill({
      status: "PAID",
      paidInPaise: 11_800,
      lines: [{ variantId: null, itemName: "Legacy", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    expect(await prisma.accountingVendorPayment.count()).toBe(0);
    const open = await listOpenBillsWithNativeOutstanding(bill.vendorId);
    expect(open.find((b) => b.id === bill.id)).toBeUndefined();
  });

  it("24-26. outstanding after partial / multi / multi-bill covered above + recon V5", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 12_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const half = Math.floor(bill.totalInPaise / 2);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: half,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-V5",
      allocations: [{ vendorBillId: bill.id, amountInPaise: half }]
    });
    paymentIds.push(draft.id);
    await postVendorPayment(draft.id);
    const recon = await buildReconciliationV4BillRow(bill.id);
    expect(recon.version).toBe("v5");
    expect(recon.status).toBe("PARTIALLY_PAID");
    expect(recon.nativeVendorPaymentInPaise).toBe(half);
    expect(recon.payments?.length).toBe(1);
  });

  it("27-28. ops mirror not implemented; mark paid not accounting authority", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 5_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const before = await prisma.vendorBill.findUniqueOrThrow({
      where: { id: bill.id },
      select: { paidInPaise: true, status: true }
    });
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-NOMIRROR",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    await postVendorPayment(draft.id);
    const after = await prisma.vendorBill.findUniqueOrThrow({
      where: { id: bill.id },
      select: { paidInPaise: true, status: true }
    });
    expect(after.paidInPaise).toBe(before.paidInPaise);
    expect(after.status).toBe(before.status);
  });

  it("29-30. production dual guard + feature flag off", async () => {
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "0";
    expect(() => assertVendorPaymentPostingPersistenceAllowed()).toThrow(
      AccountingVendorPaymentPostingDisabledError
    );
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 3_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-FLAG",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "0";
    await expect(postVendorPayment(draft.id)).rejects.toBeInstanceOf(
      AccountingVendorPaymentPostingDisabledError
    );
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
  });

  it("31. document links payment + bills", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 4_500, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-DOC",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    const post = await postVendorPayment(draft.id);
    const links = await prisma.accountingDocumentLink.findMany({
      where: { journalEntryId: post.journal.id }
    });
    expect(links.some((l) => l.documentType === VENDOR_PAYMENT_DOCUMENT_TYPE && l.documentId === draft.id)).toBe(
      true
    );
    expect(links.some((l) => l.documentType === VENDOR_BILL_DOCUMENT_TYPE && l.documentId === bill.id)).toBe(true);
  });

  it("33-35. no inventory/cost mutation; mark paid still works", async () => {
    const stock = await createStockVariantForPurchase();
    const beforeInv = await getInventory(stock.variantId);
    const beforeCost = await prisma.productVariant.findUniqueOrThrow({
      where: { id: stock.variantId },
      select: { costInPaise: true }
    });
    const bill = await postApBill({
      lines: [{ variantId: stock.variantId, quantity: 1, rateInPaise: 8_000, taxClass: "standard" }]
    });
    billIds.push(bill.id);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: "BANK_TRANSFER",
      utr: "UTR-STOCK",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    await postVendorPayment(draft.id);
    const afterInv = await getInventory(stock.variantId);
    const afterCost = await prisma.productVariant.findUniqueOrThrow({
      where: { id: stock.variantId },
      select: { costInPaise: true }
    });
    expect(afterInv?.onHand).toBe(beforeInv?.onHand);
    expect(afterCost.costInPaise).toBe(beforeCost.costInPaise);

    const unpaid = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Ops", quantity: 1, rateInPaise: 2_000, taxClass: "gst18" }]
    });
    billIds.push(unpaid.id);
    const status = await markBillPaid(unpaid.id);
    expect(status).toBe("PAID");
  });

  it("UTR required for non-cash", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 2_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await expect(
      createVendorPaymentDraft({
        vendorId: bill.vendorId,
        paymentDate: new Date(),
        amountInPaise: bill.totalInPaise,
        paymentMethod: "BANK_TRANSFER",
        utr: "ab",
        allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
      })
    ).rejects.toBeInstanceOf(VendorPaymentNotEligibleError);
  });

  it("preview works for draft", async () => {
    const bill = await postApBill({
      lines: [{ variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 2_500, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const draft = await createVendorPaymentDraft({
      vendorId: bill.vendorId,
      paymentDate: new Date(),
      amountInPaise: bill.totalInPaise,
      paymentMethod: "CASH",
      allocations: [{ vendorBillId: bill.id, amountInPaise: bill.totalInPaise }]
    });
    paymentIds.push(draft.id);
    const preview = await previewVendorPayment(draft.id);
    expect(preview.proposal?.balanced).toBe(true);
  });
});
