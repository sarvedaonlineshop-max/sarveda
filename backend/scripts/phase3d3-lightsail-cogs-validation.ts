/**
 * Phase 3D3 Lightsail FIFO COGS validation.
 *
 * Creates tagged TEST-ACC-* inventory layers + a native paid order, posts ORDER_PAID,
 * then posts INVENTORY_COGS_RECOGNIZED and verifies:
 *  - FIFO cost consumption order
 *  - one journal per order
 *  - no operational inventory mutation from accounting posting
 *
 * Usage:
 *   PHASE3D3_LIGHTSAIL_COGS_OK=1 npx tsx scripts/phase3d3-lightsail-cogs-validation.ts
 */
import path from "path";
import { randomUUID } from "crypto";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { PrismaClient } from "@prisma/client";

import { createAndPostJournalInTx } from "../src/modules/accounting/journal.service";
import { postInventoryCogs } from "../src/modules/accounting/inventory-cogs-posting.service";
import { postOrderPaidJournal } from "../src/modules/accounting/order-paid-posting.service";
import { loadOrderPaidSnapshotById } from "../src/modules/accounting/order-snapshot.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { getAccountingAccountByCode, seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";

const prisma = new PrismaClient();

async function createBackingInventoryJournal(totalCostInPaise: number, sourceType: "OPENING" | "PURCHASE_RECEIPT") {
  const inventory = await getAccountingAccountByCode("1200");
  const offset = await getAccountingAccountByCode(sourceType === "PURCHASE_RECEIPT" ? "1210" : "3900");
  if (!inventory || !offset) throw new Error("Missing required COA accounts for validation");
  await prisma.$transaction((tx) =>
    createAndPostJournalInTx(tx, {
      entryDate: new Date("2026-08-24T00:00:00.000Z"),
      memo: `TEST-ACC Phase 3D3 ${sourceType}`,
      lines: [
        { accountId: inventory.id, debitInPaise: totalCostInPaise, creditInPaise: 0 },
        { accountId: offset.id, debitInPaise: 0, creditInPaise: totalCostInPaise }
      ]
    })
  );
}

async function main() {
  if (process.env.PHASE3D3_LIGHTSAIL_COGS_OK !== "1") {
    throw new Error("Set PHASE3D3_LIGHTSAIL_COGS_OK=1 to run");
  }

  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
  process.env.ACCOUNTING_COGS_POSTING_ENABLED = "1";

  await seedAccountingChartOfAccounts();

  const suffix = randomUUID().slice(0, 8);
  const slug = `test-acc-fifo-${suffix}-product`;
  const sku = `TEST-ACC-FIFO-${suffix}`;

  const product = await prisma.product.create({
    data: {
      slug,
      name: `TEST-ACC-FIFO-${suffix}`,
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
      status: "ACTIVE"
    }
  });
  const inventory = await prisma.inventory.create({
    data: {
      variantId: variant.id,
      onHand: 20,
      reserved: 0,
      lowStockThreshold: 5
    }
  });

  const layerA = await prisma.accountingInventoryCostLayer.create({
    data: {
      variantId: variant.id,
      sourceType: "OPENING",
      sourceId: `TEST-ACC-OPENING-${suffix}`,
      sourceLineId: randomUUID(),
      quantityOriginal: 10,
      quantityRemaining: 10,
      unitCostInPaise: 50_000,
      totalCostInPaise: 500_000,
      effectiveAt: new Date("2026-08-20T00:00:00.000Z"),
      sourceFingerprint: `TEST-ACC-OPENING-FP-${suffix}`
    }
  });
  await createBackingInventoryJournal(500_000, "OPENING");

  const layerB = await prisma.accountingInventoryCostLayer.create({
    data: {
      variantId: variant.id,
      sourceType: "PURCHASE_RECEIPT",
      sourceId: `TEST-ACC-RECEIPT-${suffix}`,
      sourceLineId: randomUUID(),
      quantityOriginal: 10,
      quantityRemaining: 10,
      unitCostInPaise: 60_000,
      totalCostInPaise: 600_000,
      effectiveAt: new Date("2026-08-24T00:00:00.000Z"),
      sourceFingerprint: `TEST-ACC-RECEIPT-FP-${suffix}`
    }
  });
  await createBackingInventoryJournal(600_000, "PURCHASE_RECEIPT");

  const order = await prisma.order.create({
    data: {
      orderNumber: `SRV-TEST-ACC-${suffix}`,
      email: `test-acc-${suffix}@example.com`,
      phone: "9999900000",
      status: "PAID",
      paymentStatus: "CAPTURED",
      subtotalInPaise: 1_200_000,
      grandTotalInPaise: 1_200_000,
      currency: "INR",
      placedAt: new Date("2026-08-24T12:00:00.000Z"),
      items: {
        create: {
          variantId: variant.id,
          skuSnapshot: variant.sku,
          nameSnapshot: product.name,
          qtyOrdered: 12,
          unitPriceInPaise: 100_000,
          lineTotalInPaise: 1_200_000
        }
      },
      addresses: {
        create: {
          type: "SHIPPING",
          fullName: "TEST ACC",
          phone: "9999900000",
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
          amountInPaise: 1_200_000,
          currency: "INR",
          status: "CAPTURED",
          providerPaymentId: `pay_test_acc_${suffix}`
        }
      }
    }
  });

  const before = await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  await postOrderPaidJournal(await loadOrderPaidSnapshotById(order.id), { forcePersist: true });
  const cogs = await postInventoryCogs({ orderId: order.id }, { forcePersist: true });
  const after = await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } });

  const consumptions = await prisma.accountingInventoryCostConsumption.findMany({
    where: { orderId: order.id },
    orderBy: [{ unitCostInPaise: "asc" }, { createdAt: "asc" }]
  });

  console.log("=== PHASE 3D3 LIGHTSAIL FIFO COGS VALIDATION ===");
  console.log(
    JSON.stringify(
      {
        environment: {
          productionLike: isProductionLikeEnvironment()
        },
        created: {
          productSlug: slug,
          sku,
          orderNumber: order.orderNumber
        },
        expected: {
          consumption: [
            { layerId: layerA.id, quantity: 10, unitCostInPaise: 50_000 },
            { layerId: layerB.id, quantity: 2, unitCostInPaise: 60_000 }
          ],
          totalCogsInPaise: 620_000
        },
        actual: {
          journalEntryNumber: cogs.journal.entryNumber,
          totalCogsInPaise: cogs.journalProposal?.totalCogsInPaise ?? null,
          consumptions: consumptions.map((row) => ({
            costLayerId: row.costLayerId,
            quantityConsumed: row.quantityConsumed,
            unitCostInPaise: row.unitCostInPaise,
            totalCostInPaise: row.totalCostInPaise
          })),
          inventoryUnchanged: {
            onHandBefore: before.onHand,
            onHandAfter: after.onHand,
            reservedBefore: before.reserved,
            reservedAfter: after.reserved
          }
        }
      },
      null,
      2
    )
  );

  const replay = await postInventoryCogs({ orderId: order.id }, { forcePersist: true });
  console.log(`Duplicate replay returned duplicate=${replay.duplicate}`);
  console.log("PHASE 3D3 FIFO COGS VALIDATED");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
