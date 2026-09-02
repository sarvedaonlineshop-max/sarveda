/**
 * Apply manual CTX registry decisions: publish maps, exclusions, owner-pending.
 * Writes ctx_native_link_tracker.json for offers that get new native PDP links.
 *
 *   npx tsx scripts/apply-ctx-manual-decisions.ts --dry-run
 *   npx tsx scripts/apply-ctx-manual-decisions.ts --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import dotenv from "dotenv";

import { MerchantCtxClassification } from "@prisma/client";

import { prisma } from "../src/config/db";
import {
  MANUAL_EXCLUDE_LOCK,
  MANUAL_MAP_LOCK,
  OWNER_CONFIRMATION_PENDING
} from "../src/modules/merchant/ctxOfferRegistry";
import { buildMerchantProductLink } from "../src/modules/merchant/merchantVariantLink";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "../..");
const DEFAULT_DECISIONS_PATH = path.join(
  REPO,
  "docs/audit/google-merchant-native-compatibility/ctx_manual_decisions_batch2.json"
);
const OUT_DIR = path.join(REPO, "docs/audit/google-merchant-native-compatibility");
const SITE_ORIGIN = (process.env.MERCHANT_FEED_SITE_URL || "https://sarveda.com").replace(
  /\/$/,
  ""
);

type PublishDecision = {
  action: "publish";
  wooOfferId: number;
  lsSku: string;
  notes?: string;
  /** Optional Product.wooCommerceId to set on the native parent (split-product cases). */
  productWooCommerceId?: number;
};

type ExcludeDecision = {
  action: "exclude";
  wooOfferId: number;
  excludeReason: string;
  notes?: string;
};

type PendingDecision = {
  action: "pending";
  wooOfferId: number;
  notes?: string;
};

type Decision = PublishDecision | ExcludeDecision | PendingDecision;

type DecisionFile = {
  decisions: Decision[];
};

function loadDecisions(filePath: string): Decision[] {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as DecisionFile;
  return raw.decisions ?? [];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply || process.argv.includes("--dry-run");
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const filePath = fileArg?.slice("--file=".length) || DEFAULT_DECISIONS_PATH;

  const decisions = loadDecisions(filePath);
  const ordered = [
    ...decisions.filter((d) => d.action === "exclude"),
    ...decisions.filter((d) => d.action === "pending"),
    ...decisions.filter((d) => d.action === "publish")
  ];
  const variants = await prisma.productVariant.findMany({
    select: {
      id: true,
      sku: true,
      wooCommerceVariationId: true,
      productId: true,
      productRel: { select: { slug: true, wooCommerceId: true } }
    }
  });
  const bySku = new Map(variants.map((v) => [v.sku.trim(), v]));

  const results: Array<Record<string, unknown>> = [];
  const linkTracker: Array<Record<string, unknown>> = [];
  const claimedVariants = new Set<string>();

  for (const row of ordered) {
    const reg = await prisma.merchantCtxOffer.findUnique({
      where: { wooOfferId: row.wooOfferId }
    });
    if (!reg) {
      results.push({ wooOfferId: row.wooOfferId, action: row.action, status: "skip", reason: "NO_REGISTRY_ROW" });
      continue;
    }

    if (row.action === "exclude") {
      if (!dryRun) {
        await prisma.merchantCtxOffer.update({
          where: { wooOfferId: row.wooOfferId },
          data: {
            classification: MerchantCtxClassification.INTENTIONALLY_EXCLUDE,
            excludeReason: row.excludeReason,
            manualAction: MANUAL_EXCLUDE_LOCK,
            sarvedaVariantId: null,
            notes: row.notes ?? null
          }
        });
      }
      results.push({
        wooOfferId: row.wooOfferId,
        action: "exclude",
        status: "applied",
        excludeReason: row.excludeReason
      });
      continue;
    }

    if (row.action === "pending") {
      if (!dryRun) {
        await prisma.merchantCtxOffer.update({
          where: { wooOfferId: row.wooOfferId },
          data: {
            classification: MerchantCtxClassification.MANUAL_REVIEW,
            excludeReason: "OWNER_CONFIRMATION_PENDING",
            manualAction: OWNER_CONFIRMATION_PENDING,
            notes: row.notes ?? null
          }
        });
      }
      results.push({ wooOfferId: row.wooOfferId, action: "pending", status: "applied" });
      continue;
    }

    const variant = bySku.get(row.lsSku.trim());
    if (!variant) {
      results.push({
        wooOfferId: row.wooOfferId,
        action: "publish",
        status: "skip",
        reason: "LS_SKU_NOT_FOUND",
        lsSku: row.lsSku
      });
      continue;
    }

    if (claimedVariants.has(variant.id)) {
      results.push({
        wooOfferId: row.wooOfferId,
        action: "publish",
        status: "skip",
        reason: "VARIANT_CLAIMED_IN_BATCH",
        lsSku: row.lsSku
      });
      continue;
    }

    const legacyLink = reg.ctxLegacyLink || "";
    const nativeLink = buildMerchantProductLink(
      SITE_ORIGIN,
      variant.productRel.slug,
      row.wooOfferId
    );

    if (!dryRun) {
      await prisma.merchantCtxOffer.updateMany({
        where: {
          sarvedaVariantId: variant.id,
          wooOfferId: { not: row.wooOfferId }
        },
        data: { sarvedaVariantId: null }
      });

      if (
        row.productWooCommerceId != null &&
        variant.productRel.wooCommerceId !== row.productWooCommerceId
      ) {
        await prisma.product.update({
          where: { id: variant.productId },
          data: { wooCommerceId: row.productWooCommerceId }
        });
      }

      if (variant.wooCommerceVariationId !== row.wooOfferId) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { wooCommerceVariationId: row.wooOfferId }
        });
      }

      await prisma.merchantCtxOffer.update({
        where: { wooOfferId: row.wooOfferId },
        data: {
          classification: MerchantCtxClassification.PUBLISH,
          excludeReason: null,
          manualAction: MANUAL_MAP_LOCK,
          sarvedaVariantId: variant.id,
          notes: row.notes ?? null
        }
      });
    }

    claimedVariants.add(variant.id);
    linkTracker.push({
      ctx_g_id: row.wooOfferId,
      ctx_item_group_id: reg.ctxItemGroupId,
      ctx_legacy_link: legacyLink,
      native_slug: variant.productRel.slug,
      native_link: nativeLink,
      redirect_required: legacyLink.includes("/store/"),
      ls_sku: variant.sku,
      product_woo_commerce_id: row.productWooCommerceId ?? variant.productRel.wooCommerceId
    });

    results.push({
      wooOfferId: row.wooOfferId,
      action: "publish",
      status: "applied",
      lsSku: row.lsSku,
      variantId: variant.id,
      nativeLink
    });
  }

  let classified: Record<MerchantCtxClassification, number> | null = null;
  if (!dryRun) {
    const rows = await prisma.merchantCtxOffer.groupBy({
      by: ["classification"],
      _count: { _all: true }
    });
    classified = { PUBLISH: 0, INTENTIONALLY_EXCLUDE: 0, MANUAL_REVIEW: 0 };
    for (const row of rows) {
      classified[row.classification] = row._count._all;
    }
  }

  const summary = {
    dryRun,
    filePath,
    decisions: decisions.length,
    ordered: ordered.length,
    applied: results.filter((r) => r.status === "applied").length,
    skipped: results.filter((r) => r.status === "skip").length,
    nativeLinksGenerated: linkTracker.length,
    classified
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const trackerPath = path.join(OUT_DIR, "ctx_native_link_tracker.json");
  let mergedLinks = linkTracker;
  if (linkTracker.length > 0) {
    try {
      const prev = JSON.parse(readFileSync(trackerPath, "utf8")) as {
        links?: Array<Record<string, unknown>>;
      };
      const byId = new Map<string, Record<string, unknown>>();
      for (const row of prev.links ?? []) {
        const id = String(row.ctx_g_id ?? "");
        if (id) byId.set(id, row);
      }
      for (const row of linkTracker) {
        byId.set(String(row.ctx_g_id), row);
      }
      mergedLinks = [...byId.values()];
    } catch {
      mergedLinks = linkTracker;
    }
  }
  writeFileSync(
    path.join(OUT_DIR, "ctx_manual_decisions_apply.json"),
    JSON.stringify({ summary, results }, null, 2)
  );
  writeFileSync(
    trackerPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), siteOrigin: SITE_ORIGIN, links: mergedLinks },
      null,
      2
    )
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
