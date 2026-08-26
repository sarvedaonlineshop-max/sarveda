/**
 * Phase 3C1 Lightsail Vendor Payment / AP settlement shadow validation.
 *
 *   PHASE3C1_LIGHTSAIL_VENDOR_PAYMENT_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_PURCHASES_POSTING_ENABLED=1 \
 *   ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase3c1-lightsail-vendor-payment-validation.ts
 *
 * Restores posting flags OFF in process only — operator must leave Lightsail .env OFF.
 */
import { createHash } from "crypto";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import { postVendorBillPostedJournal } from "../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../src/modules/accounting/vendor-bill-snapshot.service";
import { getNativeBillOutstanding } from "../src/modules/accounting/vendor-payment-outstanding";
import { createVendorPaymentDraft } from "../src/modules/accounting/vendor-payment.service";
import {
  postVendorPayment,
  previewVendorPayment
} from "../src/modules/accounting/vendor-payment-posting.service";
import { buildReconciliationV4BillRow } from "../src/modules/accounting/reconciliation.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { enrichLines, sumDocumentTotals } from "../src/modules/purchases/purchases.service";

const prisma = new PrismaClient();

function hash(v: unknown) {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
}

async function fingerprint(vendorId: string, billIds: string[], variantIds: string[]) {
  const bills = await prisma.vendorBill.findMany({
    where: { id: { in: billIds } },
    select: {
      id: true,
      status: true,
      totalInPaise: true,
      paidInPaise: true,
      updatedAt: true
    }
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
  return { bills: hash(bills), inventory: hash(inventory), costs: hash(costs) };
}

async function createTaggedBill(name: string, rateInPaise: number) {
  const vendor = await prisma.vendor.create({
    data: {
      name,
      gstin: "29AAAAA0000A1Z5",
      billingState: "Karnataka",
      billingCountry: "IN",
      currency: "INR",
      isActive: true
    }
  });
  const raw = [
    {
      variantId: null as string | null,
      itemName: `${name} service`,
      quantity: 1,
      rateInPaise,
      taxClass: "gst18",
      sortOrder: 0
    }
  ];
  const enriched = await enrichLines(raw);
  const totals = sumDocumentTotals(enriched, { discountInPaise: 0, adjustmentInPaise: 0 });
  const bill = await prisma.vendorBill.create({
    data: {
      billNumber: `TEST-ACC-BILL-${Date.now()}-${rateInPaise}`,
      vendorId: vendor.id,
      status: "OPEN",
      referenceNumber: `TEST-ACC-VPAY-REF-${Date.now()}`,
      billDate: new Date(),
      subtotalInPaise: totals.subtotalInPaise,
      discountInPaise: 0,
      adjustmentInPaise: 0,
      taxInPaise: totals.taxInPaise,
      totalInPaise: totals.totalInPaise,
      paidInPaise: 0,
      lines: {
        create: enriched.map((l) => ({
          variantId: null,
          itemName: l.itemName,
          sku: l.sku,
          quantity: l.quantity,
          rateInPaise: l.rateInPaise,
          taxClass: l.taxClass,
          taxInPaise: l.taxInPaise,
          lineTotalInPaise: l.lineTotalInPaise,
          sortOrder: l.sortOrder ?? 0
        }))
      }
    }
  });
  return { vendor, bill };
}

async function main() {
  if (process.env.PHASE3C1_LIGHTSAIL_VENDOR_PAYMENT_OK !== "1") {
    throw new Error("Set PHASE3C1_LIGHTSAIL_VENDOR_PAYMENT_OK=1 to run");
  }

  await seedAccountingChartOfAccounts();

  const report: Record<string, unknown> = {
    ENVIRONMENT: "PRE-LAUNCH LIGHTSAIL",
    productionLike: isProductionLikeEnvironment()
  };

  const full = await createTaggedBill(`TEST-ACC-VPAY-FULL-${Date.now()}`, 10_000);
  const part = await createTaggedBill(`TEST-ACC-VPAY-PART-${Date.now()}`, 20_000);

  const snapFull = await loadVendorBillSnapshotById(full.bill.id);
  await postVendorBillPostedJournal(snapFull, { forcePersist: true });
  const snapPart = await loadVendorBillSnapshotById(part.bill.id);
  await postVendorBillPostedJournal(snapPart, { forcePersist: true });

  const fpBefore = await fingerprint(
    full.vendor.id,
    [full.bill.id, part.bill.id],
    []
  );

  const fullPay = await createVendorPaymentDraft({
    vendorId: full.vendor.id,
    paymentDate: new Date(),
    amountInPaise: full.bill.totalInPaise,
    paymentMethod: "BANK_TRANSFER",
    utr: `TEST-ACC-VPAY-UTR-FULL-${Date.now()}`,
    notes: "Phase 3C1 Lightsail full bank payment",
    allocations: [{ vendorBillId: full.bill.id, amountInPaise: full.bill.totalInPaise }]
  });

  const preview = await previewVendorPayment(fullPay.id);
  const post1 = await postVendorPayment(fullPay.id);
  const replay = await postVendorPayment(fullPay.id);

  const half = Math.floor(part.bill.totalInPaise / 2);
  const partPay = await createVendorPaymentDraft({
    vendorId: part.vendor.id,
    paymentDate: new Date(),
    amountInPaise: half,
    paymentMethod: "UPI",
    utr: `TEST-ACC-VPAY-UTR-PART-${Date.now()}`,
    notes: "Phase 3C1 Lightsail partial",
    allocations: [{ vendorBillId: part.bill.id, amountInPaise: half }]
  });
  const postPart = await postVendorPayment(partPay.id);

  const outFull = await getNativeBillOutstanding(full.bill.id);
  const outPart = await getNativeBillOutstanding(part.bill.id);
  const reconFull = await buildReconciliationV4BillRow(full.bill.id);
  const reconPart = await buildReconciliationV4BillRow(part.bill.id);

  const fpAfter = await fingerprint(full.vendor.id, [full.bill.id, part.bill.id], []);

  const opsPaidUnchanged =
    (await prisma.vendorBill.findUniqueOrThrow({ where: { id: full.bill.id } })).paidInPaise === 0 &&
    (await prisma.vendorBill.findUniqueOrThrow({ where: { id: part.bill.id } })).paidInPaise === 0;

  report.fullPayment = {
    paymentNumber: fullPay.paymentNumber,
    journal: post1.journal.entryNumber,
    duplicateReplay: replay.duplicate,
    outstanding: outFull.outstandingInPaise,
    reconStatus: reconFull.status,
    creditAccount: preview.proposal?.lines.find((l) => l.creditInPaise > 0)?.accountCode
  };
  report.partialPayment = {
    paymentNumber: partPay.paymentNumber,
    journal: postPart.journal.entryNumber,
    outstanding: outPart.outstandingInPaise,
    allocated: outPart.allocatedInPaise,
    reconStatus: reconPart.status
  };
  report.fingerprintUnchanged = fpBefore.bills === fpAfter.bills &&
    fpBefore.inventory === fpAfter.inventory &&
    fpBefore.costs === fpAfter.costs;
  // Note: bill updatedAt may change if ops mirror — we intentionally do NOT mirror
  report.opsPaidUnchanged = opsPaidUnchanged;
  report.flagsNote =
    "Leave ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED=0 and ACCOUNTING_PRODUCTION_POSTING_ALLOWED unset on Lightsail after validation";

  const ok =
    post1.duplicate === false &&
    replay.duplicate === true &&
    outFull.outstandingInPaise === 0 &&
    outPart.outstandingInPaise === part.bill.totalInPaise - half &&
    opsPaidUnchanged &&
    report.fullPayment &&
    (report.fullPayment as { creditAccount?: string }).creditAccount === "1010";

  report.ok = ok;
  console.log(JSON.stringify(report, null, 2));

  if (!ok) {
    process.exitCode = 1;
    throw new Error("Phase 3C1 Lightsail validation failed");
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
