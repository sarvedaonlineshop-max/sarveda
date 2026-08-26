#!/usr/bin/env npx tsx
/**
 * Phase 7B — accounting production reset CLI (ops only, never HTTP).
 *
 * Default: dry-run manifest under backend/tmp/
 *
 * Execute requires:
 *   --execute
 *   --backup-ref=<ref>
 *   --operator=<name>
 *   --confirm-accounting-reset=<token>
 *     where token = SHA256("ACCOUNTING-RESET|<dbName>|<backupRef>")
 *   --acknowledge-production-like=yes   (when DATABASE_URL is production-like)
 *
 * Refuses execute when NATIVE_ACCOUNTING_ENABLED or ACCOUNTING_OPENING_BALANCE_ENABLED is on.
 * Refuses non-localhost DB unless --allow-localhost is omitted (localhost requires --allow-localhost for tests).
 *
 * Examples:
 *   npx tsx scripts/accounting-production-reset.ts
 *   npx tsx scripts/accounting-production-reset.ts --execute --backup-ref=pgdump-20260825 \
 *     --operator=shiva --confirm-accounting-reset=<sha256> --acknowledge-production-like=yes
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import {
  buildAccountingResetConfirmToken,
  executeAccountingReset,
  extractDatabaseName,
  isLocalhostDatabase,
  planAccountingReset,
  type ResetManifest
} from "../src/modules/accounting/accounting-reset.service";
import {
  isAccountingOpeningBalanceEnabled,
  isNativeAccountingEnabled
} from "../src/modules/accounting/accounting-flag";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = { dryRun: true };
  for (const arg of argv) {
    if (arg === "--execute") out.execute = true;
    else if (arg === "--dry-run") out.execute = false;
    else if (arg === "--allow-localhost") out.allowLocalhost = true;
    else if (arg.startsWith("--backup-ref=")) out.backupRef = arg.slice("--backup-ref=".length);
    else if (arg.startsWith("--operator=")) out.operator = arg.slice("--operator=".length);
    else if (arg.startsWith("--confirm-accounting-reset="))
      out.confirmToken = arg.slice("--confirm-accounting-reset=".length);
    else if (arg.startsWith("--acknowledge-production-like="))
      out.ackProduction = arg.slice("--acknowledge-production-like=".length);
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`Usage: npx tsx scripts/accounting-production-reset.ts [options]

Options:
  --dry-run              Plan only (default)
  --execute              Perform reset (requires confirm token + backup ref)
  --backup-ref=<ref>     Backup reference recorded in manifest
  --operator=<name>      Operator identity for audit
  --confirm-accounting-reset=<token>
                         SHA256 of ACCOUNTING-RESET|<dbName>|<backupRef>
  --acknowledge-production-like=yes
                         Required for execute on production-like DATABASE_URL
  --allow-localhost      Allow execute against localhost (tests only)
  --help                 Show this help

Token generation (Node):
  crypto.createHash('sha256').update('ACCOUNTING-RESET|' + dbName + '|' + backupRef).digest('hex')
`);
}

function writeManifest(manifest: ResetManifest): string {
  const dir = path.resolve(__dirname, "../tmp");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `accounting-reset-manifest-${manifest.mode}-${Date.now()}.json`
  );
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2), "utf8");
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const dbName = extractDatabaseName(databaseUrl);
  const execute = args.execute === true;

  if (execute) {
    if (isNativeAccountingEnabled()) {
      console.error("Refusing execute: NATIVE_ACCOUNTING_ENABLED is ON");
      process.exit(1);
    }
    if (isAccountingOpeningBalanceEnabled()) {
      console.error("Refusing execute: ACCOUNTING_OPENING_BALANCE_ENABLED is ON");
      process.exit(1);
    }
    if (isProductionLikeEnvironment() && args.ackProduction !== "yes") {
      console.error(
        "Refusing execute on production-like DB without --acknowledge-production-like=yes"
      );
      process.exit(1);
    }
    if (isLocalhostDatabase(databaseUrl) && !args.allowLocalhost) {
      console.error("Refusing execute on localhost without --allow-localhost");
      process.exit(1);
    }
  }

  const backupRef = typeof args.backupRef === "string" ? args.backupRef : undefined;
  if (execute && backupRef) {
    const expected = buildAccountingResetConfirmToken(dbName, backupRef);
    console.log(`Expected confirm token for db=${dbName}: ${expected}`);
  }

  try {
    if (execute) {
      const { manifest, deactivatedTestBanks } = await executeAccountingReset({
        databaseUrl,
        operator: typeof args.operator === "string" ? args.operator : undefined,
        backupRef,
        confirmToken: typeof args.confirmToken === "string" ? args.confirmToken : undefined,
        execute: true,
        allowLocalhost: args.allowLocalhost === true
      });
      const file = writeManifest(manifest);
      console.log(`Execute complete. Manifest: ${file}`);
      console.log(`Deactivated TEST bank GL accounts: ${deactivatedTestBanks}`);
      console.log(JSON.stringify(manifest.commerce_fingerprint_after, null, 2));
      process.exit(0);
    }

    const manifest = await planAccountingReset({
      databaseUrl,
      operator: typeof args.operator === "string" ? args.operator : undefined,
      backupRef,
      execute: false,
      allowLocalhost: args.allowLocalhost === true
    });
    const file = writeManifest(manifest);
    console.log(`Dry-run manifest: ${file}`);
    console.log(`Tables to clear (${manifest.dependency_order.length}): ${manifest.dependency_order.join(" → ")}`);
    console.log(`Commerce fingerprint: ${JSON.stringify(manifest.commerce_fingerprint_before)}`);
    if (manifest.blocking_reasons.length) {
      console.log(`Blocking reasons (for execute): ${manifest.blocking_reasons.join("; ")}`);
    }
    if (manifest.test_bank_gl_deactivation_candidates.length) {
      console.log(
        `TEST bank GL deactivation candidates: ${manifest.test_bank_gl_deactivation_candidates.length}`
      );
    }
    process.exit(manifest.execute_allowed ? 0 : 0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
