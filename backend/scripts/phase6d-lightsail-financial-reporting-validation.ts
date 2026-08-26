/**
 * Phase 6D Lightsail final financial-reporting validation (read-only over GL).
 *
 *   NATIVE_ACCOUNTING_ENABLED=1 ACCOUNTING_REPORTS_ENABLED=1 \
 *   npx tsx scripts/phase6d-lightsail-financial-reporting-validation.ts
 *
 * Does not persist flags to .env. Does not fix Phase 7 data.
 */
process.env.NATIVE_ACCOUNTING_ENABLED = "1";
process.env.ACCOUNTING_REPORTS_ENABLED = "1";

import { prisma } from "../src/config/db";
import { buildTrialBalance } from "../src/modules/accounting/trial-balance.service";
import { buildProfitLoss } from "../src/modules/accounting/profit-loss.service";
import { buildBalanceSheet } from "../src/modules/accounting/balance-sheet.service";
import { buildFinancialDashboard } from "../src/modules/accounting/financial-dashboard.service";
import {
  buildFinancialIntegrityReport,
  buildTestFixtureRegister
} from "../src/modules/accounting/financial-integrity.service";
import {
  buildFinancialStatementsWorkbook,
  buildProfitLossPdf,
  buildBalanceSheetPdf,
  buildTrialBalancePdf
} from "../src/modules/accounting/financial-export.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { sanitizeSpreadsheetCell } from "../src/modules/accounting/gst-export.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  console.log("=== Phase 6D Lightsail financial reporting final validation ===");
  console.log("host/app: lightsail backend path expected /home/ubuntu/sarveda/backend");
  console.log("DB:", dbUrl.replace(/:[^:@/]+@/, ":****@").slice(0, 120));
  assert(!/localhost|127\.0\.0\.1/.test(dbUrl), "not localhost");
  console.log("isProductionLikeEnvironment:", isProductionLikeEnvironment());
  console.log(
    "persistent flags check (process only; .env must remain ABSENT):",
    {
      NATIVE_ACCOUNTING_ENABLED: process.env.NATIVE_ACCOUNTING_ENABLED,
      ACCOUNTING_REPORTS_ENABLED: process.env.ACCOUNTING_REPORTS_ENABLED
    }
  );

  const asOf = new Date().toISOString().slice(0, 10);
  const from = "2026-04-01";
  const to = asOf;

  // A — POSTED journals balanced
  const unbalanced = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM "AccountingJournalEntry"
    WHERE status = 'POSTED' AND "totalDebitInPaise" <> "totalCreditInPaise"
  `;
  assert(Number(unbalanced[0]?.n ?? 0) === 0, "unbalanced POSTED journals");
  console.log("A. POSTED journals balanced: OK");

  // B — TB
  const tb = await buildTrialBalance({ asOf });
  assert(tb.balanced, `TB imbalance ${tb.varianceInPaise}`);
  console.log("B. Trial Balance balanced:", {
    dr: tb.totals.closingDebitInPaise,
    cr: tb.totals.closingCreditInPaise
  });

  // C — P&L
  const pl = await buildProfitLoss({ from, to });
  assert(pl.integrity.status === "PASS", `P&L integrity ${pl.integrity.varianceInPaise}`);
  console.log("C. P&L integrity PASS", { net: pl.totals.netProfitInPaise });

  // D/E — BS + current earnings
  const bs = await buildBalanceSheet({ asOf });
  assert(bs.totals.differenceInPaise === 0, `BS diff ${bs.totals.differenceInPaise}`);
  assert(
    bs.earnings.currentFyEarningsInPaise === pl.totals.netProfitInPaise ||
      bs.earnings.currentFyTo !== to,
    "current earnings vs P&L (same FY window when to=asOf within FY)"
  );
  // When to === asOf and asOf in current FY starting Apr 1, earnings should match FY-start→asOf P&L
  const plFy = await buildProfitLoss({ from: bs.earnings.currentFyFrom, to: asOf });
  assert(
    bs.earnings.currentFyEarningsInPaise === plFy.totals.netProfitInPaise,
    "current FY earnings != P&L FY window"
  );
  console.log("D/E. BS balanced + current earnings OK", {
    assets: bs.totals.totalAssetsInPaise,
    currentEarn: bs.earnings.currentFyEarningsInPaise,
    priorUnclosed: bs.earnings.priorUnclosedEarningsInPaise
  });

  // F — 3100
  const re = await prisma.accountingJournalLine.count({
    where: { account: { code: "3100" } }
  });
  assert(re === 0, "3100 has journal lines");
  console.log("F. 3100 untouched: OK");

  // G — 1210
  const c1210 = bs.sections.liabilities.find((l) => l.key === "clearing-cr");
  console.log("G. 1210 credit liability presentation:", c1210?.amountInPaise ?? 0);

  // H — dynamic banks
  const bankHeader = bs.sections.assets.find((l) => l.key === "bank");
  console.log("H. Dynamic bank GL children:", bankHeader?.children?.length ?? 0);

  // I–M integrity
  const integrity = await buildFinancialIntegrityReport({ asOf, from, to });
  console.log("Integrity overall:", integrity.overallStatus, integrity.summary);
  assert(integrity.productionCutoverReady === false, "must not claim production ready");
  const by = Object.fromEntries(integrity.checks.map((c) => [c.code, c]));
  assert(by.TB_DEBITS_EQUAL_CREDITS?.status === "PASS", "TB check");
  assert(by.BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY?.status === "PASS", "BS check");
  assert(by.PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS?.status === "PASS", "PL check");
  console.log("I. GST:", by.GST_GL_VS_GST_REPORT?.status, by.GST_GL_VS_GST_REPORT?.message);
  console.log("J. Inventory GL vs FIFO:", by.INVENTORY_GL_VS_FIFO?.varianceInPaise);
  console.log("K. AP GL vs subledger:", by.AP_GL_VS_SUBLEDGER?.varianceInPaise);
  console.log("L. Orphan journals:", by.ORPHAN_JOURNALS?.actualInPaise);
  console.log("M. TEST contamination:", by.TEST_FIXTURE_CONTAMINATION?.message);

  const fixtures = await buildTestFixtureRegister();
  console.log("TEST fixture register journals:", fixtures.journals.length);

  // N — XLSX
  assert(sanitizeSpreadsheetCell("=1+1") === "'=1+1", "formula injection");
  const xlsx = await buildFinancialStatementsWorkbook({ asOf, from, to });
  assert(xlsx.totals.plNetProfitInPaise === pl.totals.netProfitInPaise, "xlsx P&L != service");
  assert(xlsx.totals.bsAssetsInPaise === bs.totals.totalAssetsInPaise, "xlsx BS != service");
  assert(xlsx.totals.tbClosingDebitInPaise === tb.totals.closingDebitInPaise, "xlsx TB != service");
  console.log("N. XLSX totals match services:", xlsx.buffer.byteLength, "bytes");

  // O — PDF
  const plPdf = await buildProfitLossPdf({ from, to });
  const bsPdf = await buildBalanceSheetPdf({ asOf });
  const tbPdf = await buildTrialBalancePdf({ asOf });
  assert(plPdf.netProfitInPaise === pl.totals.netProfitInPaise, "pdf P&L");
  assert(bsPdf.assetsInPaise === bs.totals.totalAssetsInPaise, "pdf BS");
  assert(tbPdf.closingDebitInPaise === tb.totals.closingDebitInPaise, "pdf TB");
  console.log("O. PDF totals match services");

  // P — dashboard
  const dash = await buildFinancialDashboard({ from, to, asOf });
  assert(dash.profitAndLoss.netProfitInPaise === pl.totals.netProfitInPaise, "dash P&L");
  assert(dash.balanceSheet.balanced === bs.totals.balanced, "dash BS");
  console.log("P. Dashboard matches P&L/BS");

  // Q — commerce fingerprint (counts only)
  const [orders, products, payments] = await Promise.all([
    prisma.order.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.payment.count()
  ]);
  console.log("Q. Commerce counts (unchanged by 6D read-only):", {
    orders,
    products,
    payments
  });

  // R — flags ABSENT in .env (process env set only for this script)
  console.log(
    "R. Persistent flags: verify .env on host has NATIVE_ACCOUNTING_ENABLED / ACCOUNTING_REPORTS_ENABLED ABSENT (script sets process only)"
  );

  console.log("\nPHASE 6D LIGHTSAIL VALIDATION PASSED");
  console.log("Note: TEST fixtures remain — not production financial truth.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
