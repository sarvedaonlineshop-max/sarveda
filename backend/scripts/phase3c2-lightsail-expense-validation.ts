/**
 * Phase 3C2 Lightsail standalone expense shadow validation.
 *
 *   PHASE3C2_LIGHTSAIL_EXPENSE_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_EXPENSE_POSTING_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase3c2-lightsail-expense-validation.ts
 */
import { createHash } from "crypto";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import {
  seedDefaultExpensePaymentMappings,
  upsertExpenseAccountMapping
} from "../src/modules/accounting/expense-mapping.service";
import { postExpenseById, previewExpenseById } from "../src/modules/accounting/expense-posting.service";
import { runExpenseDiscovery } from "../src/modules/accounting/expense-discovery-worker";
import { buildReconciliationV5ExpenseRow } from "../src/modules/accounting/reconciliation.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

const prisma = new PrismaClient();

function hash(v: unknown) {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
}

async function fingerprint() {
  const bills = await prisma.vendorBill.count();
  const payments = await prisma.accountingVendorPayment.count();
  const inv = await prisma.inventory.aggregate({ _sum: { onHand: true, reserved: true } });
  return {
    bills,
    payments,
    inventory: hash(inv)
  };
}

async function main() {
  if (process.env.PHASE3C2_LIGHTSAIL_EXPENSE_OK !== "1") {
    throw new Error("Set PHASE3C2_LIGHTSAIL_EXPENSE_OK=1 to run");
  }

  await seedAccountingChartOfAccounts();
  await seedDefaultExpensePaymentMappings();
  await upsertExpenseAccountMapping({
    sourceName: "TEST-ACC-EXP-Office",
    accountingAccountCode: "5310"
  });
  await upsertExpenseAccountMapping({
    sourceName: "TEST-ACC-EXP-Professional",
    accountingAccountCode: "5320"
  });

  const existing = await prisma.expense.groupBy({
    by: ["expenseAccount"],
    _count: true
  });

  const vendor = await prisma.vendor.create({
    data: {
      name: `TEST-ACC-EXP-VENDOR-${Date.now()}`,
      gstin: "29AAAAA0000A1Z5",
      billingState: "Karnataka",
      billingCountry: "IN",
      currency: "INR",
      isActive: true
    }
  });

  const nonTax = await prisma.expense.create({
    data: {
      expenseAccount: "TEST-ACC-EXP-Office",
      paidThrough: "Bank",
      amountInPaise: 4_500,
      taxInPaise: 0,
      taxInclusive: false,
      status: "RECORDED",
      expenseType: "SERVICES",
      notes: "Phase 3C2 Lightsail non-tax",
      expenseDate: new Date()
    }
  });

  const gst = await prisma.expense.create({
    data: {
      expenseAccount: "TEST-ACC-EXP-Professional",
      paidThrough: "UPI",
      amountInPaise: 10_000,
      taxInPaise: 1_800,
      taxInclusive: false,
      status: "RECORDED",
      vendorId: vendor.id,
      invoiceNumber: `TEST-ACC-EXP-INV-${Date.now()}`,
      sourceOfSupply: "Karnataka",
      destinationOfSupply: "Karnataka",
      expenseType: "SERVICES",
      notes: "Phase 3C2 Lightsail GST",
      expenseDate: new Date()
    }
  });

  const fpBefore = await fingerprint();

  const previewNonTax = await previewExpenseById(nonTax.id);
  const postNonTax = await postExpenseById(nonTax.id);
  const replayNonTax = await postExpenseById(nonTax.id);

  const previewGst = await previewExpenseById(gst.id);
  const postGst = await postExpenseById(gst.id);
  const replayGst = await postExpenseById(gst.id);

  const reconNonTax = await buildReconciliationV5ExpenseRow(nonTax.id);
  const reconGst = await buildReconciliationV5ExpenseRow(gst.id);

  const discovery = await runExpenseDiscovery({
    expenseId: nonTax.id,
    dryRun: true,
    limit: 10
  });

  const fpAfter = await fingerprint();

  const report = {
    ENVIRONMENT: "PRE-LAUNCH LIGHTSAIL",
    productionLike: isProductionLikeEnvironment(),
    existingExpenseAccounts: existing,
    nonTax: {
      expenseId: nonTax.id,
      journal: postNonTax.journal.entryNumber,
      credit: previewNonTax.proposal?.diagnostics.paymentAccountCode,
      debit: previewNonTax.proposal?.diagnostics.expenseAccountCode,
      duplicateReplay: replayNonTax.duplicate,
      recon: reconNonTax.status
    },
    gst: {
      expenseId: gst.id,
      journal: postGst.journal.entryNumber,
      jurisdiction: previewGst.proposal?.diagnostics.gst.jurisdiction,
      duplicateReplay: replayGst.duplicate,
      recon: reconGst.status
    },
    discoveryDryRun: { scanned: discovery.scanned, dryRun: discovery.dryRun },
    fingerprintStable:
      fpBefore.bills === fpAfter.bills &&
      fpBefore.payments === fpAfter.payments &&
      fpBefore.inventory === fpAfter.inventory,
    flagsNote: "Leave ACCOUNTING_EXPENSE_POSTING_ENABLED unset/OFF on Lightsail .env"
  };

  const ok =
    postNonTax.duplicate === false &&
    replayNonTax.duplicate === true &&
    postGst.duplicate === false &&
    replayGst.duplicate === true &&
    previewNonTax.proposal?.diagnostics.paymentAccountCode === "1010" &&
    previewGst.proposal?.diagnostics.gst.jurisdiction === "INTRA_STATE" &&
    reconNonTax.status === "POSTED" &&
    reconGst.status === "POSTED" &&
    report.fingerprintStable;

  console.log(JSON.stringify({ ...report, ok }, null, 2));
  if (!ok) {
    process.exitCode = 1;
    throw new Error("Phase 3C2 Lightsail validation failed");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
