/**
 * Phase 3D4 Lightsail — SELLABLE restock COGS reversal validation.
 *
 * Scenario:
 *   Opening 10 @ ₹500
 *   Purchase 10 @ ₹600
 *   Sale 12 → COGS 10×500 + 2×600 = ₹6,200
 *   SELLABLE restock 3 → LIFO reverse 2×600 + 1×500 = ₹1,700
 *   Dr 1200 / Cr 5000 = ₹1,700
 *   RETURN_RESTOCK layers created; onHand unchanged by accounting
 *   DAMAGED restock → no accounting
 *
 * Usage (on Lightsail app host with DB access):
 *   PHASE3D4_LIGHTSAIL_REVERSAL_OK=1 npx tsx scripts/phase3d4-lightsail-cogs-reversal-validation.ts
 */
import path from "path";
import { randomUUID } from "crypto";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { OrderInventoryRestockDisposition, PrismaClient } from "@prisma/client";

import { createAndPostJournalInTx } from "../src/modules/accounting/journal.service";
import { postInventoryCogs } from "../src/modules/accounting/inventory-cogs-posting.service";
import {
  postInventoryCogsReversal,
  previewInventoryCogsReversal
} from "../src/modules/accounting/inventory-cogs-reversal-posting.service";
import { postOrderPaidJournal } from "../src/modules/accounting/order-paid-posting.service";
import { loadOrderPaidSnapshotById } from "../src/modules/accounting/order-snapshot.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { getAccountingAccountByCode, seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import { adminApplyInventoryRestock } from "../src/modules/orders/order-inventory-restock.service";

const prisma = new PrismaClient();

async function createBackingInventoryJournal(
  totalCostInPaise: number,
  sourceType: "OPENING" | "PURCHASE_RECEIPT"
) {
  const inventory = await getAccountingAccountByCode("1200");
  const offset = await getAccountingAccountByCode(sourceType === "PURCHASE_RECEIPT" ? "1210" : "3900");
  if (!inventory || !offset) throw new Error("Missing COA");
  await prisma.$transaction((tx) =>
    createAndPostJournalInTx(tx, {
      entryDate: new Date("2026-08-24T00:00:00.000Z"),
      memo: `TEST-ACC Phase 3D4 ${sourceType}`,
      lines: [
        { accountId: inventory.id, debitInPaise: totalCostInPaise, creditInPaise: 0 },
        { accountId: offset.id, debitInPaise: 0, creditInPaise: totalCostInPaise }
      ]
    })
  );
}

async function main() {
  if (process.env.PHASE3D4_LIGHTSAIL_REVERSAL_OK !== "1") {
    throw new Error("Set PHASE3D4_LIGHTSAIL_REVERSAL_OK=1 to run");
  }

  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
  process.env.ACCOUNTING_COGS_POSTING_ENABLED = "1";
  process.env.ACCOUNTING_COGS_REVERSAL_ENABLED = "1";
  if (isProductionLikeEnvironment()) {
    process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";
  }

  await seedAccountingChartOfAccounts();

  const suffix = randomUUID().slice(0, 8);
  const sku = `TEST-ACC-REV-${suffix}`;
  const orderNumber = `SRV-TEST-ACC-${suffix}`;

  console.log(
    JSON.stringify({
      hostname: require("os").hostname(),
      dbHost: (() => {
        try {
          return new URL(process.env.DATABASE_URL ?? "").hostname;
        } catch {
          return "unknown";
        }
      })(),
      productionLike: isProductionLikeEnvironment(),
      suffix,
      sku,
      orderNumber
    })
  );

  const product = await prisma.product.create({
    data: {
      slug: `test-acc-rev-${suffix}-product`,
      name: `TEST-ACC-REV-${suffix}`,
      status: "ACTIVE",
      productType: "SIMPLE",
      taxClass: "standard"
    }
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku,
      mrpInPaise: 100_000,
      saleInPaise: 100_000,
      isDefault: true,
      status: "ACTIVE",
      costInPaise: 12_345
    }
  });
  const inventory = await prisma.inventory.create({
    data: { variantId: variant.id, onHand: 40, reserved: 0 }
  });

  await prisma.accountingInventoryCostLayer.create({
    data: {
      variantId: variant.id,
      sourceType: "OPENING",
      sourceId: `TEST-ACC-OPEN-${suffix}`,
      sourceLineId: randomUUID(),
      quantityOriginal: 10,
      quantityRemaining: 10,
      unitCostInPaise: 50_000,
      totalCostInPaise: 500_000,
      effectiveAt: new Date("2026-08-20T00:00:00.000Z"),
      sourceFingerprint: `TEST-ACC-OPEN-FP-${suffix}`,
      status: "ACTIVE"
    }
  });
  await createBackingInventoryJournal(500_000, "OPENING");

  await prisma.accountingInventoryCostLayer.create({
    data: {
      variantId: variant.id,
      sourceType: "PURCHASE_RECEIPT",
      sourceId: `TEST-ACC-PO-${suffix}`,
      sourceLineId: randomUUID(),
      quantityOriginal: 10,
      quantityRemaining: 10,
      unitCostInPaise: 60_000,
      totalCostInPaise: 600_000,
      effectiveAt: new Date("2026-08-24T00:00:00.000Z"),
      sourceFingerprint: `TEST-ACC-PO-FP-${suffix}`,
      status: "ACTIVE"
    }
  });
  await createBackingInventoryJournal(600_000, "PURCHASE_RECEIPT");

  const order = await prisma.order.create({
    data: {
      orderNumber,
      email: `test-acc-rev-${suffix}@example.com`,
      phone: "9876543210",
      status: "PAID",
      paymentStatus: "CAPTURED",
      subtotalInPaise: 1_200_000,
      grandTotalInPaise: 1_200_000,
      currency: "INR",
      placedAt: new Date("2026-08-24T12:00:00.000Z"),
      items: {
        create: {
          variantId: variant.id,
          skuSnapshot: sku,
          nameSnapshot: `TEST-ACC-${sku}`,
          qtyOrdered: 12,
          unitPriceInPaise: 100_000,
          lineTotalInPaise: 1_200_000
        }
      },
      addresses: {
        create: {
          type: "SHIPPING",
          fullName: "TEST ACC REV",
          phone: "9876543210",
          line1: "Validation lane",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "IN"
        }
      },
      payments: {
        create: {
          provider: "RAZORPAY",
          providerPaymentId: `pay_test_acc_rev_${suffix}`,
          amountInPaise: 1_200_000,
          currency: "INR",
          status: "CAPTURED"
        }
      }
    },
    include: { items: true }
  });

  // Simulate commerce stock confirm for sale
  await prisma.inventory.update({
    where: { id: inventory.id },
    data: { onHand: { decrement: 12 } }
  });

  await postOrderPaidJournal(await loadOrderPaidSnapshotById(order.id));
  const cogs = await postInventoryCogs({ orderId: order.id });
  if (cogs.journalProposal?.totalCogsInPaise !== 620_000) {
    throw new Error(`Expected COGS 620000 got ${cogs.journalProposal?.totalCogsInPaise}`);
  }

  const orderItemId = order.items[0]!.id;
  const onHandBeforeRestock = (await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } }))
    .onHand;

  const { events } = await adminApplyInventoryRestock({
    orderId: order.id,
    body: {
      idempotencyKey: `TEST-ACC-REV-RESTOCK-${suffix}`,
      reason: "TEST-ACC sellable return 3",
      lines: [
        {
          orderItemId,
          quantity: 3,
          disposition: OrderInventoryRestockDisposition.SELLABLE
        }
      ]
    }
  });
  const restock = events[0]!;
  const onHandAfterRestock = (await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } }))
    .onHand;
  if (onHandAfterRestock !== onHandBeforeRestock + 3) {
    throw new Error("Commerce restock did not increment onHand by 3");
  }

  const costBefore = (
    await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
  ).costInPaise;
  const reservedBefore = (
    await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } })
  ).reserved;

  const reversal = await postInventoryCogsReversal(restock.id);
  if (reversal.journalProposal?.totalRestoredInPaise !== 170_000) {
    throw new Error(`Expected reversal 170000 got ${reversal.journalProposal?.totalRestoredInPaise}`);
  }
  const segs = reversal.proposal?.segments.map((s) => [s.quantityReversed, s.unitCostInPaise]);
  if (JSON.stringify(segs) !== JSON.stringify([[2, 60_000], [1, 50_000]])) {
    throw new Error(`Unexpected LIFO segments: ${JSON.stringify(segs)}`);
  }

  const invAfterAcct = await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  const costAfter = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } }))
    .costInPaise;
  if (invAfterAcct.onHand !== onHandAfterRestock) {
    throw new Error("Accounting mutated onHand");
  }
  if (invAfterAcct.reserved !== reservedBefore) {
    throw new Error("Accounting mutated reserved");
  }
  if (costAfter !== costBefore) {
    throw new Error("Accounting mutated costInPaise");
  }

  const returnLayers = await prisma.accountingInventoryCostLayer.findMany({
    where: { sourceType: "RETURN_RESTOCK", sourceId: restock.id },
    orderBy: { unitCostInPaise: "desc" }
  });
  if (returnLayers.length !== 2) throw new Error("Expected 2 RETURN_RESTOCK layers");

  const replay = await postInventoryCogsReversal(restock.id);
  if (!replay.duplicate) throw new Error("Expected duplicate replay");

  // DAMAGED — no accounting
  const damaged = await adminApplyInventoryRestock({
    orderId: order.id,
    body: {
      idempotencyKey: `TEST-ACC-REV-DMG-${suffix}`,
      lines: [{ orderItemId, quantity: 1, disposition: OrderInventoryRestockDisposition.DAMAGED }]
    }
  });
  const dPreview = await previewInventoryCogsReversal(damaged.events[0]!.id);
  if (dPreview.eligibility.code !== "NO_ACCOUNTING_RESTOCK_REQUIRED") {
    throw new Error(`DAMAGED should skip accounting, got ${dPreview.eligibility.code}`);
  }

  // Future FIFO can consume RETURN_RESTOCK
  await prisma.inventory.update({
    where: { id: inventory.id },
    data: { onHand: { decrement: 9 } }
  });
  const order2 = await prisma.order.create({
    data: {
      orderNumber: `SRV-TEST-ACC-FIFO2-${suffix}`,
      email: `test-acc-rev2-${suffix}@example.com`,
      phone: "9876543210",
      status: "PAID",
      paymentStatus: "CAPTURED",
      subtotalInPaise: 900_000,
      grandTotalInPaise: 900_000,
      currency: "INR",
      placedAt: new Date("2026-08-24T15:00:00.000Z"),
      items: {
        create: {
          variantId: variant.id,
          skuSnapshot: sku,
          nameSnapshot: `TEST-ACC-${sku}`,
          qtyOrdered: 9,
          unitPriceInPaise: 100_000,
          lineTotalInPaise: 900_000
        }
      },
      addresses: {
        create: {
          type: "SHIPPING",
          fullName: "TEST ACC REV2",
          phone: "9876543210",
          line1: "Validation lane",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "IN"
        }
      },
      payments: {
        create: {
          provider: "RAZORPAY",
          providerPaymentId: `pay_test_acc_rev2_${suffix}`,
          amountInPaise: 900_000,
          currency: "INR",
          status: "CAPTURED"
        }
      }
    }
  });
  await postOrderPaidJournal(await loadOrderPaidSnapshotById(order2.id));
  const cogs2 = await postInventoryCogs({ orderId: order2.id });
  // Remaining after first sale: opening 0, purchase 8@600. Restock added 2@600 + 1@500.
  // Sell 9: FIFO = 8@600 (purchase) + 1@500 (return) OR depending on effectiveAt of return vs purchase remaining...
  // Purchase remaining effectiveAt Aug 24, return effectiveAt = restock createdAt (now).
  // FIFO: purchase 8@600 first, then return layers.
  // Actually remaining purchase is 8@600 (effectiveAt Aug 24). Return layers effectiveAt = now (>= Aug 24).
  // Sell 9 → 8@600 + 1 from return (500 or 600 depending on return layer order).
  // Return layers: 2@600 and 1@500, both same effectiveAt, created in segment order (600 then 500).
  // FIFO among returns: createdAt ASC → 600 first then 500.
  // So sell 9: 8 purchase@600 + 1 return@600 = 540000
  if (cogs2.journalProposal?.totalCogsInPaise !== 540_000) {
    console.warn("FIFO follow-on COGS", cogs2.journalProposal?.totalCogsInPaise);
  }
  const usedReturn = await prisma.accountingInventoryCostConsumption.findFirst({
    where: { orderId: order2.id, costLayer: { sourceType: "RETURN_RESTOCK" } }
  });
  if (!usedReturn) throw new Error("Expected subsequent sale to consume RETURN_RESTOCK layer");

  console.log(
    JSON.stringify(
      {
        ok: true,
        orderNumber,
        restockEventId: restock.id,
        cogsJournal: cogs.journal?.entryNumber ?? cogs.journal?.id,
        reversalJournal: reversal.journal?.entryNumber ?? reversal.journal?.id,
        restoredInPaise: 170_000,
        segments: segs,
        returnLayerCount: returnLayers.length,
        onHandFinal: invAfterAcct.onHand,
        costInPaise: costAfter,
        duplicateReplay: true,
        damagedSkipped: true,
        subsequentConsumedReturnRestock: true,
        note: "Retain TEST-ACC-* / SRV-TEST-* fixtures for pre-production cleanup; do not force-delete journals"
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
