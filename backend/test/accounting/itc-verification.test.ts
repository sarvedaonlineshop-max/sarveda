import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { postVendorBillPostedJournal } from "../../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../../src/modules/accounting/vendor-bill-snapshot.service";
import { isVendorBillEligibleForPosting } from "../../src/modules/accounting/vendor-bill-eligibility";
import {
  postExpenseById
} from "../../src/modules/accounting/expense-posting.service";
import {
  seedDefaultExpensePaymentMappings,
  upsertExpenseAccountMapping,
  upsertExpensePaymentMapping
} from "../../src/modules/accounting/expense-mapping.service";
import { discoverItcEvidence, discoverItcForSource } from "../../src/modules/accounting/itc-discovery.service";
import {
  ItcTransitionError,
  blockItcEvidence,
  buildItcSummary,
  fingerprintJournal,
  getItcEvidenceById,
  markItcDataGap,
  verifyItcEvidence
} from "../../src/modules/accounting/itc.service";
import {
  assessGatewayItc,
  assessVendorBillItc
} from "../../src/modules/accounting/itc-eligibility.service";
import { isAccountingItcVerificationEnabled } from "../../src/modules/accounting/accounting-flag";
import { ITC_CLAIMED_UNAVAILABLE_CODE } from "../../src/modules/accounting/itc.constants";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";
import {
  cleanupSyntheticVendorBill,
  createSyntheticVendor,
  createSyntheticVendorBill
} from "../helpers/accounting-purchases";

async function createExpense(opts: {
  amountInPaise?: number;
  taxInPaise?: number;
  vendorId?: string | null;
  invoiceNumber?: string | null;
  reverseCharge?: boolean;
  sourceOfSupply?: string | null;
  hsnSac?: string | null;
}) {
  const account = `TEST-ACC-ITC-Office-${randomUUID().slice(0, 6)}`;
  await upsertExpenseAccountMapping({
    sourceName: account,
    accountingAccountCode: "5300",
    isActive: true
  });
  await upsertExpensePaymentMapping({
    sourceName: "Bank",
    paidAccountCode: "1010",
    isActive: true
  });
  return prisma.expense.create({
    data: {
      expenseAccount: account,
      paidThrough: "Bank",
      amountInPaise: opts.amountInPaise ?? 10_000,
      taxInPaise: opts.taxInPaise ?? 1_800,
      taxInclusive: false,
      status: "RECORDED",
      vendorId: opts.vendorId ?? null,
      invoiceNumber: opts.invoiceNumber === undefined ? `INV-${randomUUID().slice(0, 6)}` : opts.invoiceNumber,
      reverseCharge: opts.reverseCharge ?? false,
      sourceOfSupply: opts.sourceOfSupply ?? "Karnataka",
      destinationOfSupply: "Karnataka",
      hsnSac: opts.hsnSac ?? "9983",
      currency: "INR",
      expenseDate: new Date(),
      expenseType: "SERVICES"
    }
  });
}

describe("Phase 5C ITC verification", () => {
  const billIds: string[] = [];
  const expenseIds: string[] = [];
  const originals = {
    native: process.env.NATIVE_ACCOUNTING_ENABLED,
    purchases: process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED,
    expense: process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED,
    gst: process.env.ACCOUNTING_GST_ENABLED,
    itc: process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED,
    seller: process.env.SELLER_STATE
  };

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_GST_ENABLED = "1";
    process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
    await seedDefaultExpensePaymentMappings();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_GST_ENABLED = "1";
    process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
  });

  afterEach(async () => {
    for (const id of billIds.splice(0)) await cleanupSyntheticVendorBill(id);
    for (const id of expenseIds.splice(0)) {
      await prisma.expense.deleteMany({ where: { id } });
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originals.native ?? "0";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = originals.purchases ?? "0";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = originals.expense ?? "0";
    process.env.ACCOUNTING_GST_ENABLED = originals.gst ?? "0";
    process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED = originals.itc ?? "0";
    if (originals.seller === undefined) delete process.env.SELLER_STATE;
    else process.env.SELLER_STATE = originals.seller;
  });

  it("A. valid VendorBill evidence → ELIGIBLE_FOR_REVIEW then admin verify", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Goods", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const row = await discoverItcForSource("VENDOR_BILL", bill.id);
    expect(row).toBeTruthy();
    expect(row!.assessmentCode).toBe("ELIGIBLE_FOR_REVIEW");
    expect(row!.status).toBe("UNVERIFIED_PENDING_TAX_INVOICE");
    expect(row!.recognizedInInputGl).toBe(true);

    const fpBefore = await fingerprintJournal(row!.journalEntryId);
    await verifyItcEvidence({
      evidenceId: row!.id,
      actorUserId: null,
      reason: "Tax invoice matched"
    });
    const after = await getItcEvidenceById(row!.id);
    expect(after!.status).toBe("ELIGIBLE");
    expect(after!.statusHistory.length).toBeGreaterThanOrEqual(2);
    const fpAfter = await fingerprintJournal(row!.journalEntryId);
    expect(fpAfter).toEqual(fpBefore);
  });

  it("B. missing invoice reference → DATA_GAP", async () => {
    const bill = await createSyntheticVendorBill({
      referenceNumber: null,
      lines: [{ variantId: null, itemName: "No ref", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    // posting may fail GST recognition — still discover
    try {
      await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    } catch {
      /* GST_DATA_GAP fail-closed expected */
    }
    const row = await discoverItcForSource("VENDOR_BILL", bill.id);
    expect(row!.status).toBe("DATA_GAP");
    expect(
      ["MISSING_SUPPLIER_REFERENCE", "MISSING_POSTED_INPUT_GST"].includes(row!.assessmentCode ?? "")
    ).toBe(true);
  });

  it("C. invalid supplier GSTIN → DATA_GAP", () => {
    const a = assessVendorBillItc({
      reverseCharge: false,
      taxInPaise: 1800,
      referenceNumber: "INV-1",
      vendorGstin: "INVALID",
      vendorBillingState: "Karnataka",
      gstRecognizedInJournal: true,
      journalCgst: 900,
      journalSgst: 900,
      journalIgst: 0,
      snapshotCgst: 900,
      snapshotSgst: 900,
      snapshotIgst: 0,
      jurisdiction: "INTRA_STATE",
      postingDataGapCodes: []
    });
    expect(a.assessmentCode).toBe("INVALID_GSTIN");
    expect(a.suggestedStatus).toBe("DATA_GAP");
  });

  it("D. GST amount mismatch → DATA_GAP", () => {
    const a = assessVendorBillItc({
      reverseCharge: false,
      taxInPaise: 1800,
      referenceNumber: "INV-1",
      vendorGstin: "29AAAAA0000A1Z5",
      vendorBillingState: "KA",
      gstRecognizedInJournal: true,
      journalCgst: 900,
      journalSgst: 900,
      journalIgst: 0,
      snapshotCgst: 500,
      snapshotSgst: 500,
      snapshotIgst: 0,
      jurisdiction: "INTRA_STATE",
      postingDataGapCodes: []
    });
    expect(a.assessmentCode).toBe("GST_AMOUNT_MISMATCH");
  });

  it("E. POS mismatch → DATA_GAP", () => {
    const a = assessVendorBillItc({
      reverseCharge: false,
      taxInPaise: 1800,
      referenceNumber: "INV-1",
      vendorGstin: "29AAAAA0000A1Z5",
      vendorBillingState: "MH",
      gstRecognizedInJournal: true,
      journalCgst: 0,
      journalSgst: 0,
      journalIgst: 1800,
      snapshotCgst: 0,
      snapshotSgst: 0,
      snapshotIgst: 1800,
      jurisdiction: "UNKNOWN",
      postingDataGapCodes: ["PLACE_OF_SUPPLY_MISMATCH"]
    });
    expect(a.assessmentCode).toBe("PLACE_OF_SUPPLY_MISMATCH");
  });

  it("F. VendorBill RCM remains blocked", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "RCM", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await prisma.vendorBill.update({ where: { id: bill.id }, data: { reverseCharge: true } });
    const snap = await loadVendorBillSnapshotById(bill.id);
    const elig = isVendorBillEligibleForPosting(snap);
    expect(elig.eligible).toBe(false);
    expect(elig.code).toBe("RCM_DATA_GAP");
    const row = await discoverItcForSource("VENDOR_BILL", bill.id);
    expect(row!.status).toBe("BLOCKED");
    expect(row!.assessmentCode).toBe("RCM_DATA_GAP");
  });

  it("G/H. Expense complete vs incomplete evidence", async () => {
    const vendor = await createSyntheticVendor();
    const good = await createExpense({
      vendorId: vendor.id,
      invoiceNumber: "E-GOOD",
      taxInPaise: 1800,
      amountInPaise: 10_000
    });
    expenseIds.push(good.id);
    await postExpenseById(good.id);
    const goodRow = await discoverItcForSource("EXPENSE", good.id);
    expect(goodRow!.assessmentCode).toBe("ELIGIBLE_FOR_REVIEW");
    expect(goodRow!.recognizedInInputGl).toBe(true);

    const bad = await createExpense({
      vendorId: vendor.id,
      invoiceNumber: null,
      taxInPaise: 1800,
      amountInPaise: 10_000
    });
    expenseIds.push(bad.id);
    try {
      await postExpenseById(bad.id);
    } catch {
      /* may fail closed */
    }
    const badRow = await discoverItcForSource("EXPENSE", bad.id);
    expect(badRow!.status).toBe("DATA_GAP");
  });

  it("I/J. Gateway GST provisional — not in Input GL", () => {
    const a = assessGatewayItc({ taxInPaise: 500, feeInPaise: 2000, settlementPosted: true });
    expect(a.assessmentCode).toBe("GATEWAY_TAX_INVOICE_REQUIRED");
    expect(a.suggestedStatus).toBe("UNVERIFIED_PENDING_TAX_INVOICE");
    expect(a.details.posting).toContain("5100");
  });

  it("K/L/M. Verify / Block / DATA_GAP transitions + audit history", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Act", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const row = await discoverItcForSource("VENDOR_BILL", bill.id);
    await blockItcEvidence({ evidenceId: row!.id, reason: "Supplier mismatch" });
    let cur = await getItcEvidenceById(row!.id);
    expect(cur!.status).toBe("BLOCKED");
    await markItcDataGap({ evidenceId: row!.id, reason: "Need better invoice scan" });
    cur = await getItcEvidenceById(row!.id);
    expect(cur!.status).toBe("DATA_GAP");
    await verifyItcEvidence({ evidenceId: row!.id, reason: "Resolved after rescan" });
    cur = await getItcEvidenceById(row!.id);
    expect(cur!.status).toBe("ELIGIBLE");
    expect(cur!.statusHistory.map((h) => h.newStatus)).toEqual(
      expect.arrayContaining(["BLOCKED", "DATA_GAP", "ELIGIBLE"])
    );
  });

  it("N. Repeated discovery is idempotent", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Idem", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const a = await discoverItcForSource("VENDOR_BILL", bill.id);
    const b = await discoverItcForSource("VENDOR_BILL", bill.id);
    expect(a!.id).toBe(b!.id);
    const count = await prisma.accountingItcEvidence.count({
      where: { sourceType: "VENDOR_BILL", sourceId: bill.id }
    });
    expect(count).toBe(1);
    await verifyItcEvidence({ evidenceId: a!.id, reason: "ok" });
    const c = await discoverItcForSource("VENDOR_BILL", bill.id);
    expect(c!.status).toBe("ELIGIBLE");
  });

  it("O/P. GL unchanged; ELIGIBLE does not become CLAIMED", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Claim", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const row = await discoverItcForSource("VENDOR_BILL", bill.id);
    const fpBefore = await fingerprintJournal(row!.journalEntryId);
    await verifyItcEvidence({ evidenceId: row!.id, reason: "ok" });
    expect(await fingerprintJournal(row!.journalEntryId)).toEqual(fpBefore);
    // Second verify while already ELIGIBLE is invalid transition (not CLAIMED).
    await expect(
      verifyItcEvidence({ evidenceId: row!.id, reason: "again" })
    ).rejects.toBeInstanceOf(ItcTransitionError);
    expect(ITC_CLAIMED_UNAVAILABLE_CODE).toBe("FILING_WORKFLOW_UNAVAILABLE");
    const cur = await getItcEvidenceById(row!.id);
    expect(cur!.status).toBe("ELIGIBLE");
    expect(cur!.claimedAt).toBeNull();
  });

  it("Q/R. summary separates recognized vs eligible + components", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Sum", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const row = await discoverItcForSource("VENDOR_BILL", bill.id);
    let sum = await buildItcSummary();
    expect(sum.recognizedInputGst.totalGstInPaise).toBeGreaterThan(0);
    expect(sum.unverifiedInputGst.count).toBeGreaterThanOrEqual(1);
    expect(sum.eligibleInputGst.count).toBe(0);
    await verifyItcEvidence({ evidenceId: row!.id, reason: "ok" });
    sum = await buildItcSummary();
    expect(sum.eligibleInputGst.totalGstInPaise).toBe(sum.recognizedInputGst.totalGstInPaise);
    expect(sum.eligibleInputGst.cgstInPaise + sum.eligibleInputGst.sgstInPaise).toBe(
      sum.eligibleInputGst.totalGstInPaise
    );
  });

  it("S. feature flag OFF", () => {
    process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED = "0";
    expect(isAccountingItcVerificationEnabled()).toBe(false);
    process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED = "1";
    expect(isAccountingItcVerificationEnabled()).toBe(true);
  });

  it("T. bulk discover creates rows", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Bulk", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const first = await discoverItcEvidence({ sourceType: "VENDOR_BILL", limit: 50 });
    const second = await discoverItcEvidence({ sourceType: "VENDOR_BILL", limit: 50 });
    expect(first.created + first.updated).toBeGreaterThan(0);
    expect(second.created).toBe(0);
    expect(second.updated).toBeGreaterThan(0);
  });
});
