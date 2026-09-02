/**
 * Safe HIGH-confidence Merchant identity backfill for ProductVariant.wooCommerceVariationId.
 *
 * Usage:
 *   npx tsx scripts/backfill-merchant-identity.ts --dry-run
 *   npx tsx scripts/backfill-merchant-identity.ts --apply
 *
 * Source: docs/audit/merchant_woo_sarveda_mapping.tsv
 * Artifacts:
 *   docs/audit/merchant_identity_backfilled.tsv
 *   docs/audit/merchant_identity_backfill_review.tsv
 *   docs/audit/merchant_identity_backfill_summary.json
 */
import { PrismaClient } from "@prisma/client";
import { createReadStream, writeFileSync, mkdirSync } from "fs";
import path from "path";
import readline from "readline";
import dotenv from "dotenv";

import {
  continuityCheck,
  preflightCandidates,
  type MappingRow,
  type PreflightAccepted,
  type ReviewRow,
  type VariantIdentitySnapshot
} from "../src/modules/products/merchantIdentityBackfill";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO_ROOT = path.resolve(__dirname, "../..");
const SOURCE_TSV = path.join(REPO_ROOT, "docs/audit/merchant_woo_sarveda_mapping.tsv");
const OUT_BACKFILLED = path.join(REPO_ROOT, "docs/audit/merchant_identity_backfilled.tsv");
const OUT_REVIEW = path.join(REPO_ROOT, "docs/audit/merchant_identity_backfill_review.tsv");
const OUT_SUMMARY = path.join(REPO_ROOT, "docs/audit/merchant_identity_backfill_summary.json");

const apply = process.argv.includes("--apply");
const dryRun = !apply || process.argv.includes("--dry-run");

function parseArgsEnvLabel(): string {
  const raw = process.env.DATABASE_URL || "";
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "5432"}/${(u.pathname || "").replace(/^\//, "")}`;
  } catch {
    return "(unparsed DATABASE_URL)";
  }
}

async function readMappingTsv(filePath: string): Promise<MappingRow[]> {
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  let headers: string[] | null = null;
  const rows: MappingRow[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (!headers) {
      headers = cols;
      continue;
    }
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    rows.push(obj as MappingRow);
  }
  return rows;
}

function escapeTsv(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath: string, headers: string[], rows: Array<Record<string, unknown>>) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [headers.join("\t")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeTsv(row[h])).join("\t"));
  }
  writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

async function main() {
  const envLabel = parseArgsEnvLabel();
  console.log(`Merchant identity backfill — ${dryRun ? "DRY-RUN" : "APPLY"}`);
  console.log(`Database: ${envLabel}`);
  console.log(`Source: ${SOURCE_TSV}`);

  const mappingRows = await readMappingTsv(SOURCE_TSV);
  console.log(`Loaded ${mappingRows.length} reconciliation rows`);

  const prisma = new PrismaClient();
  try {
    const variantIds = [
      ...new Set(
        mappingRows
          .map((r) => (r.sarveda_variant_id || "").trim())
          .filter(Boolean)
      )
    ];

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        productId: true,
        sku: true,
        wooCommerceVariationId: true,
        productRel: { select: { wooCommerceId: true } }
      }
    });

    const variantsById = new Map<string, VariantIdentitySnapshot>();
    for (const v of variants) {
      variantsById.set(v.id, {
        id: v.id,
        productId: v.productId,
        sku: v.sku,
        wooCommerceVariationId: v.wooCommerceVariationId,
        productWooCommerceId: v.productRel.wooCommerceId
      });
    }

    const existingAssigned = await prisma.productVariant.findMany({
      where: { wooCommerceVariationId: { not: null } },
      select: { id: true, wooCommerceVariationId: true }
    });
    const existingWooOfferOwners = new Map<number, string>();
    for (const v of existingAssigned) {
      if (v.wooCommerceVariationId != null) {
        existingWooOfferOwners.set(v.wooCommerceVariationId, v.id);
      }
    }

    const preflight = preflightCandidates(mappingRows, variantsById, existingWooOfferOwners);
    const continuity = continuityCheck(preflight.accepted);

    console.log("Preflight stats:", preflight.stats);
    console.log("Continuity:", {
      exactMerchantMatches: continuity.exactMerchantMatches,
      merchantMismatches: continuity.merchantMismatches.length,
      itemGroupExact: continuity.itemGroupExact,
      itemGroupMismatch: continuity.itemGroupMismatch.length,
      variableCount: continuity.variableCount,
      simpleCount: continuity.simpleCount
    });

    if (continuity.merchantMismatches.length > 0) {
      console.error(
        "FATAL: historical Merchant gla_* mismatches in accepted set — refusing writes"
      );
      for (const m of continuity.merchantMismatches.slice(0, 10)) {
        console.error(m);
      }
      process.exitCode = 2;
      await writeArtifacts(preflight.accepted, preflight.reviews, {
        mode: dryRun ? "dry-run" : "aborted-mismatch",
        envLabel,
        stats: preflight.stats,
        continuity,
        written: 0
      });
      return;
    }

    let written = 0;
    if (!dryRun) {
      const toWrite = preflight.accepted.filter((a) => a.writeNeeded);
      const CHUNK = 50;
      for (let i = 0; i < toWrite.length; i += CHUNK) {
        const chunk = toWrite.slice(i, i + CHUNK);
        await prisma.$transaction(
          chunk.map((row) =>
            prisma.productVariant.update({
              where: { id: row.sarveda_variant_id },
              data: { wooCommerceVariationId: row.new_wooCommerceVariationId }
            })
          )
        );
        written += chunk.length;
      }
      console.log(`Wrote wooCommerceVariationId on ${written} variants`);
    } else {
      console.log(`Dry-run: would write ${preflight.stats.toWrite} variants`);
    }

    // Post-write constraint counts
    const dupGroups = await prisma.$queryRaw<Array<{ wooCommerceVariationId: number; c: bigint }>>`
      SELECT "wooCommerceVariationId", COUNT(*)::bigint AS c
      FROM "ProductVariant"
      WHERE "wooCommerceVariationId" IS NOT NULL
      GROUP BY "wooCommerceVariationId"
      HAVING COUNT(*) > 1
    `;
    const nullRemaining = await prisma.productVariant.count({
      where: { wooCommerceVariationId: null }
    });
    const assigned = await prisma.productVariant.count({
      where: { wooCommerceVariationId: { not: null } }
    });

    await writeArtifacts(preflight.accepted, preflight.reviews, {
      mode: dryRun ? "dry-run" : "apply",
      envLabel,
      stats: preflight.stats,
      continuity,
      written,
      post: {
        duplicateNonNullWooOfferGroups: dupGroups.length,
        variantsWithWooOfferId: assigned,
        variantsNullWooOfferId: nullRemaining
      }
    });

    if (dupGroups.length > 0) {
      console.error("Constraint violation: duplicate wooCommerceVariationId values", dupGroups);
      process.exitCode = 3;
    }

    console.log(`Artifacts:\n  ${OUT_BACKFILLED}\n  ${OUT_REVIEW}\n  ${OUT_SUMMARY}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function writeArtifacts(
  accepted: PreflightAccepted[],
  reviews: ReviewRow[],
  summary: Record<string, unknown>
) {
  writeTsv(
    OUT_BACKFILLED,
    [
      "woo_offer_id",
      "woo_parent_id",
      "merchant_id",
      "sarveda_product_id",
      "sarveda_variant_id",
      "sarveda_sku",
      "previous_wooCommerceVariationId",
      "new_wooCommerceVariationId",
      "match_method",
      "match_confidence",
      "write_needed"
    ],
    accepted.map((a) => ({
      woo_offer_id: a.woo_offer_id,
      woo_parent_id: a.woo_parent_id,
      merchant_id: a.merchant_id,
      sarveda_product_id: a.sarveda_product_id,
      sarveda_variant_id: a.sarveda_variant_id,
      sarveda_sku: a.sarveda_sku,
      previous_wooCommerceVariationId: a.previous_wooCommerceVariationId ?? "",
      new_wooCommerceVariationId: a.new_wooCommerceVariationId,
      match_method: a.match_method,
      match_confidence: a.match_confidence,
      write_needed: a.writeNeeded
    }))
  );

  writeTsv(
    OUT_REVIEW,
    [
      "merchant_id",
      "merchant_item_group_id",
      "merchant_title",
      "woo_offer_id",
      "woo_parent_id",
      "woo_offer_kind",
      "woo_sku",
      "woo_attributes",
      "sarveda_product_id",
      "sarveda_variant_id",
      "sarveda_sku",
      "match_method",
      "match_confidence",
      "reason_not_backfilled",
      "recommended_review_action"
    ],
    reviews.map((r) => ({
      merchant_id: r.merchant_id,
      merchant_item_group_id: r.merchant_item_group_id,
      merchant_title: r.merchant_title,
      woo_offer_id: r.woo_offer_id,
      woo_parent_id: r.woo_parent_id,
      woo_offer_kind: r.woo_offer_kind,
      woo_sku: r.woo_sku,
      woo_attributes: r.woo_attributes,
      sarveda_product_id: r.sarveda_product_id,
      sarveda_variant_id: r.sarveda_variant_id,
      sarveda_sku: r.sarveda_sku,
      match_method: r.match_method,
      match_confidence: r.match_confidence,
      reason_not_backfilled: r.reason_not_backfilled,
      recommended_review_action: r.recommended_review_action
    }))
  );

  writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
