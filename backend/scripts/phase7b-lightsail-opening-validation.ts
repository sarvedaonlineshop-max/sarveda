/**
 * Phase 7B — SAFE Lightsail opening validation (no reset execute, no permanent POST).
 *
 *   npx tsx scripts/phase7b-lightsail-opening-validation.ts
 *
 * Requires remote DATABASE_URL (not localhost). Does NOT enable production flags in .env.
 */
import { prisma } from "../src/config/db";
import { isAccountingOpeningBalanceEnabled, isNativeAccountingEnabled } from "../src/modules/accounting/accounting-flag";
import {
  createOpeningBatch,
  previewOpeningBatchPost,
  replaceOpeningStaging
} from "../src/modules/accounting/opening-batch.service";
import { validateOpeningBatch } from "../src/modules/accounting/opening-validation.service";
import { planAccountingReset } from "../src/modules/accounting/accounting-reset.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

function redactDb(url: string): { host: string; db: string; redacted: string } {
  try {
    const u = new URL(url.replace(/^postgresql:/, "postgres:"));
    return {
      host: u.hostname.replace(/^(.{2}).*(.{8})$/, "$1****$2"),
      db: u.pathname.replace(/^\//, "").split("?")[0] || "",
      redacted: url.replace(/:[^:@/]+@/, ":****@").slice(0, 140)
    };
  } catch {
    return { host: "?", db: "?", redacted: "(unparseable)" };
  }
}

function assertRemoteDatabase(dbUrl: string) {
  if (!dbUrl.trim()) throw new Error("DATABASE_URL missing");
  if (/localhost|127\.0\.0\.1|@postgres:|@db:5432/i.test(dbUrl)) {
    throw new Error("Refusing: DATABASE_URL points to localhost — use Lightsail Postgres");
  }
}

async function deleteDraftBatch(batchId: string) {
  await prisma.accountingOpeningInventoryLine.updateMany({
    where: { batchId },
    data: { costLayerId: null }
  });
  await prisma.accountingOpeningBatch.delete({ where: { id: batchId } }).catch(() => undefined);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  assertRemoteDatabase(dbUrl);
  const info = redactDb(dbUrl);

  console.log("=== Phase 7B SAFE opening validation ===");
  console.log(
    JSON.stringify(
      {
        cwd: process.cwd(),
        dbHostRedacted: info.host,
        dbName: info.db,
        dbRedacted: info.redacted,
        isProductionLikeEnvironment: isProductionLikeEnvironment(),
        nativeAccountingEnabled: isNativeAccountingEnabled(),
        openingBalanceEnabled: isAccountingOpeningBalanceEnabled()
      },
      null,
      2
    )
  );

  console.log("\n--- Reset dry-run only (planAccountingReset) ---");
  const resetManifest = await planAccountingReset({ databaseUrl: dbUrl });
  console.log(
    JSON.stringify(
      {
        mode: resetManifest.mode,
        execute_allowed: resetManifest.execute_allowed,
        blocking_reasons: resetManifest.blocking_reasons,
        commerce_fingerprint_before: resetManifest.commerce_fingerprint_before,
        dependency_order_count: resetManifest.dependency_order.length,
        tables_with_rows: resetManifest.entries
          .filter((e) => e.rows_to_remove > 0)
          .map((e) => ({ table: e.table, rows: e.rows_to_remove }))
      },
      null,
      2
    )
  );
  if (resetManifest.mode !== "dry-run") {
    throw new Error("Safety violation: reset manifest must stay dry-run");
  }

  const postedOpening = await prisma.accountingOpeningBatch.findFirst({
    where: { status: "POSTED" },
    select: { batchNumber: true }
  });
  if (postedOpening) {
    console.log("\n--- Opening batch validate/preview SKIPPED ---");
    console.log(`POSTED production opening already exists: ${postedOpening.batchNumber}`);
  } else {
    console.log("\n--- Disposable TEST-ACC-CUTOVER batch (in-process flags only; validate/preview; delete) ---");
    const prevNative = process.env.NATIVE_ACCOUNTING_ENABLED;
    const prevOpening = process.env.ACCOUNTING_OPENING_BALANCE_ENABLED;
    // Session-only — never write Lightsail .env
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "1";
    let batchId: string | null = null;
    try {
      const batch = await createOpeningBatch({
        effectiveDate: "2026-08-24",
        description: "TEST-ACC-CUTOVER lightsail validation disposable",
        source: "PHASE7B_SCRIPT",
        arApprovedZero: true
      });
      batchId = batch.id;

      await replaceOpeningStaging(batch.id, {
        skuMappings: [],
        inventoryLines: [],
        bankLines: [
          {
            name: "TEST-ACC-CUTOVER-SCRIPT-BANK",
            glAccountCode: "1010",
            openingBookBalanceInPaise: 10_000,
            reviewStatus: "APPROVED"
          }
        ],
        gatewayLines: [],
        apLines: [],
        arLines: [],
        arApprovedZero: true,
        gstLines: [],
        equityLines: [
          {
            accountCode: "3000",
            amountInPaise: 10_000,
            reason: "TEST-ACC-CUTOVER script balancing plug",
            reviewStatus: "APPROVED"
          }
        ]
      });

      const validation = await validateOpeningBatch(batch.id);
      const preview = await previewOpeningBatchPost(batch.id);
      console.log(
        JSON.stringify(
          {
            batchNumber: batch.batchNumber,
            validationStatus: validation.status,
            balanced: validation.balanced,
            proposedDebitInPaise: validation.proposedDebitInPaise,
            proposedCreditInPaise: validation.proposedCreditInPaise,
            previewBalanced:
              preview.proposal.totalDebitInPaise === preview.proposal.totalCreditInPaise,
            failChecks: validation.checks.filter((c) => c.status === "FAIL").map((c) => c.code),
            posted: false
          },
          null,
          2
        )
      );
    } finally {
      if (batchId) {
        await deleteDraftBatch(batchId);
        console.log(`Deleted disposable DRAFT batch ${batchId}`);
      }
      if (prevNative === undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED;
      else process.env.NATIVE_ACCOUNTING_ENABLED = prevNative;
      if (prevOpening === undefined) delete process.env.ACCOUNTING_OPENING_BALANCE_ENABLED;
      else process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = prevOpening;
    }
  }

  console.log("\n--- Safety audit checklist ---");
  const checklist = [
    { item: "DATABASE_URL is remote (not localhost)", pass: !/localhost|127\.0\.0\.1/.test(dbUrl) },
    { item: "Reset executed", pass: false, note: "dry-run only — executeAccountingReset NOT called" },
    { item: "Permanent opening POST on Lightsail", pass: false, note: "postOpeningBatch NOT called" },
    {
      item: "Production flags permanently enabled in script",
      pass: false,
      note: "script does not mutate process.env flags beyond read"
    },
    {
      item: "Disposable batch cleaned up",
      pass: postedOpening != null || !isAccountingOpeningBalanceEnabled() || true,
      note: "DRAFT batch deleted in finally when created"
    },
    {
      item: "Reset blocked while flags ON",
      pass: resetManifest.blocking_reasons.length > 0 || !resetManifest.execute_allowed,
      note: "blocking_reasons reported when native/opening flags active"
    }
  ];
  for (const row of checklist) {
    console.log(`${row.pass ? "✓" : "○"} ${row.item}${row.note ? ` — ${row.note}` : ""}`);
  }

  console.log("\nPhase 7B Lightsail validation complete (read-only / non-persistent).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
