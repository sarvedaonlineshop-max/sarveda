#!/usr/bin/env tsx
/**
 * Lightsail CTX compatibility full certification.
 * Run ON Lightsail with production-like DATABASE_URL.
 *
 *   MERCHANT_FEED_SITE_URL=https://sarveda.com \
 *   CTX_CERT_API_BASE=http://127.0.0.1:5000 \
 *   npx tsx scripts/lightsail-ctx-certification.ts
 */
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";

import { MerchantCtxClassification, PrismaClient } from "@prisma/client";

import {
  buildCtxCompatibilityFeed,
  mapCtxOfferToFeedItem,
  parseCtxFeedXml,
  type CtxCompatibilityFeedItem
} from "../src/modules/merchant/ctxCompatibilityFeed";
import {
  classifyAllCtxOffers,
  DEFAULT_CTX_FEED_PATH,
  importCtxFeedFromFile,
  readMappingTsv,
  resolveVariantIdForOffer,
  sellableExclusionReason
} from "../src/modules/merchant/ctxOfferRegistry";
import { availableQty, formatMerchantPriceInr } from "../src/modules/merchant/googleMerchantFeed";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "../..");
const OUT = path.join(REPO, "docs/audit/google-merchant-native-compatibility");
const API_BASE = (process.env.CTX_CERT_API_BASE || "http://127.0.0.1:5000").replace(/\/$/, "");

const prisma = new PrismaClient();

type ManualReason =
  | "A_WOO_IDENTITY_MISSING"
  | "B_VARIANT_RENAMED"
  | "C_ATTRIBUTES_RENAMED"
  | "D_VARIANT_STRUCTURE_CHANGED"
  | "E_VARIANT_DELIBERATELY_DROPPED"
  | "F_PRODUCT_RENAMED"
  | "G_PRODUCT_ABSENT"
  | "H_AMBIGUOUS_MATCH"
  | "I_INACTIVE_DRAFT"
  | "J_HISTORICAL_ANOMALY"
  | "K_OTHER";

function dbMeta(url: string) {
  const u = new URL(url.replace(/^postgresql:/, "http:"));
  return { host: u.hostname, db: u.pathname.slice(1), user: u.username };
}

function parseLegacyAttributes(link: string): string {
  try {
    const q = new URL(link).searchParams;
    const parts: string[] = [];
    q.forEach((v, k) => {
      if (k.startsWith("attribute_")) parts.push(`${k}=${v}`);
    });
    return parts.sort().join("; ");
  } catch {
    return "";
  }
}

function normalizeAttr(s: string): string {
  return s.toLowerCase().replace(/\+/g, " ").replace(/\s+/g, " ").trim();
}

function classifyManualReviewReason(args: {
  wooOfferId: number;
  wooParentId: number | null;
  legacyLink: string;
  mappingRow: import("../src/modules/products/merchantIdentityBackfill").MappingRow | undefined;
  productByWooParent: Map<number, { id: string; slug: string; name: string; status: string }>;
  variantByWooOffer: Map<number, { id: string; slug: string; status: string }>;
  variantsByProductId: Map<string, Array<{ id: string; sku: string; status: string; attrs: string }>>;
}): { reason: ManualReason; notes: string; recommended: string; confidence: string } {
  const {
    wooOfferId,
    wooParentId,
    legacyLink,
    mappingRow,
    productByWooParent,
    variantByWooOffer,
    variantsByProductId
  } = args;

  if (!mappingRow) {
    return {
      reason: "J_HISTORICAL_ANOMALY",
      notes: "CTX offer absent from merchant_woo_sarveda_mapping.tsv",
      recommended: "verify_woo_export_and_import",
      confidence: "low"
    };
  }

  const conf = (mappingRow.match_confidence || "").toLowerCase();
  if (conf === "ambiguous") {
    return {
      reason: "H_AMBIGUOUS_MATCH",
      notes: mappingRow.notes || mappingRow.match_method,
      recommended: "manual_reconcile",
      confidence: "low"
    };
  }

  const parentProduct = wooParentId ? productByWooParent.get(wooParentId) : undefined;
  const mappedVid = (mappingRow.sarveda_variant_id || "").trim();
  const mappedSlug = (mappingRow.sarveda_slug || "").trim();

  if (conf === "unmatched" || mappingRow.match_method?.includes("unmatched")) {
    if (parentProduct) {
      const vars = variantsByProductId.get(parentProduct.id) || [];
      if (vars.length === 0) {
        return {
          reason: "E_VARIANT_DELIBERATELY_DROPPED",
          notes: `Parent product exists (${parentProduct.slug}) but no active variants`,
          recommended: "INTENTIONALLY_EXCLUDE_if_discontinued",
          confidence: "medium"
        };
      }
      return {
        reason: "D_VARIANT_STRUCTURE_CHANGED",
        notes: `Parent ${parentProduct.slug} has ${vars.length} variants; Woo offer ${wooOfferId} unmatched`,
        recommended: "map_by_attributes_or_exclude",
        confidence: "medium"
      };
    }
    return {
      reason: "G_PRODUCT_ABSENT",
      notes: mappingRow.notes || "no Sarveda parent/variant",
      recommended: "import_or_exclude",
      confidence: conf === "unmatched" ? "medium" : "low"
    };
  }

  if (mappedVid && parentProduct) {
    const variantExists = [...variantsByProductId.values()].flat().some((v) => v.id === mappedVid);
    if (!variantExists) {
      if (parentProduct.status !== "ACTIVE") {
        return {
          reason: "I_INACTIVE_DRAFT",
          notes: `Mapped product ${mappedSlug} status=${parentProduct.status}`,
          recommended: "INTENTIONALLY_EXCLUDE",
          confidence: "high"
        };
      }
      return {
        reason: "E_VARIANT_DELIBERATELY_DROPPED",
        notes: `Mapping points to missing variant ${mappedVid}`,
        recommended: "confirm_discontinued",
        confidence: "medium"
      };
    }
  }

  if (parentProduct && mappedSlug && mappedSlug !== parentProduct.slug) {
    return {
      reason: "F_PRODUCT_RENAMED",
      notes: `mapping slug ${mappedSlug} vs current ${parentProduct.slug}`,
      recommended: "link_identity_preserve_g_id",
      confidence: "high"
    };
  }

  if (parentProduct && !variantByWooOffer.has(wooOfferId)) {
    const legacyAttrs = parseLegacyAttributes(legacyLink);
    const vars = variantsByProductId.get(parentProduct.id) || [];
    if (legacyAttrs && vars.length > 0) {
      return {
        reason: "C_ATTRIBUTES_RENAMED",
        notes: `Legacy attrs: ${legacyAttrs}`,
        recommended: "map_by_normalized_attributes",
        confidence: "medium"
      };
    }
    return {
      reason: "A_WOO_IDENTITY_MISSING",
      notes: "Product exists; wooCommerceVariationId not assigned",
      recommended: "apply_identity_backfill",
      confidence: "high"
    };
  }

  if (mappedVid && parentProduct) {
    return {
      reason: "B_VARIANT_RENAMED",
      notes: `SKU/attrs may differ; mapping method ${mappingRow.match_method}`,
      recommended: "verify_1_to_1",
      confidence: conf === "medium" ? "medium" : "high"
    };
  }

  return {
    reason: "K_OTHER",
    notes: `${conf}/${mappingRow.match_method}`,
    recommended: "manual_reconcile",
    confidence: "low"
  };
}

async function fetchProductBySlug(slug: string) {
  const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { product?: Record<string, unknown> } };
  return json.data?.product ?? null;
}

function storefrontPriceAvailability(product: Record<string, unknown>, variantId: string) {
  const variants = (product.variants as Array<Record<string, unknown>>) || [];
  const v = variants.find((x) => x.id === variantId);
  if (!v) return null;
  const inv = v.inventory as { onHand?: number; reserved?: number } | null;
  const qty = availableQty(inv?.onHand, inv?.reserved);
  const sale = v.saleInPaise as number;
  const mrp = v.mrpInPaise as number;
  const onSale = Number.isInteger(mrp) && mrp > sale;
  return {
    availability: qty > 0 ? "in_stock" : "out_of_stock",
    price: onSale ? formatMerchantPriceInr(mrp) : formatMerchantPriceInr(sale),
    salePrice: onSale ? formatMerchantPriceInr(sale) : null,
    saleInPaise: sale,
    qty
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const dbUrl = process.env.DATABASE_URL || "";
  if (/localhost|127\.0\.0\.1/.test(dbUrl)) {
    throw new Error("Refusing localhost DATABASE_URL — run on Lightsail cutover DB");
  }

  const meta = dbMeta(dbUrl);
  console.log("=== ENVIRONMENT ===");
  console.log(JSON.stringify({ host: meta.host, db: meta.db, apiBase: API_BASE }, null, 2));

  const [productCount, variantCount, wooParentCount, wooOfferCount] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.productVariant.count(),
    prisma.product.count({ where: { wooCommerceId: { not: null } } }),
    prisma.productVariant.count({ where: { wooCommerceVariationId: { not: null } } })
  ]);
  console.log(
    JSON.stringify(
      { productCount, variantCount, wooParentCount, wooOfferCount, merchantFeedSite: process.env.MERCHANT_FEED_SITE_URL },
      null,
      2
    )
  );

  // Optional identity recovery (deterministic high/medium mappings)
  const mappingAll = await readMappingTsv();
  let identityWrites = 0;
  for (const [, row] of mappingAll) {
    const conf = (row.match_confidence || "").toLowerCase();
    if (conf !== "high" && conf !== "medium") continue;
    const vid = (row.sarveda_variant_id || "").trim();
    const woo = Number(row.woo_offer_id);
    if (!vid || !Number.isInteger(woo) || woo <= 0) continue;
    const variant = await prisma.productVariant.findUnique({ where: { id: vid }, select: { id: true, wooCommerceVariationId: true } });
    if (!variant || (variant.wooCommerceVariationId != null && variant.wooCommerceVariationId !== woo)) continue;
    if (variant.wooCommerceVariationId === woo) continue;
    const owner = await prisma.productVariant.findFirst({ where: { wooCommerceVariationId: woo }, select: { id: true } });
    if (owner && owner.id !== vid) continue;
    await prisma.productVariant.update({ where: { id: vid }, data: { wooCommerceVariationId: woo } });
    identityWrites += 1;
  }
  console.log("IDENTITY_RECOVERY_WRITES", identityWrites);

  // Import + classify
  const importResult = await importCtxFeedFromFile(DEFAULT_CTX_FEED_PATH);
  console.log("IMPORT", JSON.stringify(importResult));

  const registry = await prisma.merchantCtxOffer.findMany({ orderBy: { wooOfferId: "asc" } });
  const counts = { PUBLISH: 0, INTENTIONALLY_EXCLUDE: 0, MANUAL_REVIEW: 0 };
  for (const r of registry) counts[r.classification] += 1;
  if (counts.PUBLISH + counts.INTENTIONALLY_EXCLUDE + counts.MANUAL_REVIEW !== 883) {
    throw new Error(`Accounted ${counts.PUBLISH + counts.INTENTIONALLY_EXCLUDE + counts.MANUAL_REVIEW} != 883`);
  }

  const { items: feedItems, xml, diagnostics } = await buildCtxCompatibilityFeed();
  writeFileSync(path.join(OUT, "lightsail_products_source_2.xml"), xml, "utf8");

  const ctxRows = parseCtxFeedXml(readFileSync(DEFAULT_CTX_FEED_PATH, "utf8"));
  const ctxById = new Map(ctxRows.map((r) => [r.wooOfferId, r]));
  const feedById = new Map(feedItems.map((i) => [i.wooOfferId, i]));

  const mapping = await readMappingTsv();
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true, name: true, status: true, wooCommerceId: true }
  });
  const variants = await prisma.productVariant.findMany({
    select: {
      id: true,
      sku: true,
      status: true,
      wooCommerceVariationId: true,
      productId: true,
      saleInPaise: true,
      productRel: { select: { slug: true, status: true, wooCommerceId: true } },
      attributeValues: {
        select: { attributeValue: { select: { value: true, attribute: { select: { slug: true } } } } }
      }
    }
  });

  const productByWooParent = new Map<number, (typeof products)[0]>();
  for (const p of products) {
    if (p.wooCommerceId) productByWooParent.set(p.wooCommerceId, p);
  }
  const variantByWooOffer = new Map<number, (typeof variants)[0]>();
  for (const v of variants) {
    if (v.wooCommerceVariationId) variantByWooOffer.set(v.wooCommerceVariationId, v);
  }
  const variantsByProductId = new Map<string, Array<{ id: string; sku: string; status: string; attrs: string }>>();
  for (const v of variants) {
    const attrs = v.attributeValues
      .map((a) => `${a.attributeValue.attribute.slug}=${a.attributeValue.value}`)
      .sort()
      .join("; ");
    const list = variantsByProductId.get(v.productId) || [];
    list.push({ id: v.id, sku: v.sku, status: v.status, attrs });
    variantsByProductId.set(v.productId, list);
  }

  // Certification metrics
  let idExact = 0;
  let ptExact = 0;
  let groupExact = 0;
  let priceMatch = 0;
  let availMatch = 0;
  let variantLinkOk = 0;
  let landingTested = 0;
  let landing404 = 0;
  let landingWrongVariant = 0;
  let publishCtxPriceDiff = 0;
  let publishCtxAvailDiff = 0;

  const manualReasonCounts: Record<ManualReason, number> = {
    A_WOO_IDENTITY_MISSING: 0,
    B_VARIANT_RENAMED: 0,
    C_ATTRIBUTES_RENAMED: 0,
    D_VARIANT_STRUCTURE_CHANGED: 0,
    E_VARIANT_DELIBERATELY_DROPPED: 0,
    F_PRODUCT_RENAMED: 0,
    G_PRODUCT_ABSENT: 0,
    H_AMBIGUOUS_MATCH: 0,
    I_INACTIVE_DRAFT: 0,
    J_HISTORICAL_ANOMALY: 0,
    K_OTHER: 0
  };

  const finalCsv: string[] = [
    [
      "legacy_g_id",
      "legacy_item_group_id",
      "legacy_product_type",
      "legacy_link",
      "legacy_price",
      "legacy_availability",
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
      "id_exact",
      "product_type_exact",
      "group_exact",
      "variant_link_ok",
      "price_storefront_match",
      "availability_storefront_match",
      "ctx_price_differs",
      "ctx_availability_differs"
    ].join(",")
  ];

  const manualCsv: string[] = [
    [
      "legacy_g_id",
      "legacy_item_group_id",
      "legacy_title",
      "legacy_product_type",
      "legacy_link",
      "legacy_attributes",
      "legacy_price",
      "candidate_sarveda_product",
      "candidate_sarveda_variant",
      "candidate_slug",
      "candidate_current_price",
      "candidate_status",
      "reason",
      "recommended_action",
      "confidence",
      "notes"
    ].join(",")
  ];

  const excludeRows: Array<Record<string, string>> = [];

  const esc = (s: string | number | null | undefined) => {
    const t = s == null ? "" : String(s);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };

  for (const reg of registry) {
    const ctx = ctxById.get(reg.wooOfferId)!;
    const native = feedById.get(reg.wooOfferId) ?? null;
    const mappingRow = mapping.get(reg.wooOfferId);

    let manualReason: ManualReason | "" = "";
    let manualNotes = "";
    let manualRec = "";
    let manualConf = "";

    if (reg.classification === MerchantCtxClassification.MANUAL_REVIEW) {
      const m = classifyManualReviewReason({
        wooOfferId: reg.wooOfferId,
        wooParentId: reg.wooParentId,
        legacyLink: ctx.ctxLegacyLink,
        mappingRow,
        productByWooParent,
        variantByWooOffer,
        variantsByProductId
      });
      manualReason = m.reason;
      manualNotes = m.notes;
      manualRec = m.recommended;
      manualConf = m.confidence;
      manualReasonCounts[m.reason] += 1;

      manualCsv.push(
        [
          reg.wooOfferId,
          ctx.ctxItemGroupId ?? "",
          ctx.ctxTitle,
          ctx.ctxProductType,
          ctx.ctxLegacyLink,
          parseLegacyAttributes(ctx.ctxLegacyLink),
          ctx.ctxPrice,
          mappingRow?.sarveda_product_id ?? "",
          mappingRow?.sarveda_variant_id ?? reg.sarvedaVariantId ?? "",
          mappingRow?.sarveda_slug ?? "",
          "",
          "",
          manualReason,
          manualRec,
          manualConf,
          manualNotes
        ].map(esc).join(",")
      );
    }

    if (reg.classification === MerchantCtxClassification.INTENTIONALLY_EXCLUDE) {
      excludeRows.push({
        g_id: String(reg.wooOfferId),
        title: ctx.ctxTitle,
        reason: reg.excludeReason || "",
        status: reg.sarvedaVariantId || ""
      });
    }

    const idOk = native ? native.gId === String(reg.wooOfferId) : false;
    const ptOk = native ? native.productType === ctx.ctxProductType : false;
    const groupOk = native ? (native.itemGroupId ?? "") === (ctx.ctxItemGroupId ?? "") : false;
    const linkOk =
      Boolean(native?.link) && native!.link.includes(`offer=${reg.wooOfferId}`) && Boolean(native?.sarvedaSlug);

    let priceOk = false;
    let availOk = false;
    let rowCtxPriceDiff = false;
    let rowCtxAvailDiff = false;

    if (native && reg.classification === MerchantCtxClassification.PUBLISH) {
      if (idOk) idExact += 1;
      if (ptOk) ptExact += 1;
      if (groupOk) groupExact += 1;
      if (linkOk) variantLinkOk += 1;

      if (ctx.ctxPrice && !ctx.ctxPrice.includes((native.price.split(" ")[0] || ""))) rowCtxPriceDiff = true;
      const ca = ctx.ctxAvailability.replace(/ /g, "_");
      if (native.availability !== ca) rowCtxAvailDiff = true;

      landingTested += 1;
      const product = await fetchProductBySlug(native.sarvedaSlug);
      if (!product) {
        landing404 += 1;
      } else {
        const store = storefrontPriceAvailability(product, native.sarvedaVariantId);
        if (store) {
          priceOk = store.price === native.price && (store.salePrice ?? "") === (native.salePrice ?? "");
          availOk = store.availability === native.availability;
          if (priceOk) priceMatch += 1;
          if (availOk) availMatch += 1;
        }
        const offerHit = (product.variants as Array<{ wooCommerceVariationId?: number | null; id: string }>).find(
          (v) => String(v.wooCommerceVariationId ?? "") === String(reg.wooOfferId) || v.id === native.sarvedaVariantId
        );
        if (!offerHit) landingWrongVariant += 1;
      }
    }

    if (native && ctx.ctxPrice && native.price !== ctx.ctxPrice && !ctx.ctxPrice.includes(native.price.split(" ")[0])) {
      // intentional sarveda price change vs ctx
    }
    if (native && ctx.ctxAvailability.replace(/ /g, "_") !== native.availability) {
      ctxAvailDiff = true;
    }

    finalCsv.push(
      [
        reg.wooOfferId,
        ctx.ctxItemGroupId ?? "",
        ctx.ctxProductType,
        ctx.ctxLegacyLink,
        ctx.ctxPrice,
        ctx.ctxAvailability,
        reg.sarvedaVariantId ?? "",
        native?.sarvedaSlug ?? mappingRow?.sarveda_slug ?? "",
        native?.gId ?? "",
        native?.itemGroupId ?? "",
        native?.productType ?? "",
        native?.link ?? "",
        native?.price ?? "",
        native?.availability ?? "",
        reg.classification,
        reg.classification === MerchantCtxClassification.PUBLISH ? "PUBLISH" : reg.classification,
        reg.excludeReason ?? manualReason,
        reg.manualAction ?? manualRec,
        idOk ? "yes" : "no",
        ptOk ? "yes" : "no",
        groupOk ? "yes" : "no",
        linkOk ? "yes" : "no",
        priceOk ? "yes" : "no",
        availOk ? "yes" : "no",
        rowCtxPriceDiff ? "yes" : "no",
        rowCtxAvailDiff ? "yes" : "no"
      ].map(esc).join(",")
    );
  }

  // Count ctx diffs for publish
  for (const item of feedItems) {
    const ctx = ctxById.get(item.wooOfferId)!;
    const priceNum = item.price.split(" ")[0] || "";
    if (ctx.ctxPrice && !ctx.ctxPrice.includes(priceNum)) publishCtxPriceDiff += 1;
    const ca = ctx.ctxAvailability.replace(/ /g, "_");
    if (item.availability !== ca) publishCtxAvailDiff += 1;
  }

  const feedIds = feedItems.map((i) => i.gId);
  const dupIds = feedIds.length - new Set(feedIds).size;

  const summary = {
    environment: { ...meta, productCount, variantCount, wooParentCount, wooOfferCount },
    buckets: counts,
    accounted: counts.PUBLISH + counts.INTENTIONALLY_EXCLUDE + counts.MANUAL_REVIEW,
    feed: {
      publishedItems: feedItems.length,
      diagnostics,
      uniqueIds: new Set(feedIds).size,
      duplicateIds: dupIds,
      numericIdViolations: feedItems.filter((i) => !/^\d+$/.test(i.gId)).length,
      productTypeMissing: feedItems.filter((i) => !i.productType).length
    },
    publish_certification: {
      count: feedItems.length,
      id_exact: idExact,
      product_type_exact: ptExact,
      group_exact: groupExact,
      variant_link_ok: variantLinkOk,
      price_storefront_match: priceMatch,
      availability_storefront_match: availMatch,
      id_mismatches: feedItems.length - idExact,
      product_type_mismatches: feedItems.length - ptExact,
      group_mismatches: feedItems.length - groupExact
    },
    landing: {
      tested: landingTested,
      wrong_variant: landingWrongVariant,
      not_found: landing404
    },
    ctx_intentional_differences: {
      publish_price_differs_from_ctx: publishCtxPriceDiff,
      publish_availability_differs_from_ctx: publishCtxAvailDiff
    },
    manual_review_breakdown: manualReasonCounts,
    intentionally_excluded: excludeRows.slice(0, 20),
    intentionally_excluded_count: excludeRows.length
  };

  writeFileSync(path.join(OUT, "final_883_compatibility.csv"), finalCsv.join("\n") + "\n", "utf8");
  writeFileSync(path.join(OUT, "manual_review_remaining.csv"), manualCsv.join("\n") + "\n", "utf8");
  writeFileSync(path.join(OUT, "lightsail_certification_summary.json"), JSON.stringify(summary, null, 2), "utf8");

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
