/**
 * Phase 3D2 — Lightsail purchase capitalization validation.
 * Creates tagged TEST-ACC-* procurement lifecycle, posts bill + partial receipts,
 * validates 1210 clearing and FIFO layers. READ/WRITE test data only — tagged dummy rows.
 *
 * Usage (on machine with Lightsail SSH + pem):
 *   cd backend && npx tsx scripts/phase3d2-lightsail-capitalization-validation.ts
 */
import { randomUUID } from "crypto";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import { postVendorBillPostedJournal } from "../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../src/modules/accounting/vendor-bill-snapshot.service";
import { postPurchaseCapitalization } from "../src/modules/accounting/purchase-capitalization-posting.service";
import { buildPurchaseCapitalizationClearingReport } from "../src/modules/accounting/purchase-capitalization-clearing.service";
import { receivePurchaseOrder, enrichLines, sumDocumentTotals } from "../src/modules/purchases/purchases.service";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TAG = `TEST-ACC-FIFO-${randomUUID().slice(0, 8)}`;

async function main() {
  const required = [
    "NATIVE_ACCOUNTING_ENABLED",
    "ACCOUNTING_PURCHASES_POSTING_ENABLED",
    "ACCOUNTING_INVENTORY_VALUATION_ENABLED",
    "ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED",
    "ACCOUNTING_PRODUCTION_POSTING_ALLOWED",
    "SELLER_STATE"
  ];
  for (const k of required) {
    process.env[k] = process.env[k] ?? "1";
    if (k === "SELLER_STATE" && !process.env.SELLER_STATE) process.env.SELLER_STATE = "Karnataka";
  }

  const prisma = new PrismaClient();
  console.log("Phase 3D2 Lightsail validation");
  console.log("Tag:", TAG);
  console.log("DB:", (process.env.DATABASE_URL ?? "").replace(/:[^:@]+@/, ":***@").split("@")[1] ?? "local");

  await seedAccountingChartOfAccounts();

  const product = await prisma.product.create({
    data: {
      slug: `${TAG.toLowerCase()}-product`,
      name: `${TAG} Product`,
      status: "ACTIVE",
      productType: "SIMPLE",
      taxClass: "standard",
      hsnCode: "9205"
    }
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `${TAG}-SKU`,
      mrpInPaise: 100_000,
      saleInPaise: 100_000,
      isDefault: true,
      status: "ACTIVE",
      inventory: { create: { onHand: 0, reserved: 0 } }
    }
  });

  const vendor = await prisma.vendor.create({
    data: {
      name: `${TAG}-VENDOR`,
      gstin: "29AAAAA0000A1Z5",
      pan: "AAAAA0000A",
      billingState: "Karnataka",
      billingCountry: "IN",
      currency: "INR",
      isActive: true
    }
  });

  const rateInPaise = 50_000;
  const quantity = 10;
  const base = quantity * rateInPaise;
  const taxInPaise = Math.round((base * 18) / 100);

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: `${TAG}-PO`,
      vendorId: vendor.id,
      status: "SENT",
      subtotalInPaise: base,
      taxInPaise,
      totalInPaise: base + taxInPaise,
      lines: {
        create: [
          {
            variantId: variant.id,
            itemName: `${TAG} item`,
            sku: variant.sku,
            quantity,
            rateInPaise,
            taxClass: "standard",
            taxInPaise,
            lineTotalInPaise: base + taxInPaise
          }
        ]
      }
    },
    include: { lines: true }
  });

  const enriched = await enrichLines([
    { variantId: variant.id, itemName: `${TAG} item`, quantity, rateInPaise, taxClass: "standard" }
  ]);
  const totals = sumDocumentTotals(enriched);

  const bill = await prisma.vendorBill.create({
    data: {
      billNumber: `${TAG}-BILL`,
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      status: "OPEN",
      referenceNumber: `${TAG}-REF`,
      billDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400_000),
      subtotalInPaise: totals.subtotalInPaise,
      taxInPaise: totals.taxInPaise,
      totalInPaise: totals.totalInPaise,
      lines: {
        create: enriched.map((l) => ({
          variantId: l.variantId,
          itemName: l.itemName,
          sku: l.sku,
          quantity: l.quantity,
          rateInPaise: l.rateInPaise,
          taxClass: l.taxClass,
          taxInPaise: l.taxInPaise,
          lineTotalInPaise: l.lineTotalInPaise
        }))
      }
    }
  });

  await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
  console.log("Posted vendor bill → Dr 1210");

  const onHandBefore = (await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }))
    .onHand;

  const r1 = await receivePurchaseOrder(po.id, [{ poLineId: po.lines[0]!.id, quantityReceived: 4 }]);
  const line1 = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId: r1.receiptId } });
  const cap1 = await postPurchaseCapitalization(line1.id);
  console.log("Receipt 1 capitalized:", cap1.proposal.capitalizationValueInPaise, "paise (expect 200000)");

  const r2 = await receivePurchaseOrder(po.id, [{ poLineId: po.lines[0]!.id, quantityReceived: 6 }]);
  const line2 = await prisma.purchaseReceiptLine.findFirstOrThrow({ where: { receiptId: r2.receiptId } });
  const cap2 = await postPurchaseCapitalization(line2.id);
  console.log("Receipt 2 capitalized:", cap2.proposal.capitalizationValueInPaise, "paise (expect 300000)");

  const onHandAfter = (await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).onHand;
  const layers = await prisma.accountingInventoryCostLayer.findMany({
    where: { variantId: variant.id, sourceType: "PURCHASE_RECEIPT" },
    orderBy: { effectiveAt: "asc" }
  });

  const clearing = await buildPurchaseCapitalizationClearingReport({ vendorBillId: bill.id });

  const ok =
    cap1.proposal.capitalizationValueInPaise === 200_000 &&
    cap2.proposal.capitalizationValueInPaise === 300_000 &&
    layers.length === 2 &&
    layers[0]!.quantityOriginal === 4 &&
    layers[1]!.quantityOriginal === 6 &&
    onHandAfter === onHandBefore + 10 &&
    clearing.rows[0]?.status === "CLEARED" &&
    clearing.rows[0]?.clearing1210OutstandingInPaise === 0;

  console.log("\n--- Results ---");
  console.log("onHand delta:", onHandAfter - onHandBefore, "(expect +10 from ops receipt)");
  console.log("layers:", layers.map((l) => `${l.quantityOriginal}@${l.unitCostInPaise}`).join(" + "));
  console.log("1210 clearing status:", clearing.rows[0]?.status);
  console.log("1210 outstanding:", clearing.rows[0]?.clearing1210OutstandingInPaise);
  console.log("\nVERDICT:", ok ? "PHASE 3D2 PURCHASE CAPITALIZATION VALIDATED" : "PHASE 3D2 VALIDATION FAILED");

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
