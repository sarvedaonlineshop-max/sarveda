import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingPurchasesPostingDisabledError,
  VendorBillNotEligibleForPostingError
} from "../../src/modules/accounting/accounting-errors";
import {
  assertPurchasesPostingPersistenceAllowed,
  resolvePurchasesDiscoveryDryRun
} from "../../src/modules/accounting/production-guard";
import { PURCHASE_ACCOUNT_CODE } from "../../src/modules/accounting/vendor-bill.constants";
import { buildVendorBillPostedJournal } from "../../src/modules/accounting/vendor-bill-journal.builder";
import {
  postVendorBillPostedJournal,
  previewVendorBillPostedJournal
} from "../../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../../src/modules/accounting/vendor-bill-snapshot.service";
import { runVendorBillDiscovery } from "../../src/modules/accounting/vendor-bill-discovery-worker";
import { buildReconciliationV4BillRow } from "../../src/modules/accounting/reconciliation.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { receivePurchaseOrder } from "../../src/modules/purchases/purchases.service";
import { cleanupAccountingTestData, getInventory, prisma } from "../helpers/commerce";
import {
  cleanupSyntheticVendorBill,
  createStockVariantForPurchase,
  createSyntheticVendor,
  createSyntheticVendorBill
} from "../helpers/accounting-purchases";

describe("VENDOR_BILL_POSTED_V1", () => {
  const billIds: string[] = [];
  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalPurchases = process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED;
  const originalSeller = process.env.SELLER_STATE;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
  });

  afterEach(async () => {
    for (const id of billIds.splice(0)) {
      await cleanupSyntheticVendorBill(id);
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = originalPurchases ?? "0";
    if (originalSeller === undefined) delete process.env.SELLER_STATE;
    else process.env.SELLER_STATE = originalSeller;
  });

  it("1. OPEN stock VendorBill → Dr 1210 + Input GST, Cr 2000", async () => {
    const stock = await createStockVariantForPurchase();
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: stock.variantId, quantity: 2, rateInPaise: 10_000, taxClass: "standard" }]
    });
    billIds.push(bill.id);

    const snap = await loadVendorBillSnapshotById(bill.id);
    const preview = await previewVendorBillPostedJournal(snap);
    expect(preview.eligibility.eligible).toBe(true);
    expect(preview.proposal?.diagnostics.stockClearingInPaise).toBe(20_000);
    expect(preview.proposal?.diagnostics.gst.jurisdiction).toBe("INTRA_STATE");

    const post = await postVendorBillPostedJournal(snap);
    expect(post.duplicate).toBe(false);
    expect(post.journal.totalDebitInPaise).toBe(post.journal.totalCreditInPaise);

    const lines = post.proposal.lines;
    expect(lines.find((l) => l.accountCode === PURCHASE_ACCOUNT_CODE.INVENTORY_PURCHASES_CLEARING)?.debitInPaise).toBe(
      20_000
    );
    expect(lines.find((l) => l.accountCode === PURCHASE_ACCOUNT_CODE.ACCOUNTS_PAYABLE)?.creditInPaise).toBe(
      bill.totalInPaise
    );
    expect(lines.some((l) => l.accountCode === "1200")).toBe(false);
    expect(lines.some((l) => l.accountCode === "5000")).toBe(false);
  });

  it("2. OPEN non-stock VendorBill → Dr 5300", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Consulting", quantity: 1, rateInPaise: 50_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const snap = await loadVendorBillSnapshotById(bill.id);
    const proposal = buildVendorBillPostedJournal(snap);
    expect(proposal.diagnostics.expenseInPaise).toBe(50_000);
    expect(proposal.diagnostics.stockClearingInPaise).toBe(0);
    expect(proposal.lines.find((l) => l.accountCode === PURCHASE_ACCOUNT_CODE.OPERATING_EXPENSE)?.debitInPaise).toBe(
      50_000
    );
  });

  it("3. mixed stock + service bill", async () => {
    const stock = await createStockVariantForPurchase();
    const bill = await createSyntheticVendorBill({
      lines: [
        { variantId: stock.variantId, quantity: 1, rateInPaise: 10_000 },
        { variantId: null, itemName: "Freight service", quantity: 1, rateInPaise: 5_000, taxClass: "gst18" }
      ]
    });
    billIds.push(bill.id);
    const proposal = buildVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    expect(proposal.diagnostics.stockClearingInPaise).toBe(10_000);
    expect(proposal.diagnostics.expenseInPaise).toBe(5_000);
    expect(proposal.balanced).toBe(true);
  });

  it("4–5. intra-state vs interstate GST", async () => {
    const stock = await createStockVariantForPurchase();
    const intra = await createSyntheticVendorBill({
      vendor: { billingState: "Karnataka", gstin: "29AAAAA0000A1Z5" },
      lines: [{ variantId: stock.variantId, quantity: 1, rateInPaise: 10_000 }]
    });
    billIds.push(intra.id);
    const intraP = buildVendorBillPostedJournal(await loadVendorBillSnapshotById(intra.id));
    expect(intraP.diagnostics.gst.jurisdiction).toBe("INTRA_STATE");
    expect(intraP.diagnostics.gst.cgstInPaise + intraP.diagnostics.gst.sgstInPaise).toBe(intra.taxInPaise);

    const inter = await createSyntheticVendorBill({
      vendor: { billingState: "Maharashtra", gstin: "27AAAAA0000A1Z5" },
      lines: [{ variantId: stock.variantId, quantity: 1, rateInPaise: 10_000 }]
    });
    billIds.push(inter.id);
    const interP = buildVendorBillPostedJournal(await loadVendorBillSnapshotById(inter.id));
    expect(interP.diagnostics.gst.jurisdiction).toBe("INTER_STATE");
    expect(interP.diagnostics.gst.igstInPaise).toBe(inter.taxInPaise);
  });

  it("6–8. no-GST / missing GSTIN / missing state → GST_DATA_GAP fail-closed when tax>0", async () => {
    const zero = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Zero tax", quantity: 1, rateInPaise: 1_000, taxClass: "gst-zero-rate" }]
    });
    billIds.push(zero.id);
    const z = buildVendorBillPostedJournal(await loadVendorBillSnapshotById(zero.id));
    expect(z.diagnostics.gst.gstRecognized).toBe(false);
    expect(z.balanced).toBe(true);

    const noGstin = await createSyntheticVendorBill({
      vendor: { gstin: null },
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(noGstin.id);
    const preview = await previewVendorBillPostedJournal(await loadVendorBillSnapshotById(noGstin.id));
    expect(preview.eligibility.code).toBe("GST_DATA_GAP");
    await expect(
      postVendorBillPostedJournal(await loadVendorBillSnapshotById(noGstin.id))
    ).rejects.toMatchObject({ code: "GST_DATA_GAP" });

    const noState = await createSyntheticVendorBill({
      vendor: { billingState: null, gstin: "29AAAAA0000A1Z5" },
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(noState.id);
    await expect(
      postVendorBillPostedJournal(await loadVendorBillSnapshotById(noState.id))
    ).rejects.toMatchObject({ code: "GST_DATA_GAP" });
  });

  it("9–11. discount + adjustment unclassified warning", async () => {
    const stock = await createStockVariantForPurchase();
    const bill = await createSyntheticVendorBill({
      discountInPaise: 1_000,
      adjustmentInPaise: 500,
      lines: [
        { variantId: stock.variantId, quantity: 1, rateInPaise: 10_000 },
        { variantId: null, itemName: "Svc", quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }
      ]
    });
    billIds.push(bill.id);
    const proposal = buildVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    expect(proposal.diagnostics.warnings).toContain("ADJUSTMENT_UNCLASSIFIED");
    expect(proposal.diagnostics.adjustmentPolicy).toBe("ALLOCATED_PRO_RATA");
    expect(proposal.balanced).toBe(true);
    expect(
      proposal.diagnostics.stockClearingInPaise + proposal.diagnostics.expenseInPaise
    ).toBe(bill.subtotalInPaise - bill.discountInPaise + bill.adjustmentInPaise);
  });

  it("12–13. DRAFT and VOID no post", async () => {
    const draft = await createSyntheticVendorBill({
      status: "DRAFT",
      lines: [{ variantId: null, quantity: 1, rateInPaise: 1_000, taxClass: "gst-zero-rate" }]
    });
    billIds.push(draft.id);
    await expect(
      postVendorBillPostedJournal(await loadVendorBillSnapshotById(draft.id))
    ).rejects.toBeInstanceOf(VendorBillNotEligibleForPostingError);

    const voided = await createSyntheticVendorBill({
      status: "VOID",
      lines: [{ variantId: null, quantity: 1, rateInPaise: 1_000, taxClass: "gst-zero-rate" }]
    });
    billIds.push(voided.id);
    await expect(
      postVendorBillPostedJournal(await loadVendorBillSnapshotById(voided.id))
    ).rejects.toMatchObject({ code: "BILL_VOID" });
  });

  it("14–15. historical PAID reconstructs AP; no bank journal", async () => {
    const bill = await createSyntheticVendorBill({
      status: "PAID",
      paidInPaise: undefined,
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const post = await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    expect(post.proposal.lines.some((l) => l.accountCode === "1010" || l.accountCode === "1000")).toBe(
      false
    );
    expect(post.proposal.lines.find((l) => l.accountCode === "2000")?.creditInPaise).toBe(bill.totalInPaise);
    const recon = await buildReconciliationV4BillRow(bill.id);
    expect(recon.status).toBe("OPS_PAID_NATIVE_UNPAID");
    expect(recon.nativeVendorPaymentInPaise).toBe(0);
  });

  it("16–17. duplicate discovery + 20 concurrent posts → 1 journal", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    const snap = await loadVendorBillSnapshotById(bill.id);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => postVendorBillPostedJournal(snap))
    );
    const entries = new Set(results.map((r) => r.journal.entryNumber));
    expect(entries.size).toBe(1);
    expect(results.filter((r) => !r.duplicate).length).toBeLessThanOrEqual(1);

    const disc = await runVendorBillDiscovery({ billId: bill.id, dryRun: true });
    expect(disc.rows[0]?.posted).toBe(true);
  });

  it("18–19. duplicate supplier reference same vendor vs different vendors", async () => {
    const v1 = await createSyntheticVendor({ name: "TEST-ACC-PURCHASE-DUP-A" });
    const v2 = await createSyntheticVendor({ name: "TEST-ACC-PURCHASE-DUP-B" });
    const a = await createSyntheticVendorBill({
      vendorId: v1.id,
      referenceNumber: "INV-SAME-001",
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    const b = await createSyntheticVendorBill({
      vendorId: v1.id,
      referenceNumber: "INV-SAME-001",
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    const c = await createSyntheticVendorBill({
      vendorId: v2.id,
      referenceNumber: "INV-SAME-001",
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(a.id, b.id, c.id);

    const disc = await runVendorBillDiscovery({ billId: b.id, dryRun: true });
    expect(disc.rows[0]?.duplicateSupplierReference).toBe(true);
    expect(disc.rows[0]?.warnings).toContain("DUPLICATE_SUPPLIER_REFERENCE");

    // Different vendor — not flagged as same-vendor duplicate
    const discC = await runVendorBillDiscovery({ billId: c.id, dryRun: true });
    expect(discC.rows[0]?.duplicateSupplierReference).toBe(false);
  });

  it("20–25. PO link / no PO; receipt alone does not create GL; stock unchanged by posting", async () => {
    const stock = await createStockVariantForPurchase();
    const onHandBefore = (await getInventory(stock.variantId))!.onHand;

    const vendor = await createSyntheticVendor();
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: `TEST-ACC-PO-${Date.now()}`,
        vendorId: vendor.id,
        status: "SENT",
        subtotalInPaise: 10_000,
        taxInPaise: 1_800,
        totalInPaise: 11_800,
        lines: {
          create: [
            {
              variantId: stock.variantId,
              itemName: "Bowl",
              quantity: 1,
              rateInPaise: 10_000,
              taxClass: "standard",
              taxInPaise: 1_800,
              lineTotalInPaise: 11_800
            }
          ]
        }
      },
      include: { lines: true }
    });

    await receivePurchaseOrder(po.id, [{ poLineId: po.lines[0]!.id, quantityReceived: 1 }]);
    const onHandAfterReceive = (await getInventory(stock.variantId))!.onHand;
    expect(onHandAfterReceive).toBe(onHandBefore + 1);
    const costAfterReceive = (
      await prisma.productVariant.findUniqueOrThrow({ where: { id: stock.variantId } })
    ).costInPaise;

    // Receipt alone → no posting event
    const eventsBefore = await prisma.accountingPostingEvent.count({
      where: { eventType: "VENDOR_BILL_POSTED" }
    });
    expect(eventsBefore).toBe(0);

    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      lines: [{ variantId: stock.variantId, quantity: 1, rateInPaise: 10_000 }]
    });
    billIds.push(bill.id);

    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));

    const onHandAfterPost = (await getInventory(stock.variantId))!.onHand;
    expect(onHandAfterPost).toBe(onHandAfterReceive);
    const costAfterPost = (
      await prisma.productVariant.findUniqueOrThrow({ where: { id: stock.variantId } })
    ).costInPaise;
    expect(costAfterPost).toBe(costAfterReceive);

    const links = await prisma.accountingDocumentLink.findMany({
      where: { documentType: { in: ["VENDOR_BILL", "PURCHASE_ORDER"] } }
    });
    expect(links.some((l) => l.documentType === "VENDOR_BILL" && l.documentId === bill.id)).toBe(true);
    expect(links.some((l) => l.documentType === "PURCHASE_ORDER" && l.documentId === po.id)).toBe(true);

    await prisma.purchaseReceipt.deleteMany({ where: { purchaseOrderId: po.id } });
    await prisma.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("28. source bill changed after post → detected", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, quantity: 1, rateInPaise: 10_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));

    await prisma.vendorBill.update({
      where: { id: bill.id },
      data: { notes: "touch", totalInPaise: bill.totalInPaise + 1, subtotalInPaise: bill.subtotalInPaise + 1 }
    });

    const preview = await previewVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    expect(preview.sourceChangedAfterPost).toBe(true);
    const recon = await buildReconciliationV4BillRow(bill.id);
    expect(recon.status).toBe("SOURCE_CHANGED_AFTER_POST");
  });

  it("29–31. flags and dry-run defaults", () => {
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "0";
    expect(() => assertPurchasesPostingPersistenceAllowed()).toThrow(AccountingPurchasesPostingDisabledError);
    expect(resolvePurchasesDiscoveryDryRun(false)).toBe(true);
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    expect(resolvePurchasesDiscoveryDryRun(undefined)).toBe(true);
  });

  it("33. reconciliation V4/V5", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, quantity: 1, rateInPaise: 5_000, taxClass: "gst18" }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const row = await buildReconciliationV4BillRow(bill.id);
    expect(row.version).toBe("v5");
    expect(row.journalEntryNumber).toBeTruthy();
    expect(row.outstandingNativeApInPaise).toBe(bill.totalInPaise);
  });

  it("34. CLOSED accounting period blocks post", async () => {
    const bill = await createSyntheticVendorBill({
      billDate: new Date("2024-06-15"),
      lines: [{ variantId: null, quantity: 1, rateInPaise: 1_000, taxClass: "gst-zero-rate" }]
    });
    billIds.push(bill.id);
    await prisma.accountingPeriod.create({
      data: {
        name: "FY24-Q1-CLOSED-TEST",
        startDate: new Date("2024-04-01"),
        endDate: new Date("2024-06-30"),
        status: "CLOSED",
        closedAt: new Date()
      }
    });
    await expect(
      postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id))
    ).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_CLOSED" });
  });
});
