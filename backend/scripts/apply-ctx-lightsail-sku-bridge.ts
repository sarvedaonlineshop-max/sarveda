/**
 * Apply CTX ↔ LS mapping via DO wp_postmeta._lightsail_sku bridge.
 *
 * Prerequisite: docs/audit/google-merchant-native-compatibility/do_lightsail_sku_map.json
 *   { "<wooOfferId>": "<lightsail ProductVariant.sku>", ... }
 *
 *   npx tsx scripts/apply-ctx-lightsail-sku-bridge.ts --dry-run
 *   npx tsx scripts/apply-ctx-lightsail-sku-bridge.ts --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import dotenv from "dotenv";

import { MerchantCtxClassification } from "@prisma/client";

import { prisma } from "../src/config/db";
import {
  classifyAllCtxOffers,
  sellableExclusionReason
} from "../src/modules/merchant/ctxOfferRegistry";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "../..");
const MAP_PATH = path.join(
  REPO,
  "docs/audit/google-merchant-native-compatibility/do_lightsail_sku_map.json"
);
const OUT_DIR = path.join(REPO, "docs/audit/google-merchant-native-compatibility");

type BridgeRow = {
  wooOfferId: number;
  lsSku: string;
  variantId: string;
  action: "publish" | "skip";
  reason: string;
};

function loadDoMap(): Map<number, string> {
  const raw = JSON.parse(readFileSync(MAP_PATH, "utf8")) as Record<string, string>;
  const out = new Map<number, string>();
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k);
    const sku = String(v || "").trim();
    if (Number.isInteger(id) && id > 0 && sku) out.set(id, sku);
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply || process.argv.includes("--dry-run");

  const doMap = loadDoMap();
  const offers = await prisma.merchantCtxOffer.findMany({ orderBy: { wooOfferId: "asc" } });
  const variants = await prisma.productVariant.findMany({
    select: {
      id: true,
      sku: true,
      status: true,
      saleInPaise: true,
      wooCommerceVariationId: true,
      productRel: {
        select: {
          status: true,
          catalogHidden: true,
          deletedAt: true,
          productType: true,
          slug: true
        }
      },
      inventory: { select: { onHand: true, reserved: true } }
    }
  });

  const bySku = new Map(variants.map((v) => [v.sku.trim(), v]));
  const claimedVariants = new Set(
    offers
      .filter((o) => o.classification === MerchantCtxClassification.PUBLISH && o.sarvedaVariantId)
      .map((o) => o.sarvedaVariantId as string)
  );

  const rows: BridgeRow[] = [];
  let identityWrites = 0;
  let skipped = 0;

  for (const offer of offers) {
    if (offer.classification === MerchantCtxClassification.PUBLISH) continue;

    const lsSku = doMap.get(offer.wooOfferId);
    if (!lsSku) {
      skipped += 1;
      continue;
    }

    const variant = bySku.get(lsSku);
    if (!variant) {
      rows.push({
        wooOfferId: offer.wooOfferId,
        lsSku,
        variantId: "",
        action: "skip",
        reason: "LS_SKU_NOT_FOUND"
      });
      continue;
    }

    const exclusion = sellableExclusionReason(variant);
    if (exclusion) {
      rows.push({
        wooOfferId: offer.wooOfferId,
        lsSku,
        variantId: variant.id,
        action: "skip",
        reason: exclusion
      });
      continue;
    }

    if (claimedVariants.has(variant.id)) {
      rows.push({
        wooOfferId: offer.wooOfferId,
        lsSku,
        variantId: variant.id,
        action: "skip",
        reason: "VARIANT_ALREADY_PUBLISHED"
      });
      continue;
    }

    const existingWoo = variant.wooCommerceVariationId;
    if (existingWoo != null && existingWoo !== offer.wooOfferId) {
      rows.push({
        wooOfferId: offer.wooOfferId,
        lsSku,
        variantId: variant.id,
        action: "skip",
        reason: `WOO_ID_CONFLICT existing=${existingWoo}`
      });
      continue;
    }

    const owner = await prisma.productVariant.findFirst({
      where: { wooCommerceVariationId: offer.wooOfferId },
      select: { id: true }
    });
    if (owner && owner.id !== variant.id) {
      rows.push({
        wooOfferId: offer.wooOfferId,
        lsSku,
        variantId: variant.id,
        action: "skip",
        reason: `WOO_ID_OWNED_BY ${owner.id}`
      });
      continue;
    }

    rows.push({
      wooOfferId: offer.wooOfferId,
      lsSku,
      variantId: variant.id,
      action: "publish",
      reason: "do_lightsail_sku_bridge"
    });

    if (!dryRun) {
      if (existingWoo !== offer.wooOfferId) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { wooCommerceVariationId: offer.wooOfferId }
        });
        identityWrites += 1;
      }
      claimedVariants.add(variant.id);
    }
  }

  let classified = null;
  if (!dryRun) {
    classified = (await classifyAllCtxOffers()).counts;
  }

  const publishRows = rows.filter((r) => r.action === "publish");
  const summary = {
    dryRun,
    doMapSize: doMap.size,
    candidates: publishRows.length,
    identityWrites,
    skippedNoDoSku: skipped,
    skipBreakdown: Object.fromEntries(
      [...rows.filter((r) => r.action === "skip").reduce((m, r) => {
        m.set(r.reason, (m.get(r.reason) || 0) + 1);
        return m;
      }, new Map<string, number>())]
    ),
    classified
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "ctx_bridge_apply_summary.json"),
    JSON.stringify({ summary, rows }, null, 2)
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
