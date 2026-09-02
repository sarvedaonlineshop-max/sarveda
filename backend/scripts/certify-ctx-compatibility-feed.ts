/**
 * Certify CTX compatibility feed — generates final_883_compatibility.csv/json.
 *
 *   npx tsx scripts/certify-ctx-compatibility-feed.ts
 */
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";

import { MerchantCtxClassification } from "@prisma/client";

import { prisma } from "../src/config/db";
import {
  buildCtxCompatibilityFeed,
  buildInMemoryCtxCertificationRows,
  parseCtxFeedXml
} from "../src/modules/merchant/ctxCompatibilityFeed";
import { DEFAULT_CTX_FEED_PATH } from "../src/modules/merchant/ctxOfferRegistry";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const OUT_DIR = path.resolve(__dirname, "../../docs/audit/google-merchant-native-compatibility");

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const ctxPath = process.env.CTX_FEED_PATH || DEFAULT_CTX_FEED_PATH;
  const ctxXml = readFileSync(ctxPath, "utf8");
  const ctxRows = parseCtxFeedXml(ctxXml);
  if (ctxRows.length !== 883) {
    throw new Error(`Expected 883 CTX rows, got ${ctxRows.length}`);
  }

  const registryCount = await prisma.merchantCtxOffer.count();
  let feedItems: Awaited<ReturnType<typeof buildCtxCompatibilityFeed>>["items"] = [];
  if (registryCount >= 883) {
    const built = await buildCtxCompatibilityFeed();
    feedItems = built.items;
  }

  const certRows = await buildInMemoryCtxCertificationRows(ctxRows);
  const feedByOffer = new Map(feedItems.map((i) => [i.wooOfferId, i]));

  const lines: string[] = [
    [
      "legacy_g_id",
      "legacy_item_group_id",
      "legacy_product_type",
      "legacy_link",
      "legacy_price",
      "legacy_availability",
      "sarveda_product_id",
      "sarveda_variant_id",
      "sarveda_slug",
      "native_g_id",
      "native_item_group_id",
      "native_product_type",
      "native_link",
      "native_price",
      "native_availability",
      "classification",
      "publish_status",
      "reason",
      "manual_action",
      "id_exact_match",
      "product_type_exact_match",
      "group_exact_match",
      "variant_link_resolves"
    ].join(",")
  ];

  let idExact = 0;
  let ptExact = 0;
  let groupExact = 0;
  let variantLinkOk = 0;
  let published = 0;
  const counts = {
    PUBLISH: 0,
    INTENTIONALLY_EXCLUDE: 0,
    MANUAL_REVIEW: 0
  };

  for (const row of certRows) {
    counts[row.classification] += 1;
    const native = row.native ?? feedByOffer.get(row.legacy.wooOfferId) ?? null;
    if (row.classification === MerchantCtxClassification.PUBLISH) published += 1;

    const legacyGroup = row.legacy.ctxItemGroupId ?? "";
    const nativeGroup = native?.itemGroupId ?? "";
    const idMatch = native ? native.gId === String(row.legacy.wooOfferId) : false;
    const ptMatch = native ? native.productType === row.legacy.ctxProductType : false;
    const groupMatch = native ? nativeGroup === legacyGroup : false;
    const linkOk =
      Boolean(native?.link) &&
      native!.link.includes("offer=" + row.legacy.wooOfferId) &&
      Boolean(row.sarvedaSlug);

    if (native && row.classification === MerchantCtxClassification.PUBLISH) {
      if (idMatch) idExact += 1;
      if (ptMatch) ptExact += 1;
      if (groupMatch) groupExact += 1;
      if (linkOk) variantLinkOk += 1;
    }

    lines.push(
      [
        row.legacy.wooOfferId,
        legacyGroup,
        row.legacy.ctxProductType,
        row.legacy.ctxLegacyLink,
        row.legacy.ctxPrice,
        row.legacy.ctxAvailability,
        "",
        row.sarvedaVariantId ?? "",
        row.sarvedaSlug ?? "",
        native?.gId ?? "",
        nativeGroup,
        native?.productType ?? "",
        native?.link ?? "",
        native?.price ?? "",
        native?.availability ?? "",
        row.classification,
        row.publishStatus,
        row.reason ?? "",
        row.manualAction ?? "",
        idMatch ? "yes" : "no",
        ptMatch ? "yes" : "no",
        groupMatch ? "yes" : "no",
        linkOk ? "yes" : "no"
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const summary = {
    ctx_total: 883,
    accounted: certRows.length,
    published,
    inactive: counts.INTENTIONALLY_EXCLUDE,
    manual_review: counts.MANUAL_REVIEW,
    intentionally_excluded: counts.INTENTIONALLY_EXCLUDE,
    publish_classification: counts.PUBLISH,
    published_id_exact_matches: idExact,
    published_product_type_exact_matches: ptExact,
    published_group_exact_matches: groupExact,
    published_variant_link_resolves: variantLinkOk,
    registry_rows_in_db: registryCount,
    feed_published_items: feedItems.length
  };

  writeFileSync(path.join(OUT_DIR, "final_883_compatibility.csv"), lines.join("\n") + "\n", "utf8");
  writeFileSync(path.join(OUT_DIR, "final_883_summary.json"), JSON.stringify(summary, null, 2), "utf8");
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
