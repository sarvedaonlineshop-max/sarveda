/**
 * Phase 3C3 Lightsail purchase reconciliation validation.
 *
 *   PHASE3C3_LIGHTSAIL_PURCHASE_RECON_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   npx tsx scripts/phase3c3-lightsail-purchase-recon-validation.ts
 */
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { getCutoverConfigSummary } from "../src/modules/accounting/accounting-cutover";
import {
  buildPurchaseAccountingDashboard,
  buildPurchaseReconciliationReport
} from "../src/modules/accounting/purchase-reconciliation.service";
import { buildReconciliationV4BillRow } from "../src/modules/accounting/reconciliation.service";

const prisma = new PrismaClient();

async function main() {
  if (process.env.PHASE3C3_LIGHTSAIL_PURCHASE_RECON_OK !== "1") {
    throw new Error("Set PHASE3C3_LIGHTSAIL_PURCHASE_RECON_OK=1 to run");
  }

  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: ["OPEN", "PAID"] } },
    select: { id: true, billNumber: true },
    orderBy: { billDate: "desc" },
    take: 20
  });

  const expenses = await prisma.expense.findMany({
    where: { status: "RECORDED" },
    select: { id: true },
    take: 20
  });

  const payments = await prisma.accountingVendorPayment.findMany({
    where: { status: { in: ["DRAFT", "POSTED"] } },
    select: { id: true, paymentNumber: true },
    take: 20
  });

  console.log("Cutover config:", getCutoverConfigSummary());
  console.log(`Scanning ${bills.length} bills, ${expenses.length} expenses, ${payments.length} payments`);

  const dashboard = await buildPurchaseAccountingDashboard({
    billLimit: Math.max(bills.length, 10),
    expenseLimit: Math.max(expenses.length, 10)
  });

  console.log("Dashboard AP recognized:", dashboard.vendorBills.totalNativeApRecognizedInPaise);
  console.log("Dashboard AP outstanding:", dashboard.vendorBills.totalNativeOutstandingInPaise);
  console.log("Ops paid / native unpaid:", dashboard.dataQuality.opsPaidNativeUnpaidCount);
  console.log("Aging buckets:", dashboard.aging);

  if (bills[0]) {
    const row = await buildReconciliationV4BillRow(bills[0].id);
    console.log("Sample bill recon:", {
      billNumber: row.billNumber,
      status: row.status,
      agingBucket: row.agingBucket,
      cutoverClassification: row.cutoverClassification,
      outstanding: row.outstandingNativeApInPaise
    });
  }

  const report = await buildPurchaseReconciliationReport({
    billIds: bills.slice(0, 5).map((b) => b.id),
    expenseIds: expenses.slice(0, 5).map((e) => e.id),
    paymentIds: payments.slice(0, 5).map((p) => p.id)
  });

  console.log("Unified report version:", report.version);
  console.log("PHASE 3C3 LIGHTSAIL PURCHASE RECON VALIDATED");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
