/**
 * Phase 3B Lightsail Vendor Bill / AP shadow validation.
 *
 *   PHASE3B_LIGHTSAIL_VENDOR_BILL_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_PURCHASES_POSTING_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase3b-lightsail-vendor-bill-validation.ts
 */
import { createHash } from "crypto";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import {
  postVendorBillPostedJournal,
  previewVendorBillPostedJournal
} from "../src/modules/accounting/vendor-bill-posting.service";
import { runVendorBillDiscovery } from "../src/modules/accounting/vendor-bill-discovery-worker";
import { buildReconciliationV4BillRow } from "../src/modules/accounting/reconciliation.service";
import { loadVendorBillSnapshotById } from "../src/modules/accounting/vendor-bill-snapshot.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { enrichLines, sumDocumentTotals } from "../src/modules/purchases/purchases.service";

const prisma = new PrismaClient();

function hash(v: unknown) {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
}

async function fingerprintPurchases(vendorId: string, billId: string, variantIds: string[]) {
  const bills = await prisma.vendorBill.findMany({
    where: { id: billId },
    select: {
      id: true,
      status: true,
      totalInPaise: true,
      paidInPaise: true,
      taxInPaise: true,
      updatedAt: true
    }
  });
  const vendors = await prisma.vendor.findMany({
    where: { id: vendorId },
    select: { id: true, gstin: true, updatedAt: true }
  });
  const inventory = variantIds.length
    ? await prisma.inventory.findMany({
        where: { variantId: { in: variantIds } },
        select: { variantId: true, onHand: true, reserved: true }
      })
    : [];
  const costs = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, costInPaise: true }
      })
    : [];
  return {
    bills: hash(bills),
    vendors: hash(vendors),
    inventory: hash(inventory),
    costs: hash(costs)
  };
}

async function main() {
  if (process.env.PHASE3B_LIGHTSAIL_VENDOR_BILL_OK !== "1") {
    throw new Error("Set PHASE3B_LIGHTSAIL_VENDOR_BILL_OK=1 to run");
  }

  await seedAccountingChartOfAccounts();

  const report: Record<string, unknown> = {
    ENVIRONMENT: "PRE-LAUNCH LIGHTSAIL",
    productionLike: isProductionLikeEnvironment(),
    PURCHASES_OPERATIONAL_MODIFICATIONS: "NONE (accounting-only + tagged fixtures)"
  };

  // Prefer existing OPEN bill with GST evidence; else create tagged fixture
  let bill = await prisma.vendorBill.findFirst({
    where: {
      status: { in: ["OPEN", "PAID"] },
      totalInPaise: { gt: 0 },
      referenceNumber: { not: null },
      vendor: { gstin: { not: null }, billingState: { not: null } },
      lines: { some: {} }
    },
    include: { lines: true, vendor: true },
    orderBy: { billDate: "desc" }
  });

  let createdFixture = false;
  let fixtureVendorId: string | null = null;
  let fixtureBillId: string | null = null;
  const variantIds: string[] = [];

  if (!bill) {
    createdFixture = true;
    const vendor = await prisma.vendor.create({
      data: {
        name: `TEST-ACC-PURCHASE-LIGHTSAIL-${Date.now()}`,
        gstin: "29AAAAA0000A1Z5",
        billingState: "Karnataka",
        billingCountry: "IN",
        currency: "INR",
        isActive: true
      }
    });
    fixtureVendorId = vendor.id;
    const raw = [
      {
        variantId: null as string | null,
        itemName: "TEST-ACC-PURCHASE service",
        quantity: 1,
        rateInPaise: 10_000,
        taxClass: "gst18",
        sortOrder: 0
      }
    ];
    const enriched = await enrichLines(raw);
    const totals = sumDocumentTotals(enriched, {});
    bill = await prisma.vendorBill.create({
      data: {
        billNumber: `TEST-ACC-BILL-LS-${Date.now()}`,
        vendorId: vendor.id,
        status: "OPEN",
        referenceNumber: `TEST-ACC-SUP-INV-${Date.now()}`,
        billDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000),
        subtotalInPaise: totals.subtotalInPaise,
        taxInPaise: totals.taxInPaise,
        totalInPaise: totals.totalInPaise,
        lines: {
          create: enriched.map((l) => ({
            variantId: null,
            itemName: l.itemName,
            quantity: l.quantity,
            rateInPaise: l.rateInPaise,
            taxClass: l.taxClass,
            taxInPaise: l.taxInPaise,
            lineTotalInPaise: l.lineTotalInPaise,
            sortOrder: 0
          }))
        }
      },
      include: { lines: true, vendor: true }
    });
    fixtureBillId = bill.id;
  }

  for (const l of bill.lines) {
    if (l.variantId) variantIds.push(l.variantId);
  }

  const fpBefore = await fingerprintPurchases(bill.vendorId, bill.id, variantIds);
  report.selectedBill = {
    id: bill.id,
    billNumber: bill.billNumber,
    status: bill.status,
    totalInPaise: bill.totalInPaise,
    createdFixture
  };

  const snap = await loadVendorBillSnapshotById(bill.id);
  const preview = await previewVendorBillPostedJournal(snap);
  report.preview = {
    eligible: preview.eligibility.eligible,
    code: preview.eligibility.code,
    balanced: preview.proposal?.balanced ?? false,
    stockClearing: preview.proposal?.diagnostics.stockClearingInPaise,
    expense: preview.proposal?.diagnostics.expenseInPaise,
    gst: preview.proposal?.diagnostics.gst,
    buildError: preview.buildError ?? null
  };

  const dry = await runVendorBillDiscovery({ billId: bill.id, dryRun: true, limit: 1 });
  report.dryRunDiscovery = dry.rows[0] ?? null;

  const alreadyPosted = preview.postingEvent?.status === "POSTED" || preview.eligibility.code === "ALREADY_POSTED";
  const canPost =
    (preview.eligibility.eligible || alreadyPosted) &&
    preview.proposal?.balanced &&
    !preview.buildError;

  if (!canPost) {
    report.verdict = "PHASE 3B VALIDATION FAILED";
    report.reason = "preview not eligible/balanced";
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const post1 = await postVendorBillPostedJournal(snap);
  const post2 = await postVendorBillPostedJournal(snap);
  report.post = {
    duplicateFirst: post1.duplicate,
    journal: post1.journal.entryNumber,
    debit: post1.journal.totalDebitInPaise,
    credit: post1.journal.totalCreditInPaise,
    replayDuplicate: post2.duplicate
  };

  const recon = await buildReconciliationV4BillRow(bill.id);
  report.reconciliationV4 = {
    status: recon.status,
    journalEntryNumber: recon.journalEntryNumber,
    outstandingNativeApInPaise: recon.outstandingNativeApInPaise,
    nativeVendorPaymentInPaise: recon.nativeVendorPaymentInPaise
  };

  // Bounded batch dry-run ≤10 (explicit bulk flag for controlled Lightsail validation only)
  const prevBulk = process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED;
  process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED = "1";
  const batch = await runVendorBillDiscovery({ dryRun: true, limit: 10 });
  if (prevBulk === undefined) delete process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED;
  else process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED = prevBulk;
  report.batchDryRun = { scanned: batch.scanned, dryRun: batch.dryRun };

  const fpAfter = await fingerprintPurchases(bill.vendorId, bill.id, variantIds);
  report.fingerprint = { before: fpBefore, after: fpAfter, unchanged: JSON.stringify(fpBefore) === JSON.stringify(fpAfter) };

  if (!report.fingerprint || !(report.fingerprint as { unchanged: boolean }).unchanged) {
    report.verdict = "PHASE 3B VALIDATION FAILED";
    report.reason = "purchase/stock fingerprint changed";
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // Cleanup only fixture we created (keep accounting journal as shadow evidence OR delete fixture bill?)
  // Keep tagged fixture + accounting rows for audit; do not delete genuine data.
  report.fixtureRetained = createdFixture
    ? { vendorId: fixtureVendorId, billId: fixtureBillId }
    : null;

  report.ACCOUNTING_SHADOW_WRITES = {
    journalEntryNumber: post1.journal.entryNumber,
    lines: post1.proposal.lines
  };

  report.verdict = "PHASE 3B VENDOR BILL/AP SHADOW VALIDATED";
  console.log(JSON.stringify(report, null, 2));
  console.log("WROTE_REPORT /tmp/phase3b-vendor-bill-report.json");
  const fs = await import("fs");
  fs.writeFileSync("/tmp/phase3b-vendor-bill-report.json", JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
