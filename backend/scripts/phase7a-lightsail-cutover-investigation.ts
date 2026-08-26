/**
 * Phase 7A — READ-ONLY Lightsail cutover investigation.
 * SELECT-only. No posts, deletes, imports, or flag persistence.
 *
 *   NATIVE_ACCOUNTING_ENABLED=1 ACCOUNTING_REPORTS_ENABLED=1 \
 *   npx tsx scripts/phase7a-lightsail-cutover-investigation.ts
 */
process.env.NATIVE_ACCOUNTING_ENABLED = "1";
process.env.ACCOUNTING_REPORTS_ENABLED = "1";

import { prisma } from "../src/config/db";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

const TEST_MEMO = `(memo ILIKE '%TEST-ACC%' OR memo ILIKE '%SRV-TEST-ACC%')`;

function redactDb(url: string): { host: string; db: string; redacted: string } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      db: u.pathname.replace(/^\//, "").split("?")[0] || "",
      redacted: url.replace(/:[^:@/]+@/, ":****@").slice(0, 140)
    };
  } catch {
    return { host: "?", db: "?", redacted: "(unparseable)" };
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const info = redactDb(dbUrl);
  console.log("=== Phase 7A READ-ONLY investigation ===");
  console.log(
    JSON.stringify(
      {
        appPathExpected: "/home/ubuntu/sarveda/backend",
        dbHost: info.host,
        dbName: info.db,
        dbRedacted: info.redacted,
        isLocalhost: /localhost|127\.0\.0\.1/.test(dbUrl),
        isProductionLikeEnvironment: isProductionLikeEnvironment()
      },
      null,
      2
    )
  );
  if (/localhost|127\.0\.0\.1/.test(dbUrl)) {
    throw new Error("Refusing: localhost DATABASE_URL");
  }

  // --- Counts ---
  const counts = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT
      (SELECT COUNT(*) FROM "AccountingJournalEntry" WHERE status = 'POSTED') AS posted_journals,
      (SELECT COUNT(*) FROM "AccountingJournalEntry" WHERE status = 'POSTED' AND ${TEST_MEMO}) AS test_memo_journals,
      (SELECT COUNT(*) FROM "AccountingJournalEntry" j
        WHERE j.status = 'POSTED'
          AND NOT EXISTS (SELECT 1 FROM "AccountingPostingEvent" e WHERE e."journalEntryId" = j.id)
      ) AS orphan_journals,
      (SELECT COUNT(*) FROM "AccountingPostingEvent" WHERE status = 'POSTED') AS posted_events,
      (SELECT COUNT(*) FROM "AccountingPostingEvent" WHERE status = 'POSTED' AND "journalEntryId" IS NULL) AS orphan_events,
      (SELECT COUNT(*) FROM "AccountingBankAccount") AS bank_accounts,
      (SELECT COUNT(*) FROM "AccountingBankAccount" WHERE name ILIKE '%TEST-ACC%') AS test_banks,
      (SELECT COUNT(*) FROM "AccountingInventoryCostLayer") AS cost_layers,
      (SELECT COUNT(*) FROM "AccountingInventoryCostLayer" WHERE "sourceId" ILIKE '%TEST%') AS testish_layers,
      (SELECT COUNT(*) FROM "Order" WHERE "deletedAt" IS NULL) AS orders,
      (SELECT COUNT(*) FROM "Order" WHERE "orderNumber" ILIKE '%TEST%' AND "deletedAt" IS NULL) AS test_orders,
      (SELECT COUNT(*) FROM "Product" WHERE "deletedAt" IS NULL) AS products,
      (SELECT COUNT(*) FROM "Product" WHERE (slug ILIKE '%test%' OR name ILIKE '%TEST-ACC%' OR slug ILIKE 'acct-prod%') AND "deletedAt" IS NULL) AS testish_products,
      (SELECT COUNT(*) FROM "VendorBill") AS vendor_bills,
      (SELECT COUNT(*) FROM "VendorBill" WHERE "billNumber" ILIKE '%TEST%') AS test_vendor_bills,
      (SELECT COUNT(*) FROM "Expense") AS expenses,
      (SELECT COUNT(*) FROM "Expense" WHERE notes ILIKE '%TEST%' OR "referenceNumber" ILIKE '%TEST%' OR "invoiceNumber" ILIKE '%TEST%') AS testish_expenses,
      (SELECT COUNT(*) FROM "AccountingPostingEvent" WHERE "eventType" = 'ORDER_PAID' AND status = 'POSTED') AS order_paid_posted,
      (SELECT COUNT(*) FROM "AccountingJournalLine" WHERE "accountId" IN (SELECT id FROM "AccountingAccount" WHERE code = '3100')) AS lines_3100
  `);
  console.log("\n--- COUNTS ---");
  console.log(JSON.stringify(counts[0], (_, v) => (typeof v === "bigint" ? Number(v) : v), 2));

  // --- TEST GL impact by account ---
  const testGl = await prisma.$queryRawUnsafe<
    Array<{
      code: string;
      name: string;
      test_debit: bigint;
      test_credit: bigint;
      test_net: bigint;
      all_debit: bigint;
      all_credit: bigint;
      all_net: bigint;
    }>
  >(`
    WITH test_j AS (
      SELECT id FROM "AccountingJournalEntry"
      WHERE status = 'POSTED' AND ${TEST_MEMO}
    ),
    test_agg AS (
      SELECT a.code, a.name,
        COALESCE(SUM(l."debitInPaise"),0)::bigint AS test_debit,
        COALESCE(SUM(l."creditInPaise"),0)::bigint AS test_credit
      FROM "AccountingJournalLine" l
      JOIN "AccountingAccount" a ON a.id = l."accountId"
      WHERE l."journalEntryId" IN (SELECT id FROM test_j)
      GROUP BY a.code, a.name
    ),
    all_agg AS (
      SELECT a.code, a.name,
        COALESCE(SUM(l."debitInPaise"),0)::bigint AS all_debit,
        COALESCE(SUM(l."creditInPaise"),0)::bigint AS all_credit
      FROM "AccountingJournalLine" l
      JOIN "AccountingAccount" a ON a.id = l."accountId"
      JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
      WHERE j.status = 'POSTED'
      GROUP BY a.code, a.name
    )
    SELECT
      COALESCE(t.code, a.code) AS code,
      COALESCE(t.name, a.name) AS name,
      COALESCE(t.test_debit, 0) AS test_debit,
      COALESCE(t.test_credit, 0) AS test_credit,
      (COALESCE(t.test_debit,0) - COALESCE(t.test_credit,0)) AS test_net,
      COALESCE(a.all_debit, 0) AS all_debit,
      COALESCE(a.all_credit, 0) AS all_credit,
      (COALESCE(a.all_debit,0) - COALESCE(a.all_credit,0)) AS all_net
    FROM all_agg a
    FULL OUTER JOIN test_agg t ON t.code = a.code
    WHERE COALESCE(t.test_debit,0) <> 0 OR COALESCE(t.test_credit,0) <> 0
    ORDER BY COALESCE(t.code, a.code)
  `);
  console.log("\n--- TEST GL IMPACT (paise) ---");
  const testGlRows = testGl.map((r) => ({
    code: r.code,
    name: r.name,
    testDebit: Number(r.test_debit),
    testCredit: Number(r.test_credit),
    testNet: Number(r.test_net),
    allNet: Number(r.all_net),
    preliminaryNonTestNet: Number(r.all_net) - Number(r.test_net)
  }));
  console.log(JSON.stringify(testGlRows, null, 2));

  const testTotals = testGlRows.reduce(
    (acc, r) => {
      acc.dr += r.testDebit;
      acc.cr += r.testCredit;
      return acc;
    },
    { dr: 0, cr: 0 }
  );
  console.log("\nTEST journal line totals:", testTotals, "balanced:", testTotals.dr === testTotals.cr);

  // --- Orphan journals detail ---
  const orphans = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      entryNumber: string;
      entryDate: Date;
      memo: string | null;
      totalDebitInPaise: number;
      totalCreditInPaise: number;
      is_test: boolean;
      lines: string;
    }>
  >(`
    SELECT j.id, j."entryNumber", j."entryDate", j.memo, j."totalDebitInPaise", j."totalCreditInPaise",
      (j.memo ILIKE '%TEST-ACC%' OR j.memo ILIKE '%SRV-TEST-ACC%') AS is_test,
      string_agg(a.code || ':' || l."debitInPaise"::text || '/' || l."creditInPaise"::text, '; ' ORDER BY l."sortOrder") AS lines
    FROM "AccountingJournalEntry" j
    JOIN "AccountingJournalLine" l ON l."journalEntryId" = j.id
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    WHERE j.status = 'POSTED'
      AND NOT EXISTS (SELECT 1 FROM "AccountingPostingEvent" e WHERE e."journalEntryId" = j.id)
    GROUP BY j.id
    ORDER BY j."entryNumber"
  `);
  console.log("\n--- ORPHAN JOURNALS ---");
  console.log(
    JSON.stringify(
      orphans.map((o) => ({
        ...o,
        entryDate: o.entryDate?.toISOString?.()?.slice(0, 10) ?? o.entryDate,
        totalDebitInPaise: Number(o.totalDebitInPaise),
        totalCreditInPaise: Number(o.totalCreditInPaise)
      })),
      null,
      2
    )
  );

  // --- Orphan Output GST ---
  const orphanGst = await prisma.$queryRawUnsafe<
    Array<{
      entryNumber: string;
      memo: string | null;
      code: string;
      creditInPaise: number;
      debitInPaise: number;
      has_event: boolean;
      eventType: string | null;
      sourceId: string | null;
    }>
  >(`
    SELECT j."entryNumber", j.memo, a.code, l."creditInPaise", l."debitInPaise",
      (e.id IS NOT NULL) AS has_event, e."eventType", e."sourceId"
    FROM "AccountingJournalLine" l
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
    LEFT JOIN "AccountingPostingEvent" e ON e."journalEntryId" = j.id
    WHERE j.status = 'POSTED'
      AND a.code IN ('2100','2101','2102')
      AND (e.id IS NULL OR e."eventType" IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM "AccountingDocumentLink" d WHERE d."journalEntryId" = j.id
           ))
    ORDER BY j."entryNumber", a.code
  `);
  // Better: replicate Phase 5 orphan logic — Output GST lines without matching order GST evidence
  const outputGstByJournal = await prisma.$queryRawUnsafe<
    Array<{
      entryNumber: string;
      memo: string | null;
      code: string;
      credit: bigint;
      debit: bigint;
      eventType: string | null;
      sourceType: string | null;
      sourceId: string | null;
      is_test: boolean;
    }>
  >(`
    SELECT j."entryNumber", j.memo, a.code,
      l."creditInPaise"::bigint AS credit, l."debitInPaise"::bigint AS debit,
      e."eventType", e."sourceType", e."sourceId",
      (j.memo ILIKE '%TEST-ACC%' OR j.memo ILIKE '%SRV-TEST-ACC%') AS is_test
    FROM "AccountingJournalLine" l
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
    LEFT JOIN "AccountingPostingEvent" e ON e."journalEntryId" = j.id
    WHERE j.status = 'POSTED' AND a.code IN ('2100','2101','2102')
      AND l."creditInPaise" > 0
    ORDER BY j."entryNumber", a.code
  `);
  console.log("\n--- OUTPUT GST CREDITS (all) ---");
  console.log(
    JSON.stringify(
      outputGstByJournal.map((r) => ({
        ...r,
        credit: Number(r.credit),
        debit: Number(r.debit)
      })),
      null,
      2
    )
  );

  // --- Inventory 1200 vs FIFO ---
  const inv = await prisma.$queryRawUnsafe<
    Array<{ gl_net: bigint; fifo_remaining: bigint }>
  >(`
    SELECT
      (SELECT COALESCE(SUM(l."debitInPaise") - SUM(l."creditInPaise"),0)::bigint
       FROM "AccountingJournalLine" l
       JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
       JOIN "AccountingAccount" a ON a.id = l."accountId"
       WHERE j.status = 'POSTED' AND a.code = '1200') AS gl_net,
      (SELECT COALESCE(SUM(("quantityRemaining")::bigint * ("unitCostInPaise")::bigint),0)::bigint
       FROM "AccountingInventoryCostLayer"
       WHERE "quantityRemaining" > 0 AND status = 'ACTIVE') AS fifo_remaining
  `);
  console.log("\n--- INVENTORY GL VS FIFO ---");
  const glNet = Number(inv[0]?.gl_net ?? 0);
  const fifo = Number(inv[0]?.fifo_remaining ?? 0);
  console.log(JSON.stringify({ glNet, fifo, variance: glNet - fifo }, null, 2));

  const layers = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      sourceType: string;
      sourceId: string;
      sku: string | null;
      quantityRemaining: number;
      unitCostInPaise: number;
      remainingValue: bigint;
      is_testish: boolean;
    }>
  >(`
    SELECT l.id, l."sourceType"::text, l."sourceId",
      pv.sku,
      l."quantityRemaining", l."unitCostInPaise",
      (l."quantityRemaining"::bigint * l."unitCostInPaise"::bigint) AS "remainingValue",
      (
        COALESCE(l."sourceId",'') ILIKE '%TEST%'
        OR COALESCE(pv.sku,'') ILIKE '%TEST%'
        OR COALESCE(pv.sku,'') ILIKE 'ACCT-%'
      ) AS is_testish
    FROM "AccountingInventoryCostLayer" l
    LEFT JOIN "ProductVariant" pv ON pv.id = l."variantId"
    WHERE l."quantityRemaining" > 0 AND l.status = 'ACTIVE'
    ORDER BY (l."quantityRemaining"::bigint * l."unitCostInPaise"::bigint) DESC
    LIMIT 50
  `);
  console.log("\n--- TOP FIFO REMAINING LAYERS ---");
  console.log(
    JSON.stringify(
      layers.map((l) => ({
        ...l,
        remainingValue: Number(l.remainingValue),
        quantityRemaining: Number(l.quantityRemaining),
        unitCostInPaise: Number(l.unitCostInPaise)
      })),
      null,
      2
    )
  );

  // Journals affecting 1200
  const invJournals = await prisma.$queryRawUnsafe<
    Array<{
      entryNumber: string;
      memo: string | null;
      debit: bigint;
      credit: bigint;
      is_test: boolean;
      eventType: string | null;
    }>
  >(`
    SELECT j."entryNumber", j.memo,
      SUM(l."debitInPaise")::bigint AS debit, SUM(l."creditInPaise")::bigint AS credit,
      (j.memo ILIKE '%TEST-ACC%' OR j.memo ILIKE '%SRV-TEST-ACC%') AS is_test,
      e."eventType"
    FROM "AccountingJournalLine" l
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
    LEFT JOIN "AccountingPostingEvent" e ON e."journalEntryId" = j.id
    WHERE j.status = 'POSTED' AND a.code = '1200'
    GROUP BY j.id, e."eventType"
    ORDER BY j."entryNumber"
  `);
  console.log("\n--- JOURNALS TOUCHING 1200 ---");
  console.log(
    JSON.stringify(
      invJournals.map((j) => ({
        ...j,
        debit: Number(j.debit),
        credit: Number(j.credit)
      })),
      null,
      2
    )
  );

  // --- AP ---
  const ap = await prisma.$queryRawUnsafe<
    Array<{ gl_net: bigint; bill_count: bigint; payment_count: bigint }>
  >(`
    SELECT
      (SELECT COALESCE(SUM(l."debitInPaise") - SUM(l."creditInPaise"),0)::bigint
       FROM "AccountingJournalLine" l
       JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
       JOIN "AccountingAccount" a ON a.id = l."accountId"
       WHERE j.status = 'POSTED' AND a.code = '2000') AS gl_net,
      (SELECT COUNT(*)::bigint FROM "AccountingPostingEvent" WHERE "eventType" = 'VENDOR_BILL_POSTED' AND status = 'POSTED') AS bill_count,
      (SELECT COUNT(*)::bigint FROM "AccountingPostingEvent" WHERE "eventType" = 'VENDOR_PAYMENT_MADE' AND status = 'POSTED') AS payment_count
  `);
  console.log("\n--- AP ---");
  console.log(
    JSON.stringify(
      {
        glNet: Number(ap[0]?.gl_net ?? 0),
        glLiability: -Number(ap[0]?.gl_net ?? 0),
        postedBills: Number(ap[0]?.bill_count ?? 0),
        postedPayments: Number(ap[0]?.payment_count ?? 0)
      },
      null,
      2
    )
  );

  // --- AR ---
  const ar = await prisma.$queryRawUnsafe<Array<{ gl_net: bigint }>>(`
    SELECT COALESCE(SUM(l."debitInPaise") - SUM(l."creditInPaise"),0)::bigint AS gl_net
    FROM "AccountingJournalLine" l
    JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    WHERE j.status = 'POSTED' AND a.code = '1100'
  `);
  console.log("\n--- AR GL 1100 ---", Number(ar[0]?.gl_net ?? 0));

  // --- Banks ---
  const banks = await prisma.accountingBankAccount.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      glAccountCode: true,
      accountType: true,
      isActive: true,
      maskedAccountNumber: true
    }
  });
  console.log("\n--- BANK ACCOUNTS ---");
  console.log(JSON.stringify(banks, null, 2));

  // --- Gateway GL ---
  const gw = await prisma.$queryRawUnsafe<
    Array<{ code: string; name: string; net: bigint }>
  >(`
    SELECT a.code, a.name, (SUM(l."debitInPaise") - SUM(l."creditInPaise"))::bigint AS net
    FROM "AccountingJournalLine" l
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
    WHERE j.status = 'POSTED' AND a.code IN ('1020','1021','1022','1100')
    GROUP BY a.code, a.name
    ORDER BY a.code
  `);
  console.log("\n--- GATEWAY / AR GL ---");
  console.log(JSON.stringify(gw.map((g) => ({ ...g, net: Number(g.net) })), null, 2));

  // --- GST balances ---
  const gst = await prisma.$queryRawUnsafe<
    Array<{ code: string; name: string; net: bigint }>
  >(`
    SELECT a.code, a.name, (SUM(l."debitInPaise") - SUM(l."creditInPaise"))::bigint AS net
    FROM "AccountingJournalLine" l
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
    WHERE j.status = 'POSTED' AND a.code IN ('2100','2101','2102','2200','2201','2202')
    GROUP BY a.code, a.name
    ORDER BY a.code
  `);
  console.log("\n--- GST GL ---");
  console.log(JSON.stringify(gst.map((g) => ({ ...g, net: Number(g.net) })), null, 2));

  // --- 1210 ---
  const c1210 = await prisma.$queryRawUnsafe<Array<{ net: bigint }>>(`
    SELECT COALESCE(SUM(l."debitInPaise") - SUM(l."creditInPaise"),0)::bigint AS net
    FROM "AccountingJournalLine" l
    JOIN "AccountingJournalEntry" j ON j.id = l."journalEntryId"
    JOIN "AccountingAccount" a ON a.id = l."accountId"
    WHERE j.status = 'POSTED' AND a.code = '1210'
  `);
  console.log("\n--- 1210 net ---", Number(c1210[0]?.net ?? 0));

  // --- TEST related commerce/purchases ---
  const testDeps = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT
      (SELECT COUNT(*) FROM "AccountingBankTransfer" WHERE reference ILIKE '%TEST%' OR memo ILIKE '%TEST%') AS test_transfers,
      (SELECT COUNT(*) FROM "AccountingBankStatementImport" i
        JOIN "AccountingBankAccount" b ON b.id = i."bankAccountId"
        WHERE b.name ILIKE '%TEST%') AS test_statement_imports,
      (SELECT COUNT(*) FROM "AccountingBankReconciliation" r
        JOIN "AccountingBankAccount" b ON b.id = r."bankAccountId"
        WHERE b.name ILIKE '%TEST%') AS test_recons,
      (SELECT COUNT(*) FROM "AccountingInventoryCostLayer") AS all_layers,
      (SELECT COUNT(*) FROM "AccountingInventoryCostConsumption") AS all_consumptions,
      (SELECT COUNT(*) FROM "order_inventory_restock_events") AS restock_events,
      (SELECT COUNT(*) FROM "AccountingItcEvidence") AS itc_evidence,
      (SELECT COUNT(*) FROM "AccountingVendorPayment") AS vendor_payments,
      (SELECT COUNT(*) FROM "PurchaseOrder" WHERE "poNumber" ILIKE '%TEST%') AS test_pos,
      (SELECT COUNT(*) FROM "PurchaseReceipt" pr
        JOIN "PurchaseOrder" po ON po.id = pr."purchaseOrderId"
        WHERE po."poNumber" ILIKE '%TEST%') AS test_receipts,
      (SELECT COUNT(*) FROM "Payment" WHERE "providerPaymentId" ILIKE '%test%' OR "providerOrderId" ILIKE '%test%') AS testish_payments,
      (SELECT COUNT(*) FROM "Refund" r JOIN "Payment" p ON p.id = r."paymentId"
        WHERE p."providerPaymentId" ILIKE '%test%' OR r."providerRefundId" ILIKE '%test%') AS testish_refunds
  `);
  console.log("\n--- TEST-ISH DEPENDENCY COUNTS ---");
  console.log(JSON.stringify(testDeps[0], (_, v) => (typeof v === "bigint" ? Number(v) : v), 2));

  // Event type breakdown
  const events = await prisma.$queryRawUnsafe<
    Array<{ eventType: string; status: string; n: bigint; testish: bigint }>
  >(`
    SELECT "eventType", status::text,
      COUNT(*)::bigint AS n,
      COUNT(*) FILTER (
        WHERE "sourceId" ILIKE '%TEST%' OR "uniqueKey" ILIKE '%TEST%' OR "sourceType" ILIKE '%TEST%'
      )::bigint AS testish
    FROM "AccountingPostingEvent"
    GROUP BY "eventType", status
    ORDER BY "eventType", status
  `);
  console.log("\n--- POSTING EVENTS BY TYPE ---");
  console.log(
    JSON.stringify(events.map((e) => ({ ...e, n: Number(e.n), testish: Number(e.testish) })), null, 2)
  );

  // Memo prefix breakdown for TEST journals
  const prefixes = await prisma.$queryRawUnsafe<Array<{ prefix: string; n: bigint }>>(`
    SELECT
      CASE
        WHEN memo ILIKE 'TEST-ACC-FS%' THEN 'TEST-ACC-FS'
        WHEN memo ILIKE 'TEST-ACC-FIFO%' THEN 'TEST-ACC-FIFO'
        WHEN memo ILIKE 'TEST-ACC-BANK%' THEN 'TEST-ACC-BANK'
        WHEN memo ILIKE 'TEST-ACC-GST%' THEN 'TEST-ACC-GST'
        WHEN memo ILIKE 'TEST-ACC-ITC%' THEN 'TEST-ACC-ITC'
        WHEN memo ILIKE 'TEST-ACC-GSTR%' THEN 'TEST-ACC-GSTR'
        WHEN memo ILIKE 'SRV-TEST-ACC%' THEN 'SRV-TEST-ACC'
        WHEN memo ILIKE 'TEST-ACC%' THEN 'TEST-ACC-OTHER'
        ELSE 'OTHER-TEST-MATCH'
      END AS prefix,
      COUNT(*)::bigint AS n
    FROM "AccountingJournalEntry"
    WHERE status = 'POSTED' AND ${TEST_MEMO}
    GROUP BY 1
    ORDER BY 2 DESC
  `);
  console.log("\n--- TEST JOURNAL PREFIXES ---");
  console.log(JSON.stringify(prefixes.map((p) => ({ ...p, n: Number(p.n) })), null, 2));

  // Flags in env file presence (read path only via shell expectation — here process)
  console.log("\n--- PROCESS FLAGS (investigation run only) ---");
  console.log({
    NATIVE_ACCOUNTING_ENABLED: process.env.NATIVE_ACCOUNTING_ENABLED,
    ACCOUNTING_REPORTS_ENABLED: process.env.ACCOUNTING_REPORTS_ENABLED,
    note: "Persistent .env must remain unchecked here — verify separately ABSENT"
  });

  console.log("\nPHASE 7A READ-ONLY INVESTIGATION COMPLETE — no writes performed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
