/**
 * Apply ops-locked INTENTIONALLY_EXCLUDE rows in MerchantCtxOffer registry.
 *
 *   npx tsx scripts/apply-ctx-manual-exclusions.ts --dry-run
 *   npx tsx scripts/apply-ctx-manual-exclusions.ts --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import dotenv from "dotenv";

import { MerchantCtxClassification } from "@prisma/client";

import { prisma } from "../src/config/db";
import {
  MANUAL_EXCLUDE_LOCK,
  classifyAllCtxOffers
} from "../src/modules/merchant/ctxOfferRegistry";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "../..");
const DEFAULT_EXCLUSIONS_PATH = path.join(
  REPO,
  "docs/audit/google-merchant-native-compatibility/ctx_manual_exclusions.json"
);
const OUT_DIR = path.join(REPO, "docs/audit/google-merchant-native-compatibility");

type ManualExclusion = {
  wooOfferId: number;
  excludeReason: string;
  notes: string;
};

function loadExclusions(filePath: string): ManualExclusion[] {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
    exclusions: ManualExclusion[];
  };
  const rows = raw.exclusions ?? [];
  for (const row of rows) {
    if (!Number.isInteger(row.wooOfferId) || row.wooOfferId <= 0) {
      throw new Error(`Invalid wooOfferId: ${JSON.stringify(row)}`);
    }
    if (!row.excludeReason?.trim()) {
      throw new Error(`Missing excludeReason for ${row.wooOfferId}`);
    }
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply || process.argv.includes("--dry-run");
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const filePath = fileArg?.slice("--file=".length) || DEFAULT_EXCLUSIONS_PATH;

  const exclusions = loadExclusions(filePath);
  const results: Array<{
    wooOfferId: number;
    action: "exclude" | "skip";
    reason: string;
    previousClassification?: string;
  }> = [];

  for (const row of exclusions) {
    const existing = await prisma.merchantCtxOffer.findUnique({
      where: { wooOfferId: row.wooOfferId },
      select: { classification: true, manualAction: true, excludeReason: true }
    });
    if (!existing) {
      results.push({
        wooOfferId: row.wooOfferId,
        action: "skip",
        reason: "REGISTRY_ROW_MISSING"
      });
      continue;
    }
    if (
      existing.classification === MerchantCtxClassification.PUBLISH &&
      existing.manualAction !== MANUAL_EXCLUDE_LOCK
    ) {
      results.push({
        wooOfferId: row.wooOfferId,
        action: "skip",
        reason: "ALREADY_PUBLISH",
        previousClassification: existing.classification
      });
      continue;
    }
    if (
      existing.classification === MerchantCtxClassification.INTENTIONALLY_EXCLUDE &&
      existing.manualAction === MANUAL_EXCLUDE_LOCK &&
      existing.excludeReason === row.excludeReason
    ) {
      results.push({
        wooOfferId: row.wooOfferId,
        action: "skip",
        reason: "ALREADY_EXCLUDED",
        previousClassification: existing.classification
      });
      continue;
    }

    if (!dryRun) {
      await prisma.merchantCtxOffer.update({
        where: { wooOfferId: row.wooOfferId },
        data: {
          classification: MerchantCtxClassification.INTENTIONALLY_EXCLUDE,
          excludeReason: row.excludeReason,
          manualAction: MANUAL_EXCLUDE_LOCK,
          sarvedaVariantId: null,
          notes: row.notes
        }
      });
    }

    results.push({
      wooOfferId: row.wooOfferId,
      action: "exclude",
      reason: row.excludeReason,
      previousClassification: existing.classification
    });
  }

  let classified: Record<MerchantCtxClassification, number> | null = null;
  if (!dryRun) {
    classified = (await classifyAllCtxOffers()).counts;
  }

  const summary = {
    dryRun,
    filePath,
    requested: exclusions.length,
    applied: results.filter((r) => r.action === "exclude").length,
    skipped: results.filter((r) => r.action === "skip").length,
    classified
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "ctx_manual_exclusions_apply.json"),
    JSON.stringify({ summary, results }, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
