/**
 * Dry-run: count identifiable accounting UAT fixtures (TEST-UAT-ACC-* / TEST-ACC*).
 * Does NOT delete anything.
 *
 *   cd backend && npx ts-node --transpile-only scripts/uat-cleanup-dry-run.ts
 */
import { PrismaClient } from "@prisma/client";

async function safeCount(label: string, fn: () => Promise<number>) {
  try {
    return { label, count: await fn(), ok: true as const };
  } catch (err) {
    return {
      label,
      count: -1,
      ok: false as const,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await Promise.all([
      safeCount("journals.memo", () =>
        prisma.accountingJournalEntry.count({
          where: {
            OR: [
              { memo: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { memo: { contains: "TEST-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("journals.entryNumber", () =>
        prisma.accountingJournalEntry.count({
          where: {
            OR: [
              { entryNumber: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { entryNumber: { contains: "TEST-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("postingEvents.uniqueKey", () =>
        prisma.accountingPostingEvent.count({
          where: {
            OR: [
              { uniqueKey: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { uniqueKey: { contains: "TEST-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("documentLinks.documentId", () =>
        prisma.accountingDocumentLink.count({
          where: {
            OR: [
              { documentId: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { documentId: { contains: "TEST-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("openingBatches.batchNumber", () =>
        prisma.accountingOpeningBatch.count({
          where: {
            OR: [
              { batchNumber: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { batchNumber: { contains: "TEST-ACC", mode: "insensitive" } },
              { description: { contains: "TEST-UAT-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("bankTransfers.reference", () =>
        prisma.accountingBankTransfer.count({
          where: {
            OR: [
              { reference: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { memo: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { transferNumber: { contains: "TEST-UAT-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("vendorBills.billNumber", () =>
        prisma.vendorBill.count({
          where: {
            OR: [
              { billNumber: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { referenceNumber: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { notes: { contains: "TEST-UAT-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("vendorPayments.paymentNumber", () =>
        prisma.accountingVendorPayment.count({
          where: {
            OR: [
              { paymentNumber: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { notes: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { utr: { contains: "TEST-UAT-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("expenses", () =>
        prisma.expense.count({
          where: {
            OR: [
              { notes: { contains: "TEST-UAT-ACC", mode: "insensitive" } },
              { referenceNumber: { contains: "TEST-UAT-ACC", mode: "insensitive" } }
            ]
          }
        })
      ),
      safeCount("purchaseOrders.poNumber", () =>
        prisma.purchaseOrder.count({
          where: { poNumber: { contains: "TEST-UAT-ACC", mode: "insensitive" } }
        })
      )
    ]);

    const report = {
      generatedAt: new Date().toISOString(),
      execute: false,
      pattern: "TEST-UAT-ACC*|TEST-ACC*",
      counts: Object.fromEntries(rows.map((r) => [r.label, r.count])),
      errors: rows.filter((r) => !r.ok),
      preserveAlways: [
        "Order",
        "Payment",
        "Refund",
        "User/Customer",
        "Product / ProductVariant",
        "Inventory operational onHand",
        "Shipment"
      ],
      note: "Dry-run only. Do not execute cleanup until Phase 7D prep. Dependencies: posting events → journals → document links; vendor payments → bills; bank matches → statement lines."
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
