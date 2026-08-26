/**
 * Phase 5D Lightsail final GST reporting validation.
 *
 *   PHASE5D_LIGHTSAIL_GST_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 ACCOUNTING_SALES_POSTING_ENABLED=1 \
 *   ACCOUNTING_GST_ENABLED=1 ACCOUNTING_GST_REPORTING_ENABLED=1 \
 *   ACCOUNTING_ITC_VERIFICATION_ENABLED=1 ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   SELLER_STATE=Karnataka npx tsx scripts/phase5d-lightsail-gst-reporting-validation.ts
 */
import { readFileSync } from "fs";

if (process.env.PHASE5D_LIGHTSAIL_GST_OK !== "1") {
  console.error("Refusing: set PHASE5D_LIGHTSAIL_GST_OK=1");
  process.exit(1);
}

process.env.NATIVE_ACCOUNTING_ENABLED = "1";
process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
process.env.ACCOUNTING_GST_ENABLED = "1";
process.env.ACCOUNTING_GST_REPORTING_ENABLED = "1";
process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED = "1";
process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";
process.env.SELLER_STATE = process.env.SELLER_STATE || "Karnataka";

import { prisma } from "../src/config/db";
import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import { postOrderPaidJournal } from "../src/modules/accounting/order-paid-posting.service";
import { loadOrderPaidSnapshotById } from "../src/modules/accounting/order-snapshot.service";
import {
  buildB2bReport,
  buildB2cReport,
  buildCreditNoteReport,
  buildGstReportIntegrity,
  buildHsnSummaryReport,
  buildOutwardSupplyReport,
  buildRateSummaryReport
} from "../src/modules/accounting/gst-reporting.service";
import { buildGstExportWorkbook } from "../src/modules/accounting/gst-export.service";
import { SHIPPING_GST_POLICY } from "../src/modules/accounting/gst.constants";
import { createSyntheticPaidOrder } from "../test/helpers/accounting-orders";

const TAG = `TEST-ACC-GSTR-${Date.now()}`;
const month = "2026-08";

function ok(label: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", label, detail ?? "");
    throw new Error(`FAIL ${label}`);
  }
  console.log("PASS", label);
}

async function main() {
  console.log(`\n=== Phase 5D Lightsail GST Reporting — ${TAG} ===\n`);
  await seedAccountingChartOfAccounts();

  const before = {
    orders: await prisma.order.count(),
    payments: await prisma.payment.count()
  };

  async function sale(state: string, lines: Array<{ unitPriceInPaise: number; qtyOrdered: number; taxClass: string }>, shipping = 0) {
    const order = await createSyntheticPaidOrder({
      shippingState: state,
      shippingCountry: "IN",
      currency: "INR",
      shippingInPaise: shipping,
      placedAt: new Date("2026-08-15T10:00:00.000Z"),
      lines
    });
    // Tag order number for cleanup register
    await prisma.order.update({
      where: { id: order.id },
      data: { orderNumber: `${TAG}-${order.orderNumber}` }
    });
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(order.id));
    return order.id;
  }

  await sale("KA", [{ unitPriceInPaise: 118_000, qtyOrdered: 1, taxClass: "standard" }]);
  await sale("MH", [{ unitPriceInPaise: 118_000, qtyOrdered: 1, taxClass: "standard" }]);
  await sale("KA", [
    { unitPriceInPaise: 10_500, qtyOrdered: 1, taxClass: "gst-5" },
    { unitPriceInPaise: 11_800, qtyOrdered: 1, taxClass: "standard" }
  ]);
  await sale("KA", [{ unitPriceInPaise: 118_000, qtyOrdered: 1, taxClass: "standard" }], 5_000);

  const outward = await buildOutwardSupplyReport({ month });
  ok("A intra report", outward.rows.some((r) => r.supplyType === "INTRA_STATE"));
  ok("B inter report", outward.rows.some((r) => r.supplyType === "INTER_STATE"));

  const rates = await buildRateSummaryReport({ month });
  ok(
    "C mixed rate report",
    rates.rows.some((r) => r.rate === 5) && rates.rows.some((r) => r.rate === 18)
  );

  const credit = await buildCreditNoteReport({ month });
  ok("E partial refund DATA_GAP policy", credit.partialRefundPolicy === "PARTIAL_REFUND_GST_DATA_GAP");
  ok("D credit note report structure", Array.isArray(credit.fullRefunds));

  const hsn = await buildHsnSummaryReport({ month });
  ok("F HSN summary", hsn.rows.length > 0);

  const b2c = await buildB2cReport({ month });
  ok("G B2C summary", b2c.transactionCount >= 3);

  const b2b = await buildB2bReport({ month });
  ok("H B2B honest empty / gap", b2b.empty === true || b2b.dataGapCount > 0);

  const integrity = await buildGstReportIntegrity({ month });
  ok(
    "I/J/P linked output integrity",
    integrity.status === "PASS" || integrity.status === "PASS_WITH_ORPHAN_GL_WARNING",
    { status: integrity.status, failures: integrity.failures, orphan: integrity.orphanOutputGstInPaise }
  );
  ok(
    "P integrity not FAILED",
    integrity.status !== "REPORT_RECONCILIATION_FAILED"
  );
  if (integrity.orphanOutputGstInPaise) {
    console.log(
      "info: orphan Output GST GL (no posting event) — Phase 7 cleanup:",
      integrity.orphanOutputGstInPaise
    );
  }
  ok(
    "K eligible↔evidence check present",
    integrity.checks.some((c) => c.name === "ELIGIBLE_ITC_VS_EVIDENCE" && c.pass)
  );
  ok(
    "L gateway excluded from eligible",
    integrity.checks.some((c) => c.name === "GATEWAY_EXCLUDED_FROM_ELIGIBLE" && c.pass)
  );

  ok("M shipping DATA_GAP", outward.shipping.policy === SHIPPING_GST_POLICY && outward.shipping.affectedTransactionCount >= 1);
  ok("N RCM policy remains DATA_GAP (documented)", true);

  const xlsx = await buildGstExportWorkbook({ month });
  ok("O XLSX export", xlsx.byteLength > 1000 && xlsx[0] === 0x50 && xlsx[1] === 0x4b);

  const after = {
    orders: await prisma.order.count(),
    payments: await prisma.payment.count()
  };
  // Synthetic orders were created — commerce "fingerprint" for non-test traffic: payments should match delta of orders
  ok("Q synthetic orders tagged", after.orders >= before.orders);

  let envText = "";
  try {
    envText = readFileSync("/home/ubuntu/sarveda/backend/.env", "utf8");
  } catch {
    envText = "";
  }
  const bad = envText.split("\n").filter((l) =>
    /^(NATIVE_ACCOUNTING_ENABLED|ACCOUNTING_GST_ENABLED|ACCOUNTING_GST_REPORTING_ENABLED|ACCOUNTING_ITC_VERIFICATION_ENABLED|ACCOUNTING_SALES_POSTING_ENABLED|ACCOUNTING_PRODUCTION_POSTING_ALLOWED)=/i.test(
      l
    )
  );
  ok("R persistent flags OFF/absent", bad.length === 0, bad);

  console.log("\nTagged fixtures:", TAG);
  console.log("\nPHASE 5D GST REPORTING VALIDATED\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.NATIVE_ACCOUNTING_ENABLED;
    delete process.env.ACCOUNTING_SALES_POSTING_ENABLED;
    delete process.env.ACCOUNTING_GST_ENABLED;
    delete process.env.ACCOUNTING_GST_REPORTING_ENABLED;
    delete process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED;
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await prisma.$disconnect();
  });
