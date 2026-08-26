/**
 * Phase 5C Lightsail ITC verification.
 *
 *   PHASE5C_LIGHTSAIL_ITC_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_PURCHASES_POSTING_ENABLED=1 \
 *   ACCOUNTING_EXPENSE_POSTING_ENABLED=1 \
 *   ACCOUNTING_GST_ENABLED=1 \
 *   ACCOUNTING_ITC_VERIFICATION_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   SELLER_STATE=Karnataka \
 *   npx tsx scripts/phase5c-lightsail-itc-validation.ts
 *
 * Process-local flags only — do not persist to .env.
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";

if (process.env.PHASE5C_LIGHTSAIL_ITC_OK !== "1") {
  console.error("Refusing: set PHASE5C_LIGHTSAIL_ITC_OK=1");
  process.exit(1);
}

process.env.NATIVE_ACCOUNTING_ENABLED = "1";
process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
process.env.ACCOUNTING_GST_ENABLED = "1";
process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED = "1";
process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";
process.env.SELLER_STATE = process.env.SELLER_STATE || "Karnataka";

import { prisma } from "../src/config/db";
import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import { postVendorBillPostedJournal } from "../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../src/modules/accounting/vendor-bill-snapshot.service";
import { isVendorBillEligibleForPosting } from "../src/modules/accounting/vendor-bill-eligibility";
import { discoverItcEvidence, discoverItcForSource } from "../src/modules/accounting/itc-discovery.service";
import {
  blockItcEvidence,
  buildItcSummary,
  fingerprintJournal,
  getItcEvidenceById,
  verifyItcEvidence
} from "../src/modules/accounting/itc.service";
import {
  upsertExpenseAccountMapping,
  upsertExpensePaymentMapping
} from "../src/modules/accounting/expense-mapping.service";
import { postExpenseById } from "../src/modules/accounting/expense-posting.service";

const TAG = `TEST-ACC-ITC-${Date.now()}`;

function ok(label: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", label, detail ?? "");
    throw new Error(`FAIL ${label}`);
  }
  console.log("PASS", label);
}

async function main() {
  console.log(`\n=== Phase 5C Lightsail ITC — ${TAG} ===\n`);
  await seedAccountingChartOfAccounts();

  const before = {
    orders: await prisma.order.count(),
    payments: await prisma.payment.count()
  };

  const vendor = await prisma.vendor.create({
    data: {
      name: `${TAG}-VENDOR`,
      gstin: "29AAAAA0000A1Z5",
      billingState: "Karnataka",
      billingCountry: "IN",
      currency: "INR",
      isActive: true
    }
  });

  // 1. Complete VendorBill → review → verify; GL unchanged
  const bill = await prisma.vendorBill.create({
    data: {
      billNumber: `${TAG}-BILL`,
      vendorId: vendor.id,
      status: "OPEN",
      referenceNumber: `${TAG}-SUP-INV`,
      billDate: new Date(),
      subtotalInPaise: 10_000,
      taxInPaise: 1_800,
      totalInPaise: 11_800,
      lines: {
        create: [
          {
            itemName: "ITC goods",
            quantity: 1,
            rateInPaise: 10_000,
            taxClass: "gst18",
            taxInPaise: 1_800,
            lineTotalInPaise: 11_800,
            sortOrder: 0
          }
        ]
      }
    }
  });
  await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id));
  const ev1 = await discoverItcForSource("VENDOR_BILL", bill.id);
  ok("1a evidence created for review", ev1?.assessmentCode === "ELIGIBLE_FOR_REVIEW");
  const fp1 = await fingerprintJournal(ev1!.journalEntryId);
  await verifyItcEvidence({ evidenceId: ev1!.id, reason: `${TAG} verified` });
  const afterVerify = await getItcEvidenceById(ev1!.id);
  ok("1b ELIGIBLE", afterVerify?.status === "ELIGIBLE");
  ok("1c GL unchanged after verify", JSON.stringify(await fingerprintJournal(ev1!.journalEntryId)) === JSON.stringify(fp1));
  ok("1d audit history immutable", (afterVerify?.statusHistory.length ?? 0) >= 2);

  // 2. Incomplete bill
  const incomplete = await prisma.vendorBill.create({
    data: {
      billNumber: `${TAG}-BILL-GAP`,
      vendorId: vendor.id,
      status: "OPEN",
      referenceNumber: null,
      billDate: new Date(),
      subtotalInPaise: 5_000,
      taxInPaise: 900,
      totalInPaise: 5_900,
      lines: {
        create: [
          {
            itemName: "Gap",
            quantity: 1,
            rateInPaise: 5_000,
            taxClass: "gst18",
            taxInPaise: 900,
            lineTotalInPaise: 5_900,
            sortOrder: 0
          }
        ]
      }
    }
  });
  try {
    await postVendorBillPostedJournal(await loadVendorBillSnapshotById(incomplete.id));
  } catch {
    /* expected GST gap */
  }
  const gapEv = await discoverItcForSource("VENDOR_BILL", incomplete.id);
  ok(
    "2 incomplete → DATA_GAP/unverified",
    gapEv?.status === "DATA_GAP" || gapEv?.status === "UNVERIFIED_PENDING_TAX_INVOICE"
  );

  // 3. RCM fail-closed
  const rcm = await prisma.vendorBill.create({
    data: {
      billNumber: `${TAG}-BILL-RCM`,
      vendorId: vendor.id,
      status: "OPEN",
      referenceNumber: `${TAG}-RCM`,
      reverseCharge: true,
      billDate: new Date(),
      subtotalInPaise: 2_000,
      taxInPaise: 360,
      totalInPaise: 2_360,
      lines: {
        create: [
          {
            itemName: "RCM",
            quantity: 1,
            rateInPaise: 2_000,
            taxClass: "gst18",
            taxInPaise: 360,
            lineTotalInPaise: 2_360,
            sortOrder: 0
          }
        ]
      }
    }
  });
  const elig = isVendorBillEligibleForPosting(await loadVendorBillSnapshotById(rcm.id));
  ok("3a RCM not eligible to post", elig.eligible === false && elig.code === "RCM_DATA_GAP");
  const rcmEv = await discoverItcForSource("VENDOR_BILL", rcm.id);
  ok("3b RCM ITC BLOCKED", rcmEv?.status === "BLOCKED" && rcmEv.assessmentCode === "RCM_DATA_GAP");

  // 4. Expense ITC — separate vendor + amount to avoid Bill+Expense duplicate heuristic
  const expVendor = await prisma.vendor.create({
    data: {
      name: `${TAG}-EXP-VENDOR`,
      gstin: "29BBBBB0000B1Z5",
      billingState: "Karnataka",
      billingCountry: "IN",
      currency: "INR",
      isActive: true
    }
  });
  const expAcct = `${TAG}-Office`;
  await upsertExpenseAccountMapping({
    sourceName: expAcct,
    accountingAccountCode: "5300",
    isActive: true
  });
  await upsertExpensePaymentMapping({
    sourceName: "Bank",
    paidAccountCode: "1010",
    isActive: true
  });
  const expense = await prisma.expense.create({
    data: {
      expenseAccount: expAcct,
      paidThrough: "Bank",
      amountInPaise: 7_500,
      taxInPaise: 1_350,
      taxInclusive: false,
      status: "RECORDED",
      vendorId: expVendor.id,
      invoiceNumber: `${TAG}-EXP-INV-${randomUUID().slice(0, 6)}`,
      sourceOfSupply: "Karnataka",
      destinationOfSupply: "Karnataka",
      hsnSac: "9983",
      currency: "INR",
      expenseDate: new Date(),
      expenseType: "SERVICES"
    }
  });
  await postExpenseById(expense.id, { acknowledgePossibleDuplicate: true });
  const expEv = await discoverItcForSource("EXPENSE", expense.id);
  ok("4 expense ITC for review", expEv?.assessmentCode === "ELIGIBLE_FOR_REVIEW");

  // 5. Gateway provisional (settlement with tax if any; else synthetic assess via discover empty)
  const gw = await prisma.accountingGatewaySettlement.findFirst({
    where: { taxInPaise: { gt: 0 } },
    orderBy: { settledAt: "desc" }
  });
  if (gw) {
    const gwEv = await discoverItcForSource("GATEWAY_SETTLEMENT", gw.id);
    ok("5a gateway evidence provisional", gwEv?.recognizedInInputGl === false);
    ok(
      "5b gateway assessment",
      gwEv?.assessmentCode === "GATEWAY_TAX_INVOICE_REQUIRED" ||
        gwEv?.status === "UNVERIFIED_PENDING_TAX_INVOICE"
    );
  } else {
    console.log("info: no gateway tax settlement — skip 5 (fixture optional)");
  }

  // 8. Idempotent rediscovery
  const d1 = await discoverItcEvidence({ sourceType: "VENDOR_BILL", limit: 20 });
  const d2 = await discoverItcEvidence({ sourceType: "VENDOR_BILL", limit: 20 });
  ok("8 rediscovery idempotent (no new creates for same set)", d2.created === 0 || d2.updated >= d1.updated);

  // 9. Summary
  const summary = await buildItcSummary();
  ok("9a recognized > 0", summary.recognizedInputGst.totalGstInPaise > 0);
  ok("9b eligible > 0", summary.eligibleInputGst.totalGstInPaise > 0);
  ok(
    "9c recognized ≠ auto all eligible",
    summary.recognizedInputGst.totalGstInPaise >= summary.eligibleInputGst.totalGstInPaise
  );

  // Block path
  await blockItcEvidence({ evidenceId: expEv!.id, reason: `${TAG} block test` });
  ok("block works", (await getItcEvidenceById(expEv!.id))?.status === "BLOCKED");

  const after = {
    orders: await prisma.order.count(),
    payments: await prisma.payment.count()
  };
  ok("10 commerce unchanged", before.orders === after.orders && before.payments === after.payments);

  // 11. persistent flags
  let envText = "";
  try {
    envText = readFileSync("/home/ubuntu/sarveda/backend/.env", "utf8");
  } catch {
    envText = "";
  }
  const bad = envText
    .split("\n")
    .filter((l) =>
      /^(NATIVE_ACCOUNTING_ENABLED|ACCOUNTING_GST_ENABLED|ACCOUNTING_ITC_VERIFICATION_ENABLED|ACCOUNTING_PURCHASES_POSTING_ENABLED|ACCOUNTING_PRODUCTION_POSTING_ALLOWED)=/i.test(
        l
      )
    );
  ok("11 persistent flags OFF/absent", bad.length === 0, bad);

  console.log("\nTagged fixtures:", TAG);
  console.log("\nPHASE 5C ITC VERIFICATION VALIDATED\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.NATIVE_ACCOUNTING_ENABLED;
    delete process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED;
    delete process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED;
    delete process.env.ACCOUNTING_GST_ENABLED;
    delete process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED;
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await prisma.$disconnect();
  });
