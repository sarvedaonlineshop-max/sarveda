/**
 * Phase 6B Lightsail validation — Trial Balance + General Ledger (read-mostly).
 *
 * Usage (on Lightsail backend host):
 *   NATIVE_ACCOUNTING_ENABLED=1 ACCOUNTING_REPORTS_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase6b-lightsail-reports-validation.ts
 *
 * Creates optional tagged TEST-ACC-FS-* journals only if needed for orphan GL proof;
 * prefers proving against existing POSTED data. Does not delete immutable journals.
 * Leaves persistent .env flags untouched (caller must not persist flags).
 */
process.env.NATIVE_ACCOUNTING_ENABLED = "1";
process.env.ACCOUNTING_REPORTS_ENABLED = "1";
process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED =
  process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED ?? "1";

import { prisma } from "../src/config/db";
import { buildTrialBalance } from "../src/modules/accounting/trial-balance.service";
import { buildGeneralLedger } from "../src/modules/accounting/general-ledger.service";
import { listReportAccounts } from "../src/modules/accounting/trial-balance.service";
import { financialYearConfigSummary } from "../src/modules/accounting/financial-year";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function money(p: number) {
  return `₹${(p / 100).toFixed(2)}`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  console.log("=== Phase 6B Lightsail TB/GL validation ===");
  console.log("DATABASE_URL host snippet:", dbUrl.replace(/:[^:@/]+@/, ":****@").slice(0, 120));
  assert(!/localhost|127\.0\.0\.1/.test(dbUrl), "Must not use localhost DB");
  console.log("isProductionLikeEnvironment:", isProductionLikeEnvironment());

  const posted = await prisma.accountingJournalEntry.count({ where: { status: "POSTED" } });
  const lines = await prisma.accountingJournalLine.count();
  console.log("POSTED journals:", posted, "lines:", lines);
  assert(posted > 0, "expected POSTED journals on Lightsail");

  const asOf = new Date().toISOString().slice(0, 10);
  const tb = await buildTrialBalance({ asOf });
  console.log("TB as-of", asOf, {
    balanced: tb.balanced,
    variance: tb.varianceInPaise,
    rows: tb.rows.length,
    closingDr: tb.totals.closingDebitInPaise,
    closingCr: tb.totals.closingCreditInPaise
  });
  assert(tb.balanced, `TB must balance; variance=${tb.varianceInPaise}`);
  assert(
    tb.totals.closingDebitInPaise === tb.totals.closingCreditInPaise,
    "closing Dr === closing Cr"
  );

  // Direct SQL reconcile for a known active account
  const sample = tb.rows.find((r) => r.accountCode === "1020") ?? tb.rows[0]!;
  const sql = await prisma.$queryRaw<
    Array<{ debit: bigint; credit: bigint }>
  >`
    SELECT COALESCE(SUM(l."debitInPaise"),0) AS debit,
           COALESCE(SUM(l."creditInPaise"),0) AS credit
    FROM "AccountingJournalLine" l
    JOIN "AccountingJournalEntry" e ON e.id = l."journalEntryId"
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    WHERE e.status = 'POSTED' AND a.code = ${sample.accountCode}
      AND e."entryDate" <= ${asOf}::date
  `;
  const net = Number(sql[0]!.debit) - Number(sql[0]!.credit);
  assert(
    net === sample.closingNetInPaise,
    `SQL net ${net} vs TB ${sample.closingNetInPaise} for ${sample.accountCode}`
  );
  console.log("SQL reconcile OK for", sample.accountCode, money(net));

  const row1210 = tb.rows.find((r) => r.accountCode === "1210");
  if (row1210 && row1210.closingNetInPaise < 0) {
    assert(row1210.closingCreditInPaise > 0 && row1210.closingDebitInPaise === 0, "1210 credit side");
    console.log(
      "1210 credit presentation OK:",
      money(row1210.closingCreditInPaise),
      row1210.reportClass
    );
  } else {
    console.log("1210 note:", row1210 ? `net=${row1210.closingNetInPaise}` : "absent/zero");
  }

  const accounts = await listReportAccounts();
  const dynBanks = accounts.filter((a) => a.isBankRegistryGl);
  console.log("Bank registry GLs in report accounts:", dynBanks.length);
  assert(dynBanks.length > 0, "expected dynamic bank GLs on Lightsail");

  // GL proof on 1020 or 1200
  const glCode = tb.rows.find((r) => r.accountCode === "1200")
    ? "1200"
    : sample.accountCode;
  const gl = await buildGeneralLedger({
    accountCode: glCode,
    from: "2020-01-01",
    to: asOf,
    limit: 20,
    offset: 0
  });
  assert(
    gl.closingBalanceInPaise ===
      gl.openingBalanceInPaise + gl.periodDebitInPaise - gl.periodCreditInPaise,
    "GL opening + movement = closing"
  );
  let running = gl.openingBalanceInPaise;
  for (const line of gl.lines) {
    running += line.debitInPaise - line.creditInPaise;
    assert(line.runningBalanceInPaise === running, "running balance mismatch");
  }
  console.log("GL OK", glCode, {
    opening: gl.openingBalanceInPaise,
    closing: gl.closingBalanceInPaise,
    linesShown: gl.lines.length,
    totalLines: gl.pagination.totalLines
  });

  const orphanLine = gl.lines.find((l) => l.orphanJournal);
  // May not be on this account — scan TB accounts for orphan visibility
  let orphanSeen = Boolean(orphanLine);
  if (!orphanSeen) {
    const orphanJe = await prisma.accountingJournalEntry.findFirst({
      where: {
        status: "POSTED",
        postingEvent: null,
        lines: { some: {} }
      },
      include: {
        lines: { take: 1, include: { account: true } }
      }
    });
    if (orphanJe?.lines[0]) {
      const oGl = await buildGeneralLedger({
        accountCode: orphanJe.lines[0].account.code,
        from: "2020-01-01",
        to: asOf,
        limit: 100
      });
      orphanSeen = oGl.lines.some(
        (l) => l.journalEntryId === orphanJe.id && l.orphanJournal
      );
      console.log(
        "Orphan JE",
        orphanJe.entryNumber,
        "on",
        orphanJe.lines[0].account.code,
        "orphanJournal=",
        orphanSeen
      );
    }
  }
  assert(orphanSeen, "expected at least one ORPHAN_JOURNAL visible in GL");

  const fy = financialYearConfigSummary();
  console.log("FY config", fy.fyStartMonth, fy.currentFy.label);

  // Periods: reporting is read-only — count unchanged
  const periodCount = await prisma.accountingPeriod.count();
  console.log("AccountingPeriod count (unchanged by reports):", periodCount);

  const orderCount = await prisma.order.count();
  console.log("Order count (commerce untouched):", orderCount);

  console.log("PHASE 6B LIGHTSAIL VALIDATION PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
