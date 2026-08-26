import { randomUUID } from "crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resetAccountingCutoverCache } from "../../src/modules/accounting/accounting-cutover";
import { inventoryCogsRecognizedUniqueKey } from "../../src/modules/accounting/inventory-cogs.constants";
import { runInventoryCogsDiscovery } from "../../src/modules/accounting/inventory-cogs-discovery-worker";
import { previewInventoryCogs, postInventoryCogs } from "../../src/modules/accounting/inventory-cogs-posting.service";
import { buildInventoryReconciliationV3 } from "../../src/modules/accounting/inventory-reconciliation.service";
import { createAndPostJournalInTx } from "../../src/modules/accounting/journal.service";
import { postOrderPaidJournal } from "../../src/modules/accounting/order-paid-posting.service";
import { loadOrderPaidSnapshotById } from "../../src/modules/accounting/order-snapshot.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { createSyntheticPaidOrder, cleanupSyntheticPaidOrder } from "../helpers/accounting-orders";
import {
  cleanupAccountingTestData,
  cleanupTestProduct,
  createTestProductWithInventory,
  getAccountIdByCode,
  getInventory,
  prisma,
  type TestProductBundle
} from "../helpers/commerce";

describe("INVENTORY_COGS_RECOGNIZED_V1", () => {
  const orderIds: string[] = [];
  const bundles: TestProductBundle[] = [];
  const miscProducts: Array<{ productId: string; variantId: string }> = [];
  const envBackup = {
    native: process.env.NATIVE_ACCOUNTING_ENABLED,
    sales: process.env.ACCOUNTING_SALES_POSTING_ENABLED,
    inventory: process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED,
    cogs: process.env.ACCOUNTING_COGS_POSTING_ENABLED,
    cutover: process.env.ACCOUNTING_CUTOVER_DATE,
    forwardOnly: process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY
  };

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
    process.env.ACCOUNTING_COGS_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.ACCOUNTING_COGS_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
    delete process.env.ACCOUNTING_CUTOVER_DATE;
    delete process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY;
    resetAccountingCutoverCache();
  });

  afterEach(async () => {
    await cleanupAccountingTestData();
    for (const orderId of orderIds.splice(0)) {
      await cleanupSyntheticPaidOrder(orderId);
    }
    for (const bundle of bundles.splice(0)) {
      await cleanupTestProduct(bundle);
    }
    for (const row of miscProducts.splice(0)) {
      await prisma.productVariant.deleteMany({ where: { id: row.variantId } });
      await prisma.product.deleteMany({ where: { id: row.productId } });
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = envBackup.native ?? "0";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = envBackup.sales ?? "0";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = envBackup.inventory ?? "0";
    process.env.ACCOUNTING_COGS_POSTING_ENABLED = envBackup.cogs ?? "0";
    if (envBackup.cutover === undefined) delete process.env.ACCOUNTING_CUTOVER_DATE;
    else process.env.ACCOUNTING_CUTOVER_DATE = envBackup.cutover;
    if (envBackup.forwardOnly === undefined) delete process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY;
    else process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY = envBackup.forwardOnly;
    resetAccountingCutoverCache();
  });

  async function createLayer(
    bundle: TestProductBundle,
    opts: {
      quantity: number;
      unitCostInPaise: number;
      sourceType?: "OPENING" | "PURCHASE_RECEIPT";
      effectiveAt?: Date;
    }
  ) {
    const layer = await prisma.accountingInventoryCostLayer.create({
      data: {
        variantId: bundle.variantId,
        sourceType: opts.sourceType ?? "OPENING",
        sourceId: `TEST-ACC-LAYER-${randomUUID()}`,
        sourceLineId: randomUUID(),
        quantityOriginal: opts.quantity,
        quantityRemaining: opts.quantity,
        unitCostInPaise: opts.unitCostInPaise,
        totalCostInPaise: opts.quantity * opts.unitCostInPaise,
        effectiveAt: opts.effectiveAt ?? new Date("2026-08-23T00:00:00.000Z"),
        sourceFingerprint: `TEST-ACC-LAYER-FP-${randomUUID()}`,
        status: "ACTIVE"
      }
    });
    const inventoryAssetId = await getAccountIdByCode("1200");
    const offsetAccountId = await getAccountIdByCode(
      (opts.sourceType ?? "OPENING") === "PURCHASE_RECEIPT" ? "1210" : "3900"
    );
    await prisma.$transaction((tx) =>
      createAndPostJournalInTx(tx, {
        entryDate: opts.effectiveAt ?? new Date("2026-08-23T00:00:00.000Z"),
        memo: `TEST layer backing ${bundle.sku}`,
        lines: [
          {
            accountId: inventoryAssetId,
            debitInPaise: opts.quantity * opts.unitCostInPaise,
            creditInPaise: 0
          },
          {
            accountId: offsetAccountId,
            debitInPaise: 0,
            creditInPaise: opts.quantity * opts.unitCostInPaise
          }
        ]
      })
    );
    return layer;
  }

  async function createNativePaidOrder(
    lines: Array<{ bundle: TestProductBundle; qtyOrdered: number; unitPriceInPaise?: number }>
  ) {
    const order = await createSyntheticPaidOrder({
      lines: lines.map((line) => ({
        variantId: line.bundle.variantId,
        sku: line.bundle.sku,
        unitPriceInPaise: line.unitPriceInPaise ?? 100_000,
        qtyOrdered: line.qtyOrdered,
        nameSnapshot: `TEST-ACC-${line.bundle.sku}`
      }))
    });
    orderIds.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    return order;
  }

  async function createDigitalVariant() {
    const suffix = randomUUID().slice(0, 8);
    const product = await prisma.product.create({
      data: {
        slug: `test-acc-digital-${suffix}`,
        name: `TEST-ACC-DIGITAL-${suffix}`,
        status: "ACTIVE",
        productType: "DIGITAL",
        taxClass: "standard"
      }
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `COURSE-TEST-ACC-${suffix}`,
        mrpInPaise: 50_000,
        saleInPaise: 50_000,
        isDefault: true,
        status: "ACTIVE"
      }
    });
    miscProducts.push({ productId: product.id, variantId: variant.id });
    return { productId: product.id, variantId: variant.id, sku: variant.sku };
  }

  it("1. one layer exact consumption", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 3 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 5, unitCostInPaise: 50_000 });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 5 }]);

    const result = await postInventoryCogs({ orderId: order.id });
    expect(result.duplicate).toBe(false);
    expect(result.journalProposal?.totalCogsInPaise).toBe(250_000);

    const layer = await prisma.accountingInventoryCostLayer.findFirstOrThrow({ where: { variantId: bundle.variantId } });
    expect(layer.quantityRemaining).toBe(0);
    expect(layer.status).toBe("DEPLETED");
  });

  it("2. partial layer consumption", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 50_000 });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 4 }]);
    await postInventoryCogs({ orderId: order.id });
    const layer = await prisma.accountingInventoryCostLayer.findFirstOrThrow({ where: { variantId: bundle.variantId } });
    expect(layer.quantityRemaining).toBe(6);
  });

  it("3. multiple FIFO layers", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 50_000, effectiveAt: new Date("2026-08-20T00:00:00.000Z") });
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 60_000, sourceType: "PURCHASE_RECEIPT", effectiveAt: new Date("2026-08-24T00:00:00.000Z") });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 12 }]);

    const result = await postInventoryCogs({ orderId: order.id });
    expect(result.journalProposal?.totalCogsInPaise).toBe(620_000);
    const consumptions = await prisma.accountingInventoryCostConsumption.findMany({
      where: { orderId: order.id },
      orderBy: [{ unitCostInPaise: "asc" }]
    });
    expect(consumptions.map((c) => [c.quantityConsumed, c.unitCostInPaise])).toEqual([
      [10, 50_000],
      [2, 60_000]
    ]);
  });

  it("4. opening + purchase layers consume transparently", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 5, unitCostInPaise: 40_000, sourceType: "OPENING", effectiveAt: new Date("2026-08-19T00:00:00.000Z") });
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 50_000, sourceType: "PURCHASE_RECEIPT", effectiveAt: new Date("2026-08-24T00:00:00.000Z") });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 8 }]);
    const result = await postInventoryCogs({ orderId: order.id });
    expect(result.journalProposal?.totalCogsInPaise).toBe(350_000);
  });

  it("5-6. quantity >1 and multi-item physical order", async () => {
    const a = await createTestProductWithInventory({ onHand: 20 });
    const b = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(a, b);
    await createLayer(a, { quantity: 10, unitCostInPaise: 10_000 });
    await createLayer(b, { quantity: 10, unitCostInPaise: 20_000 });
    const order = await createNativePaidOrder([
      { bundle: a, qtyOrdered: 3 },
      { bundle: b, qtyOrdered: 2 }
    ]);
    const result = await postInventoryCogs({ orderId: order.id });
    expect(result.journalProposal?.totalCogsInPaise).toBe(70_000);
    expect(result.journalProposal?.perItemCost).toHaveLength(2);
  });

  it("7-9. physical + digital mixed, digital-only, and placeholder course are excluded", async () => {
    const physical = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(physical);
    await createLayer(physical, { quantity: 10, unitCostInPaise: 15_000 });
    const digital = await createDigitalVariant();

    const mixed = await createSyntheticPaidOrder({
      lines: [
        { variantId: physical.variantId, sku: physical.sku, unitPriceInPaise: 100_000, qtyOrdered: 2 },
        { variantId: digital.variantId, sku: digital.sku, unitPriceInPaise: 50_000, qtyOrdered: 1 }
      ]
    });
    orderIds.push(mixed.id);
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(mixed.id));
    const mixedPreview = await previewInventoryCogs({ orderId: mixed.id });
    expect(mixedPreview.journalProposal?.totalCogsInPaise).toBe(30_000);

    const digitalOnly = await createSyntheticPaidOrder({
      lines: [{ variantId: digital.variantId, sku: digital.sku, unitPriceInPaise: 50_000, qtyOrdered: 1 }]
    });
    orderIds.push(digitalOnly.id);
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(digitalOnly.id));
    const digitalPreview = await previewInventoryCogs({ orderId: digitalOnly.id });
    expect(digitalPreview.eligibility.code).toBe("NON_INVENTORY_ONLY");
  });

  it("10. insufficient layers does not partially post", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 3, unitCostInPaise: 50_000 });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 5 }]);
    const preview = await previewInventoryCogs({ orderId: order.id });
    expect(preview.eligibility.code).toBe("INSUFFICIENT_COST_LAYERS");
    await expect(postInventoryCogs({ orderId: order.id })).rejects.toMatchObject({ code: "INSUFFICIENT_COST_LAYERS" });
    expect(await prisma.accountingInventoryCostConsumption.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("11-12. zero/invalid layer state is rejected", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await prisma.accountingInventoryCostLayer.create({
      data: {
        variantId: bundle.variantId,
        sourceType: "OPENING",
        sourceId: `TEST-${randomUUID()}`,
        sourceLineId: randomUUID(),
        quantityOriginal: 2,
        quantityRemaining: 2,
        unitCostInPaise: 0,
        totalCostInPaise: 0,
        effectiveAt: new Date(),
        sourceFingerprint: `TEST-FP-${randomUUID()}`,
        status: "ACTIVE"
      }
    });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 1 }]);
    const preview = await previewInventoryCogs({ orderId: order.id });
    expect(preview.eligibility.code).toBe("COST_LAYER_DATA_GAP");
  });

  it("13-14. duplicate post and 20 concurrent same-order posts", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 20, unitCostInPaise: 10_000 });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 2 }]);
    const first = await postInventoryCogs({ orderId: order.id });
    expect(first.duplicate).toBe(false);
    const second = await postInventoryCogs({ orderId: order.id });
    expect(second.duplicate).toBe(true);

    const order2 = await createNativePaidOrder([{ bundle, qtyOrdered: 3 }]);
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => postInventoryCogs({ orderId: order2.id }))
    );
    const fulfilled = attempts.filter((a) => a.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof postInventoryCogs>>>[];
    expect(fulfilled.filter((r) => !r.value.duplicate)).toHaveLength(1);
  });

  it("15. two concurrent orders competing for same layer do not over-consume", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 10_000 });
    const a = await createNativePaidOrder([{ bundle, qtyOrdered: 7 }]);
    const b = await createNativePaidOrder([{ bundle, qtyOrdered: 5 }]);
    const results = await Promise.allSettled([
      postInventoryCogs({ orderId: a.id }),
      postInventoryCogs({ orderId: b.id })
    ]);
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.filter((r) => r.status === "rejected").length;
    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);
    const consumedQty = await prisma.accountingInventoryCostConsumption.aggregate({
      _sum: { quantityConsumed: true },
      where: { variantId: bundle.variantId }
    });
    expect(consumedQty._sum.quantityConsumed).toBeLessThanOrEqual(10);
  });

  it("16. source changed after post is detected", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 10_000 });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 2 }]);
    await postInventoryCogs({ orderId: order.id });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await prisma.orderItem.update({ where: { id: item.id }, data: { qtyOrdered: 3, lineTotalInPaise: 300_000 } });
    const preview = await previewInventoryCogs({ orderId: order.id });
    expect(preview.eligibility.code).toBe("SOURCE_CHANGED_AFTER_POST");
  });

  it("17-19. pre-cutover, missing OrderItems, and no native ORDER_PAID are skipped", async () => {
    process.env.ACCOUNTING_CUTOVER_DATE = "2026-08-25T00:00:00.000Z";
    process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY = "1";
    resetAccountingCutoverCache();

    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 10_000 });
    const preCutover = await createSyntheticPaidOrder({
      placedAt: new Date("2026-08-22T10:00:00.000Z"),
      lines: [{ variantId: bundle.variantId, sku: bundle.sku, unitPriceInPaise: 100_000, qtyOrdered: 1 }]
    });
    orderIds.push(preCutover.id);
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(preCutover.id), {
      forcePersist: true,
      allowPreCutover: true
    });
    expect((await previewInventoryCogs({ orderId: preCutover.id })).eligibility.code).toBe("PRE_CUTOVER");

    const emptyOrder = await prisma.order.create({
      data: {
        orderNumber: `SRV-EMPTY-${randomUUID().slice(0, 8)}`,
        email: "empty@test.local",
        phone: "9999900000",
        status: "PAID",
        paymentStatus: "CAPTURED",
        subtotalInPaise: 100_000,
        grandTotalInPaise: 100_000,
        currency: "INR",
        placedAt: new Date("2026-08-26T10:00:00.000Z"),
        addresses: {
          create: [{ type: "SHIPPING", fullName: "Empty", phone: "999", line1: "x", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "IN" }]
        },
        payments: { create: { provider: "RAZORPAY", amountInPaise: 100_000, currency: "INR", status: "CAPTURED" } }
      }
    });
    orderIds.push(emptyOrder.id);
    await prisma.accountingPostingEvent.create({
      data: {
        eventType: "ORDER_PAID",
        sourceType: "ORDER",
        sourceId: emptyOrder.id,
        uniqueKey: `order:${emptyOrder.id}:paid`,
        status: "POSTED",
        attemptCount: 1
      }
    });
    expect((await previewInventoryCogs({ orderId: emptyOrder.id })).eligibility.code).toBe("ORDER_ITEMS_MISSING");

    delete process.env.ACCOUNTING_CUTOVER_DATE;
    delete process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY;
    resetAccountingCutoverCache();
    const noPaid = await createSyntheticPaidOrder({
      lines: [{ variantId: bundle.variantId, sku: bundle.sku, unitPriceInPaise: 100_000, qtyOrdered: 1 }]
    });
    orderIds.push(noPaid.id);
    expect((await previewInventoryCogs({ orderId: noPaid.id })).eligibility.code).toBe("NO_NATIVE_ORDER_PAID");
  });

  it("20-23. closed period, feature flag, document link, and unique key", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 10_000 });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 1 }]);
    await prisma.accountingPeriod.create({
      data: {
        name: "AUG-CLOSED",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-08-31T23:59:59.999Z"),
        status: "CLOSED"
      }
    });
    await expect(postInventoryCogs({ orderId: order.id })).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_CLOSED" });
    await prisma.accountingPeriod.deleteMany({});

    process.env.ACCOUNTING_COGS_POSTING_ENABLED = "0";
    await expect(postInventoryCogs({ orderId: order.id })).rejects.toMatchObject({ code: "ACCOUNTING_COGS_POSTING_DISABLED" });
    process.env.ACCOUNTING_COGS_POSTING_ENABLED = "1";

    const posted = await postInventoryCogs({ orderId: order.id });
    const link = await prisma.accountingDocumentLink.findFirst({
      where: { documentType: "ORDER", documentId: order.id, journalEntryId: posted.journal.id }
    });
    expect(link?.journalEntryId).toBe(posted.journal.id);
    expect(inventoryCogsRecognizedUniqueKey(order.id)).toBe(`inventory_cogs:${order.id}`);
  });

  it("24-30. stock integrity and reconciliation/gl controls", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 4 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 10_000 });
    const onHandBefore = (await getInventory(bundle.variantId))!.onHand;
    const reservedBefore = (await getInventory(bundle.variantId))!.reserved;
    await prisma.productVariant.update({ where: { id: bundle.variantId }, data: { costInPaise: 77_000 } });
    const costBefore = (await prisma.productVariant.findUniqueOrThrow({ where: { id: bundle.variantId } })).costInPaise;

    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 3 }]);
    await postInventoryCogs({ orderId: order.id });

    const inv = await getInventory(bundle.variantId);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: bundle.variantId } });
    expect(inv?.onHand).toBe(onHandBefore);
    expect(inv?.reserved).toBe(reservedBefore);
    expect(variant.costInPaise).toBe(costBefore);

    const recon = await buildInventoryReconciliationV3({ sku: bundle.sku, limit: 10 });
    const row = recon.rows.find((r) => r.variantId === bundle.variantId);
    expect(row?.consumedQty).toBe(3);
    expect(row?.cogsPostedInPaise).toBe(30_000);
    expect(recon.financialControl.cogsGl5000InPaise).toBe(recon.financialControl.totalConsumptionValueInPaise);
    expect(recon.financialControl.inventoryGl1200InPaise).toBe(recon.financialControl.nativeLayersTotalValueInPaise);
  });

  it("31. discovery dry-run", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    bundles.push(bundle);
    await createLayer(bundle, { quantity: 10, unitCostInPaise: 10_000 });
    const order = await createNativePaidOrder([{ bundle, qtyOrdered: 2 }]);
    const result = await runInventoryCogsDiscovery({ orderId: order.id, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.posted).toBe(0);
    expect(result.results[0]?.action).toBe("preview");
  });
});
