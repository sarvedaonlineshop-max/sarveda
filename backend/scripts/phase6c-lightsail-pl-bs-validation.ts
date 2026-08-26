/**
 * Phase 6C Lightsail validation — P&L / Balance Sheet / Dashboard (read-only over GL).
 *
 *   NATIVE_ACCOUNTING_ENABLED=1 ACCOUNTING_REPORTS_ENABLED=1 \
 *   npx tsx scripts/phase6c-lightsail-pl-bs-validation.ts
 *
 * Does not persist flags to .env. Does not fix Phase 7 data.
 */
process.env.NATIVE_ACCOUNTING_ENABLED = "1";
process.env.ACCOUNTING_REPORTS_ENABLED = "1";

import { prisma } from "../src/config/db";
import { buildProfitLoss } from "../src/modules/accounting/profit-loss.service";
import { buildBalanceSheet } from "../src/modules/accounting/balance-sheet.service";
import { buildFinancialDashboard } from "../src/modules/accounting/financial-dashboard.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  console.log("=== Phase 6C Lightsail P&L/BS validation ===");
  console.log("DB:", dbUrl.replace(/:[^:@/]+@/, ":****@").slice(0, 100));
  assert(!/localhost|127\.0\.0\.1/.test(dbUrl), "not localhost");
  console.log("isProductionLikeEnvironment:", isProductionLikeEnvironment());

  const asOf = new Date().toISOString().slice(0, 10);
  const from = "2026-04-01";
  const to = asOf;

  const pl = await buildProfitLoss({ from, to, includeComparison: true });
  console.log("P&L", {
    from,
    to,
    net: pl.totals.netProfitInPaise,
    integrity: pl.integrity.status,
    variance: pl.integrity.varianceInPaise,
    margin: pl.totals.grossMarginPercent
  });
  assert(pl.integrity.status === "PASS", `P&L integrity ${pl.integrity.varianceInPaise}`);

  const bs = await buildBalanceSheet({ asOf, includeComparison: false });
  console.log("BS", {
    asOf,
    balanced: bs.totals.balanced,
    diff: bs.totals.differenceInPaise,
    assets: bs.totals.totalAssetsInPaise,
    liab: bs.totals.totalLiabilitiesInPaise,
    equity: bs.totals.totalEquityInPaise,
    currentEarn: bs.earnings.currentFyEarningsInPaise,
    priorUnclosed: bs.earnings.priorUnclosedEarningsInPaise,
    fy: bs.fy.label
  });
  assert(bs.totals.balanced, `BS unbalanced diff=${bs.totals.differenceInPaise}`);

  const c1210 = bs.sections.liabilities.find((l) => l.key === "clearing-cr");
  if (c1210) {
    console.log("1210 credit under liabilities:", c1210.amountInPaise);
  } else {
    console.log("1210 credit line absent (zero or debit)");
  }

  const itc = bs.sections.assets.filter((l) => l.key.startsWith("itc-"));
  console.log("Input GST asset lines:", itc.length, itc.map((l) => l.amountInPaise));

  const out = bs.sections.liabilities.filter((l) => l.key.startsWith("out-gst-"));
  console.log("Output GST liability lines:", out.length);

  const banks = bs.sections.assets.find((l) => l.key === "bank");
  console.log("Bank header children:", banks?.children?.length ?? 0);

  const dash = await buildFinancialDashboard({ from, to, asOf });
  assert(
    dash.profitAndLoss.netProfitInPaise === pl.totals.netProfitInPaise,
    "dashboard net != P&L"
  );
  assert(dash.balanceSheet.balanced === bs.totals.balanced, "dashboard BS flag mismatch");
  console.log("Dashboard OK", {
    net: dash.profitAndLoss.netProfitInPaise,
    cashBank: dash.balanceSheet.cashAndBankInPaise
  });

  const reLines = await prisma.accountingJournalLine.count({
    where: { account: { code: "3100" } }
  });
  assert(reLines === 0, "3100 must remain unused (no close)");

  const orders = await prisma.order.count();
  console.log("Orders unchanged count:", orders);
  console.log("NOTE: Lightsail figures are TEST-ACC contaminated — not production financials.");
  console.log("PHASE 6C LIGHTSAIL VALIDATION PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
