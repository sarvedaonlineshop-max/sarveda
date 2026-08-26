import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingPurchaseCapitalizationDisabledError,
  AccountingError
} from "../../src/modules/accounting/accounting-errors";
import { INVENTORY_ACCOUNT_CODE } from "../../src/modules/accounting/inventory.constants";
import {
  assertPurchaseCapitalizationPersistenceAllowed,
  resolvePurchaseCapitalizationDiscoveryDryRun
} from "../../src/modules/accounting/production-guard";
import {
  INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE,
  inventoryPurchaseCapitalizedUniqueKey
} from "../../src/modules/accounting/purchase-capitalization.constants";
import { buildInventoryPurchaseCapitalizationJournal } from "../../src/modules/accounting/purchase-capitalization-journal.builder";
import {
  postPurchaseCapitalization,
  previewPurchaseCapitalization
} from "../../src/modules/accounting/purchase-capitalization-posting.service";
import { previewReceiptLineCapitalization } from "../../src/modules/accounting/purchase-capitalization-eligibility";
import { runPurchaseCapitalizationDiscovery } from "../../src/modules/accounting/purchase-capitalization-discovery-worker";
import { buildPurchaseCapitalizationClearingReport } from "../../src/modules/accounting/purchase-capitalization-clearing.service";
import { buildInventoryReconciliationV2 } from "../../src/modules/accounting/inventory-reconciliation.service";
import { postVendorBillPostedJournal } from "../../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../../src/modules/accounting/vendor-bill-snapshot.service";
import { receivePurchaseOrder } from "../../src/modules/purchases/purchases.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { cleanupAccountingTestData, getInventory, prisma } from "../helpers/commerce";
import {
  cleanupSyntheticPurchaseCapitalization,
  cleanupSyntheticVendorBill,
  createStockVariantForPurchase,
  createSyntheticPurchaseOrder,
  createSyntheticVendor,
  createSyntheticVendorBill
} from "../helpers/accounting-purchases";

describe("INVENTORY_PURCHASE_CAPITALIZED_V1", () => {
  const billIds: string[] = [];
  const poIds: string[] = [];
  const receiptIds: string[] = [];

  const envBackup = {
    native: process.env.NATIVE_ACCOUNTING_ENABLED,
    purchases: process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED,
    inventory: process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED,
    cap: process.env.ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED,
    seller: process.env.SELLER_STATE
  };

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
    process.env.ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED = "1";
    process.env.SELLER_STATE = "Karnataka";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED = "1";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
  });

  afterEach(async () => {
    await cleanupSyntheticPurchaseCapitalization({
      receiptIds: receiptIds.splice(0),
      poIds: poIds.splice(0),
      billIds: billIds.splice(0)
    });
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = envBackup.native ?? "0";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = envBackup.purchases ?? "0";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = envBackup.inventory ?? "0";
    process.env.ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED = envBackup.cap ?? "0";
    if (envBackup.seller === undefined) delete process.env.SELLER_STATE;
    else process.env.SELLER_STATE = envBackup.seller;
  });

  async function setupPoBillReceipt(opts: {
    quantity: number;
    rateInPaise: number;
    receiveQty: number;
    postBillFirst?: boolean;
  }) {
    const stock = await createStockVariantForPurchase();
    const onHandBefore = (await getInventory(stock.variantId))!.onHand;
    const vendor = await createSyntheticVendor();
    const po = await createSyntheticPurchaseOrder({
      vendorId: vendor.id,
      variantId: stock.variantId,
      quantity: opts.quantity,
      rateInPaise: opts.rateInPaise
    });
    poIds.push(po.id);

    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      lines: [{ variantId: stock.variantId, quantity: opts.quantity, rateInPaise: opts.rateInPaise }]
    });
    billIds.push(bill.id);

    if (opts.postBillFirst) {
      await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    }

    const { receiptId } = await receivePurchaseOrder(po.id, [
      { poLineId: po.lines[0]!.id, quantityReceived: opts.receiveQty }
    ]);
    receiptIds.push(receiptId);

    const receiptLine = await prisma.purchaseReceiptLine.findFirstOrThrow({
      where: { receiptId, poLineId: po.lines[0]!.id }
    });

    if (!opts.postBillFirst) {
      await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    }

    return { stock, po, bill, receiptId, receiptLineId: receiptLine.id, onHandBefore };
  }

  it("1. full bill + full receipt → Dr 1200 / Cr 1210 + FIFO layer", async () => {
    const { receiptLineId, stock } = await setupPoBillReceipt({
      quantity: 10,
      rateInPaise: 50_000,
      receiveQty: 10,
      postBillFirst: true
    });

    const preview = await previewPurchaseCapitalization(receiptLineId);
    expect(preview.eligibility.eligible).toBe(true);
    expect(preview.proposal.capitalizationValueInPaise).toBe(500_000);

    const post = await postPurchaseCapitalization(receiptLineId);
    expect(post.duplicate).toBe(false);
    expect(post.proposal.lines.some((l) => l.accountCode === INVENTORY_ACCOUNT_CODE.INVENTORY_ASSET)).toBe(
      true
    );
    expect(
      post.proposal.lines.find((l) => l.accountCode === INVENTORY_ACCOUNT_CODE.INVENTORY_PURCHASES_CLEARING)
        ?.creditInPaise
    ).toBe(500_000);

    const layers = await prisma.accountingInventoryCostLayer.findMany({
      where: { variantId: stock.variantId, sourceType: "PURCHASE_RECEIPT" }
    });
    expect(layers).toHaveLength(1);
    expect(layers[0]!.quantityOriginal).toBe(10);
    expect(layers[0]!.unitCostInPaise).toBe(50_000);
  });

  it("2. bill before receipt — 1210 first, then 1200 on capitalization", async () => {
    const { receiptLineId } = await setupPoBillReceipt({
      quantity: 4,
      rateInPaise: 50_000,
      receiveQty: 4,
      postBillFirst: true
    });
    const post = await postPurchaseCapitalization(receiptLineId);
    expect(post.proposal.capitalizationValueInPaise).toBe(200_000);
  });

  it("3. receipt before bill — RECEIPT_WAITING_FOR_BILL until bill posts", async () => {
    const stock = await createStockVariantForPurchase();
    const vendor = await createSyntheticVendor();
    const po = await createSyntheticPurchaseOrder({
      vendorId: vendor.id,
      variantId: stock.variantId,
      quantity: 5,
      rateInPaise: 50_000
    });
    poIds.push(po.id);

    const { receiptId } = await receivePurchaseOrder(po.id, [
      { poLineId: po.lines[0]!.id, quantityReceived: 5 }
    ]);
    receiptIds.push(receiptId);
    const receiptLine = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId } });

    const waiting = await previewReceiptLineCapitalization(receiptLine.id);
    expect(waiting.eligibility.code).toBe("RECEIPT_WAITING_FOR_BILL");

    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      lines: [{ variantId: stock.variantId, quantity: 5, rateInPaise: 50_000 }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));

    const ready = await previewReceiptLineCapitalization(receiptLine.id);
    expect(ready.eligibility.eligible).toBe(true);
    await postPurchaseCapitalization(receiptLine.id);
  });

  it("4–6. partial + multiple receipts complete 1210 clearing", async () => {
    const stock = await createStockVariantForPurchase();
    const vendor = await createSyntheticVendor();
    const po = await createSyntheticPurchaseOrder({
      vendorId: vendor.id,
      variantId: stock.variantId,
      quantity: 10,
      rateInPaise: 50_000
    });
    poIds.push(po.id);
    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      lines: [{ variantId: stock.variantId, quantity: 10, rateInPaise: 50_000 }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));

    const r1 = await receivePurchaseOrder(po.id, [{ poLineId: po.lines[0]!.id, quantityReceived: 4 }]);
    receiptIds.push(r1.receiptId);
    const line1 = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId: r1.receiptId } });
    await postPurchaseCapitalization(line1.id);

    const r2 = await receivePurchaseOrder(po.id, [{ poLineId: po.lines[0]!.id, quantityReceived: 6 }]);
    receiptIds.push(r2.receiptId);
    const line2 = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId: r2.receiptId } });
    await postPurchaseCapitalization(line2.id);

    const clearing = await buildPurchaseCapitalizationClearingReport({ vendorBillId: bill.id });
    expect(clearing.rows[0]?.status).toBe("CLEARED");
    expect(clearing.rows[0]?.capitalizedQuantity).toBe(10);
    expect(clearing.rows[0]?.clearing1210OutstandingInPaise).toBe(0);
  });

  it("7. duplicate receipt post is idempotent", async () => {
    const { receiptLineId } = await setupPoBillReceipt({
      quantity: 2,
      rateInPaise: 10_000,
      receiveQty: 2,
      postBillFirst: true
    });
    const first = await postPurchaseCapitalization(receiptLineId);
    const second = await postPurchaseCapitalization(receiptLineId);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    const layers = await prisma.accountingInventoryCostLayer.count({
      where: { sourceType: "PURCHASE_RECEIPT", sourceLineId: receiptLineId }
    });
    expect(layers).toBe(1);
  });

  it("8. 20 concurrent posts → single journal + layer", async () => {
    const { receiptLineId } = await setupPoBillReceipt({
      quantity: 1,
      rateInPaise: 10_000,
      receiveQty: 1,
      postBillFirst: true
    });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => postPurchaseCapitalization(receiptLineId))
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof postPurchaseCapitalization>>
    >[];
    expect(fulfilled.length).toBeGreaterThan(0);
    const posted = fulfilled.filter((r) => !r.value.duplicate).length;
    expect(posted).toBe(1);
    const events = await prisma.accountingPostingEvent.count({
      where: { eventType: INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE }
    });
    expect(events).toBe(1);
  });

  it("9. over-receipt blocked for capitalization", async () => {
    const stock = await createStockVariantForPurchase();
    const vendor = await createSyntheticVendor();
    const po = await createSyntheticPurchaseOrder({
      vendorId: vendor.id,
      variantId: stock.variantId,
      quantity: 10,
      rateInPaise: 50_000
    });
    poIds.push(po.id);
    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      lines: [{ variantId: stock.variantId, quantity: 5, rateInPaise: 50_000 }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));

    const r1 = await receivePurchaseOrder(po.id, [{ poLineId: po.lines[0]!.id, quantityReceived: 5 }]);
    receiptIds.push(r1.receiptId);
    const line1 = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId: r1.receiptId } });
    await postPurchaseCapitalization(line1.id);

    const r2 = await receivePurchaseOrder(po.id, [{ poLineId: po.lines[0]!.id, quantityReceived: 5 }]);
    receiptIds.push(r2.receiptId);
    const line2 = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId: r2.receiptId } });

    const preview = await previewPurchaseCapitalization(line2.id);
    expect(preview.eligibility.code).toBe("OVER_RECEIPT_REVIEW_REQUIRED");
  });

  it("10. bill qty exceeds PO qty blocks capitalization", async () => {
    const stock = await createStockVariantForPurchase();
    const vendor = await createSyntheticVendor();
    const po = await createSyntheticPurchaseOrder({
      vendorId: vendor.id,
      variantId: stock.variantId,
      quantity: 5,
      rateInPaise: 50_000
    });
    poIds.push(po.id);
    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      lines: [{ variantId: stock.variantId, quantity: 8, rateInPaise: 50_000 }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const { receiptId } = await receivePurchaseOrder(po.id, [
      { poLineId: po.lines[0]!.id, quantityReceived: 5 }
    ]);
    receiptIds.push(receiptId);
    const receiptLine = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId } });
    const preview = await previewPurchaseCapitalization(receiptLine.id);
    expect(preview.eligibility.code).toBe("QUANTITY_MISMATCH");
  });

  it("11. cost mismatch blocks capitalization", async () => {
    const stock = await createStockVariantForPurchase();
    const vendor = await createSyntheticVendor();
    const po = await createSyntheticPurchaseOrder({
      vendorId: vendor.id,
      variantId: stock.variantId,
      quantity: 5,
      rateInPaise: 50_000
    });
    poIds.push(po.id);
    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      lines: [{ variantId: stock.variantId, quantity: 5, rateInPaise: 48_000 }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const { receiptId } = await receivePurchaseOrder(po.id, [
      { poLineId: po.lines[0]!.id, quantityReceived: 5 }
    ]);
    receiptIds.push(receiptId);
    const receiptLine = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId } });
    const preview = await previewPurchaseCapitalization(receiptLine.id);
    expect(preview.eligibility.code).toBe("COST_MISMATCH");
  });

  it("13–14. course/digital variant blocked", async () => {
    const course = await prisma.product.create({
      data: {
        slug: `test-course-${Date.now()}`,
        name: "Course",
        status: "ACTIVE",
        productType: "DIGITAL"
      }
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: course.id,
        sku: `COURSE-TEST-${Date.now()}`,
        mrpInPaise: 100_000,
        saleInPaise: 100_000,
        isDefault: true
      }
    });
    const vendor = await createSyntheticVendor();
    const po = await createSyntheticPurchaseOrder({
      vendorId: vendor.id,
      variantId: variant.id,
      quantity: 1,
      rateInPaise: 10_000
    });
    poIds.push(po.id);
    const bill = await createSyntheticVendorBill({
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      lines: [{ variantId: variant.id, quantity: 1, rateInPaise: 10_000 }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const { receiptId } = await receivePurchaseOrder(po.id, [
      { poLineId: po.lines[0]!.id, quantityReceived: 1 }
    ]);
    receiptIds.push(receiptId);
    const receiptLine = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId } });
    const preview = await previewPurchaseCapitalization(receiptLine.id);
    expect(preview.eligibility.code).toBe("NON_INVENTORY_VARIANT");
  });

  it("15. non-stock bill line has no receipt capitalization path", async () => {
    const bill = await createSyntheticVendorBill({
      lines: [{ variantId: null, itemName: "Service", quantity: 1, rateInPaise: 10_000 }]
    });
    billIds.push(bill.id);
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
    const clearing = await buildPurchaseCapitalizationClearingReport({ vendorBillId: bill.id });
    expect(clearing.rows).toHaveLength(0);
  });

  it("25–26. accounting post does not mutate onHand or costInPaise", async () => {
    const { receiptLineId, stock, onHandBefore } = await setupPoBillReceipt({
      quantity: 2,
      rateInPaise: 10_000,
      receiveQty: 2,
      postBillFirst: true
    });
    const onHandAfterReceive = (await getInventory(stock.variantId))!.onHand;
    expect(onHandAfterReceive).toBe(onHandBefore + 2);
    const costBefore = (
      await prisma.productVariant.findUniqueOrThrow({ where: { id: stock.variantId } })
    ).costInPaise;

    await postPurchaseCapitalization(receiptLineId);

    const onHandAfterCap = (await getInventory(stock.variantId))!.onHand;
    const costAfter = (
      await prisma.productVariant.findUniqueOrThrow({ where: { id: stock.variantId } })
    ).costInPaise;
    expect(onHandAfterCap).toBe(onHandAfterReceive);
    expect(costAfter).toBe(costBefore);
  });

  it("28–29. feature flag + production guard", () => {
    process.env.ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED = "0";
    expect(() => assertPurchaseCapitalizationPersistenceAllowed()).toThrow(
      AccountingPurchaseCapitalizationDisabledError
    );
    process.env.ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED = "1";
    expect(resolvePurchaseCapitalizationDiscoveryDryRun(undefined)).toBe(true);
  });

  it("31. reconciliation V2 includes purchase receipt layers", async () => {
    const { receiptLineId, stock } = await setupPoBillReceipt({
      quantity: 3,
      rateInPaise: 20_000,
      receiveQty: 3,
      postBillFirst: true
    });
    await postPurchaseCapitalization(receiptLineId);
    const recon = await buildInventoryReconciliationV2({ sku: stock.sku, limit: 10 });
    const row = recon.rows.find((r) => r.variantId === stock.variantId);
    expect(row?.purchaseReceiptLayerQty).toBe(3);
  });

  it("journal builder excludes GST and AP", () => {
    const proposal = buildInventoryPurchaseCapitalizationJournal({
      receiptId: "r1",
      receiptLineId: "rl1",
      receiptDate: new Date(),
      purchaseOrderId: "po1",
      poNumber: "PO-1",
      poLineId: "pl1",
      variantId: "v1",
      sku: "SKU-1",
      productName: "Item",
      quantityReceived: 4,
      poLineRateInPaise: 50_000,
      poLineQuantity: 10,
      poLineReceivedQty: 4,
      vendorBillId: "b1",
      vendorBillLineId: "bl1",
      billNumber: "BILL-1",
      billDate: new Date(),
      billLineQuantity: 10,
      billLineRateInPaise: 50_000,
      billSourceFingerprint: "fp1",
      netUnitCostInPaise: 50_000,
      allocatedBaseInPaise: 500_000,
      capitalizationValueInPaise: 200_000,
      previouslyCapitalizedQty: 0,
      classification: "PHYSICAL_INVENTORY"
    });
    expect(proposal.lines).toHaveLength(2);
    expect(proposal.lines.every((l) => l.accountCode === "1200" || l.accountCode === "1210")).toBe(true);
    expect(proposal.capitalizationValueInPaise).toBe(200_000);
  });

  it("duplicate unique key pattern", () => {
    expect(inventoryPurchaseCapitalizedUniqueKey("r", "rl")).toBe("inventory_capitalization:r:rl");
  });

  it("discovery dry-run does not post", async () => {
    const { receiptLineId } = await setupPoBillReceipt({
      quantity: 1,
      rateInPaise: 10_000,
      receiveQty: 1,
      postBillFirst: true
    });
    const result = await runPurchaseCapitalizationDiscovery({ receiptId: receiptIds[0], dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.posted).toBe(0);
    expect(result.rows.some((r) => r.receiptLineId === receiptLineId)).toBe(true);
  });
});
