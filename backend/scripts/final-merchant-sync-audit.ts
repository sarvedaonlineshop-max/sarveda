#!/usr/bin/env tsx
/**
 * READ-ONLY final Merchant sync certification audit.
 * No DB writes. No feed mutations.
 *
 *   MERCHANT_FEED_SITE_URL=https://sarveda.com \
 *   CTX_CERT_API_BASE=https://sarveda-demo.xyz \
 *   npx tsx scripts/final-merchant-sync-audit.ts
 */
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { createInterface } from "readline";

import {
  MerchantCtxClassification,
  PrismaClient,
  type Prisma
} from "@prisma/client";
import dotenv from "dotenv";

import { buildCtxCompatibilityFeed, parseCtxFeedXml } from "../src/modules/merchant/ctxCompatibilityFeed";
import {
  availableQty,
  buildGoogleMerchantFeed,
  formatMerchantPriceInr
} from "../src/modules/merchant/googleMerchantFeed";
import { DEFAULT_CTX_FEED_PATH } from "../src/modules/merchant/ctxOfferRegistry";
import { shopCatalogProductWhere, shopCatalogVariantSkuWhere, shopInventoryWhere } from "../src/utils/shop-catalog";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "../..");
const OUT = path.join(REPO, "docs/audit/google-merchant-final-sync");
const FORMER_32 = path.join(
  REPO,
  "docs/audit/google-merchant-native-compatibility/shop_only_32.csv"
);
const API_BASE = (process.env.CTX_CERT_API_BASE || "https://sarveda-demo.xyz").replace(/\/$/, "");
const SITE_ORIGIN = (process.env.MERCHANT_FEED_SITE_URL || "https://sarveda.com").replace(/\/$/, "");

const prisma = new PrismaClient();

type FormerRow = { sku: string; slug: string; variantId: string };

function esc(s: string | number | null | undefined): string {
  const t = s == null ? "" : String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function parseFormer32(): FormerRow[] {
  const lines = readFileSync(FORMER_32, "utf8").trim().split("\n").slice(1);
  return lines.map((line) => {
    const [sku, slug, variantId] = line.split(",").map((c) => c.trim().replace(/\r$/, ""));
    return { sku, slug, variantId };
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

function storefrontPriceAvailability(
  product: {
    variants?: Array<{
      id: string;
      saleInPaise: number;
      mrpInPaise: number;
      inventory?: { onHand: number; reserved: number } | null;
    }>;
  },
  variantId: string
): { price: string; salePrice: string | null; availability: string } | null {
  const v = product.variants?.find((x) => x.id === variantId);
  if (!v) return null;
  const onSale = Number.isInteger(v.mrpInPaise) && v.mrpInPaise > v.saleInPaise;
  const price = onSale ? formatMerchantPriceInr(v.mrpInPaise) : formatMerchantPriceInr(v.saleInPaise);
  const salePrice = onSale ? formatMerchantPriceInr(v.saleInPaise) : null;
  const qty = availableQty(v.inventory?.onHand, v.inventory?.reserved);
  return { price, salePrice, availability: qty > 0 ? "in_stock" : "out_of_stock" };
}

async function fetchProductBySlug(slug: string): Promise<{
  product: { slug: string; name: string; status: string };
  variants: Array<{
    id: string;
    sku: string;
    wooCommerceVariationId: number | null;
    saleInPaise: number;
    mrpInPaise: number;
    status: string;
    inventory?: { onHand: number; reserved: number } | null;
  }>;
} | null> {
  try {
    const data = (await fetchJson(`${API_BASE}/api/products/${encodeURIComponent(slug)}`)) as {
      success: boolean;
      data: {
        product: { slug: string; name: string; status: string; variants?: unknown[] };
        variants?: unknown[];
      };
    };
    if (!data.success) return null;
    const variants = (data.data.variants ?? data.data.product.variants ?? []) as Array<{
      id: string;
      sku: string;
      wooCommerceVariationId: number | null;
      saleInPaise: number;
      mrpInPaise: number;
      status: string;
      inventory?: { onHand: number; reserved: number } | null;
    }>;
    return { product: data.data.product, variants };
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const ctxXml = readFileSync(DEFAULT_CTX_FEED_PATH, "utf8");
  const ctxRows = parseCtxFeedXml(ctxXml);
  const ctxById = new Map(ctxRows.map((r) => [r.wooOfferId, r]));

  const registry = await prisma.merchantCtxOffer.findMany({ orderBy: { wooOfferId: "asc" } });
  const publishRegistry = registry.filter((r) => r.classification === MerchantCtxClassification.PUBLISH);

  const shopInvCount = await prisma.inventory.count({ where: shopInventoryWhere });

  const activeShopVariants = await prisma.productVariant.findMany({
    where: {
      ...shopCatalogVariantSkuWhere,
      status: "ACTIVE",
      productRel: { ...shopCatalogProductWhere, status: "ACTIVE" },
      inventory: { isNot: null }
    },
    select: {
      id: true,
      sku: true,
      wooCommerceVariationId: true,
      status: true,
      saleInPaise: true,
      mrpInPaise: true,
      productRel: { select: { slug: true, name: true, status: true, catalogHidden: true, wooCommerceId: true } },
      inventory: { select: { onHand: true, reserved: true } }
    },
    orderBy: { sku: "asc" }
  });

  const inactiveVariants = await prisma.productVariant.count({
    where: {
      ...shopCatalogVariantSkuWhere,
      status: "INACTIVE",
      productRel: shopCatalogProductWhere
    }
  });

  const draftProducts = await prisma.product.count({
    where: { deletedAt: null, status: "DRAFT" }
  });

  const hiddenProducts = await prisma.product.count({
    where: { deletedAt: null, catalogHidden: true }
  });

  const testVariants = await prisma.productVariant.findMany({
    where: {
      OR: [
        { sku: { startsWith: "MI-TP-" } },
        { sku: { startsWith: "TEST-SKU-" } },
        { productRel: { slug: "test-product" } }
      ]
    },
    select: { sku: true, status: true, productRel: { select: { slug: true, catalogHidden: true, status: true } } }
  });

  const hiddenDupes = await prisma.product.findMany({
    where: {
      slug: { in: ["elemental-chimes", "incense-stick-stand"] },
      deletedAt: null
    },
    select: { slug: true, catalogHidden: true, status: true, variants: { select: { sku: true, status: true } } }
  });

  const missingWooActive = activeShopVariants.filter((v) => v.wooCommerceVariationId == null);

  const { items: feedItems, xml, diagnostics } = await buildCtxCompatibilityFeed();
  writeFileSync(path.join(OUT, "final_feed_snapshot.xml"), xml, "utf8");

  const feedById = new Map(feedItems.map((i) => [i.wooOfferId, i]));
  const gIds = feedItems.map((i) => i.gId);
  const dupGids = gIds.filter((id, idx) => gIds.indexOf(id) !== idx);

  const publishWooIds = new Set(publishRegistry.map((r) => r.wooOfferId));
  const nativeOnlyShop = activeShopVariants.filter(
    (v) => v.wooCommerceVariationId != null && !publishWooIds.has(v.wooCommerceVariationId)
  );

  let idMismatch = 0;
  let ptMismatch = 0;
  let groupMismatch = 0;
  let priceMismatch = 0;
  let availMismatch = 0;
  let wrongProductLanding = 0;
  let wrongVariantLanding = 0;
  let brokenPdp = 0;
  let brokenImages = 0;
  let missingProductType = 0;
  let missingFromFeed = 0;

  const reconciliationRows: string[] = [
    [
      "sku",
      "woo_offer_id",
      "classification",
      "in_active_shop",
      "in_feed",
      "status_bucket",
      "feed_g_id",
      "ctx_product_type",
      "feed_product_type",
      "id_match",
      "product_type_match",
      "item_group_match",
      "feed_price",
      "storefront_price",
      "price_match",
      "feed_availability",
      "storefront_availability",
      "availability_match",
      "landing_slug",
      "landing_http",
      "variant_selected",
      "image_ok",
      "notes"
    ].join(",")
  ];

  for (const reg of publishRegistry) {
    const ctx = ctxById.get(reg.wooOfferId);
    const native = feedById.get(reg.wooOfferId);
    const variant = reg.sarvedaVariantId
      ? activeShopVariants.find((v) => v.id === reg.sarvedaVariantId) ??
        (await prisma.productVariant.findUnique({
          where: { id: reg.sarvedaVariantId },
          select: {
            id: true,
            sku: true,
            wooCommerceVariationId: true,
            status: true,
            saleInPaise: true,
            mrpInPaise: true,
            productRel: { select: { slug: true, name: true, status: true, catalogHidden: true } },
            inventory: { select: { onHand: true, reserved: true } }
          }
        }))
      : null;

    const inActiveShop = variant
      ? activeShopVariants.some((v) => v.id === variant.id)
      : false;

    let statusBucket = "IN_FEED_CORRECT";
    const notes: string[] = [];

    if (!native) {
      statusBucket = "MISSING_FROM_FEED";
      missingFromFeed += 1;
      notes.push("publish_registry_row_not_in_feed");
    } else {
      const idOk = native.gId === String(reg.wooOfferId);
      const ptOk = ctx ? native.productType === ctx.ctxProductType : false;
      const groupOk = ctx ? (native.itemGroupId ?? "") === (ctx.ctxItemGroupId ?? "") : false;
      if (!idOk) {
        idMismatch += 1;
        statusBucket = "WRONG_VARIANT";
        notes.push("g_id_mismatch");
      }
      if (!ptOk) {
        ptMismatch += 1;
        if (statusBucket === "IN_FEED_CORRECT") statusBucket = "WRONG_PRODUCT";
        notes.push("product_type_mismatch");
      }
      if (!groupOk) {
        groupMismatch += 1;
        notes.push("item_group_mismatch");
      }
      if (!native.productType?.trim()) {
        missingProductType += 1;
        notes.push("missing_product_type");
      }

      const product = await fetchProductBySlug(native.sarvedaSlug);
      let landingHttp = "fail";
      let variantSelected = "no";
      let priceOk = false;
      let availOk = false;
      let storePrice = "";
      let storeAvail = "";

      if (!product) {
        brokenPdp += 1;
        landingHttp = "404";
        if (statusBucket === "IN_FEED_CORRECT") statusBucket = "WRONG_PRODUCT";
        notes.push("pdp_404");
      } else {
        landingHttp = "ok";
        const store = storefrontPriceAvailability(product, native.sarvedaVariantId);
        if (store) {
          storePrice = store.price;
          storeAvail = store.availability;
          priceOk = store.price === native.price && (store.salePrice ?? "") === (native.salePrice ?? "");
          availOk = store.availability === native.availability;
          if (!priceOk) {
            priceMismatch += 1;
            notes.push("price_vs_storefront");
          }
          if (!availOk) {
            availMismatch += 1;
            notes.push("availability_vs_storefront");
          }
        }
        const hit = product.variants.find(
          (v) =>
            String(v.wooCommerceVariationId ?? "") === String(reg.wooOfferId) || v.id === native.sarvedaVariantId
        );
        if (hit) variantSelected = "yes";
        else {
          wrongVariantLanding += 1;
          if (statusBucket === "IN_FEED_CORRECT") statusBucket = "WRONG_VARIANT";
          notes.push("offer_not_on_pdp");
        }
        if (product.product.slug !== native.sarvedaSlug) {
          wrongProductLanding += 1;
          notes.push("wrong_product_slug");
        }
      }

      const imageOk = native.imageLink.startsWith("https://") && (await headOk(native.imageLink));
      if (!imageOk) brokenImages += 1;

      reconciliationRows.push(
        [
          variant?.sku ?? "",
          reg.wooOfferId,
          reg.classification,
          inActiveShop ? "yes" : "no",
          "yes",
          statusBucket,
          native.gId,
          ctx?.ctxProductType ?? "",
          native.productType,
          idOk ? "yes" : "no",
          ptOk ? "yes" : "no",
          groupOk ? "yes" : "no",
          native.price,
          storePrice,
          priceOk ? "yes" : "no",
          native.availability,
          storeAvail,
          availOk ? "yes" : "no",
          native.sarvedaSlug,
          landingHttp,
          variantSelected,
          imageOk ? "yes" : "no",
          notes.join(";")
        ].map(esc).join(",")
      );
      continue;
    }

    reconciliationRows.push(
      [
        variant?.sku ?? "",
        reg.wooOfferId,
        reg.classification,
        inActiveShop ? "yes" : "no",
        "no",
        statusBucket,
        "",
        ctx?.ctxProductType ?? "",
        "",
        "no",
        "no",
        "no",
        "",
        "",
        "no",
        "",
        "",
        "no",
        variant?.productRel.slug ?? "",
        "",
        "",
        "",
        notes.join(";")
      ].map(esc).join(",")
    );
  }

  // Active shop offers not in historical publish feed
  for (const v of activeShopVariants) {
    if (v.wooCommerceVariationId != null && publishWooIds.has(v.wooCommerceVariationId)) continue;
    let bucket = "INTENTIONALLY_EXCLUDED";
    const notes: string[] = ["native_supplemental_not_in_ctx_source2"];
    if (v.sku.startsWith("MI-TP-") || v.productRel.slug === "test-product") {
      bucket = "TEST_INTERNAL";
      notes.push("test_product");
    } else if (
      v.productRel.slug === "elemental-chimes" ||
      v.productRel.slug === "incense-stick-stand"
    ) {
      bucket = "INTENTIONALLY_EXCLUDED";
      notes.push("duplicate_hidden");
    }
    reconciliationRows.push(
      [
        v.sku,
        v.wooCommerceVariationId ?? "",
        "NATIVE_ONLY",
        "yes",
        "no",
        bucket,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        v.productRel.slug,
        "",
        "",
        "",
        notes.join(";")
      ].map(esc).join(",")
    );
  }

  writeFileSync(path.join(OUT, "final_feed_reconciliation.csv"), reconciliationRows.join("\n"), "utf8");

  // Former 32
  const formerRows = parseFormer32();
  const formerOut: string[] = [
    [
      "original_sku",
      "original_slug",
      "original_variant_id",
      "current_sku",
      "current_slug",
      "current_variant_id",
      "variant_status",
      "product_status",
      "catalog_hidden",
      "woo_variation_id",
      "in_shop_inventory",
      "ctx_publish",
      "in_source2_feed",
      "feed_g_id",
      "product_type",
      "price_paise",
      "availability",
      "landing_result",
      "final_status",
      "notes"
    ].join(",")
  ];

  for (const row of formerRows) {
    const variant =
      (await prisma.productVariant.findFirst({
        where: { OR: [{ id: row.variantId }, { sku: row.sku }] },
        select: {
          id: true,
          sku: true,
          status: true,
          wooCommerceVariationId: true,
          saleInPaise: true,
          mrpInPaise: true,
          productRel: {
            select: { slug: true, name: true, status: true, catalogHidden: true }
          },
          inventory: { select: { onHand: true, reserved: true } }
        }
      })) ?? null;

    const inShop =
      variant &&
      (await prisma.inventory.count({
        where: {
          variantId: variant.id,
          ...shopInventoryWhere
        }
      })) > 0;

    const woo = variant?.wooCommerceVariationId ?? null;
    const ctxReg = woo
      ? registry.find((r) => r.wooOfferId === woo)
      : null;
    const feed = woo ? feedById.get(woo) : undefined;
    const ctxPublish = ctxReg?.classification === MerchantCtxClassification.PUBLISH;

    let landing = "n/a";
    if (variant?.productRel.slug && woo) {
      const p = await fetchProductBySlug(variant.productRel.slug);
      if (!p) landing = "404";
      else {
        const hit = p.variants.find(
          (x) => String(x.wooCommerceVariationId ?? "") === String(woo) || x.id === variant.id
        );
        landing = hit ? "ok_variant" : "wrong_variant";
      }
    } else if (variant?.productRel.catalogHidden) {
      landing = "hidden_product";
    }

    let finalStatus = "RESOLVED_NATIVE_SUPPLEMENTAL";
    const notes: string[] = [];
    if (row.sku.startsWith("MI-TP-")) {
      finalStatus = "TEST_INTERNAL_HIDDEN";
      notes.push("remove_at_cutover");
    } else if (row.sku === "MI-EC" || row.slug === "elemental-chimes") {
      finalStatus = "INTENTIONALLY_EXCLUDED_DUPLICATE";
      notes.push("superseded_by_elemental-chimes-new");
    } else if (row.sku === "MI-IS-ST") {
      finalStatus = "INTENTIONALLY_EXCLUDED_BUNDLED";
      notes.push("stand_in_IS-7C-SET-S");
    } else if (ctxPublish && feed) {
      finalStatus = "IN_FEED_CORRECT";
    } else if (woo && !ctxPublish) {
      finalStatus = "NATIVE_SUPPLEMENTAL_WITH_WOO_ID";
      notes.push("not_in_764_ctx_publish");
    } else if (!woo) {
      finalStatus = "MANUAL_REVIEW";
      notes.push("missing_woo_id");
    }

    const qty = variant?.inventory
      ? availableQty(variant.inventory.onHand, variant.inventory.reserved)
      : 0;

    formerOut.push(
      [
        row.sku,
        row.slug,
        row.variantId,
        variant?.sku ?? "",
        variant?.productRel.slug ?? "",
        variant?.id ?? "",
        variant?.status ?? "",
        variant?.productRel.status ?? "",
        variant?.productRel.catalogHidden ? "yes" : "no",
        woo ?? "",
        inShop ? "yes" : "no",
        ctxPublish ? "yes" : "no",
        feed ? "yes" : "no",
        feed?.gId ?? "",
        feed?.productType ?? "",
        variant?.saleInPaise ?? "",
        qty > 0 ? "in_stock" : "out_of_stock",
        landing,
        finalStatus,
        notes.join(";")
      ].map(esc).join(",")
    );
  }

  writeFileSync(path.join(OUT, "former_32_reconciliation.csv"), formerOut.join("\n"), "utf8");

  // Live API feed cross-check
  let liveApiItemCount: number | null = null;
  let liveApiHeaders: Record<string, string> = {};
  try {
    const res = await fetch(`${API_BASE}/api/merchant/google/products-source-2.xml`, {
      headers: { Accept: "application/xml" }
    });
    liveApiHeaders = {
      items: res.headers.get("x-sarveda-merchant-feed-items") ?? "",
      registry: res.headers.get("x-sarveda-merchant-ctx-registry-total") ?? "",
      publish: res.headers.get("x-sarveda-merchant-ctx-publish-classified") ?? ""
    };
    const text = await res.text();
    liveApiItemCount = (text.match(/<item>/gi) ?? []).length;
  } catch (e) {
    liveApiHeaders = { error: e instanceof Error ? e.message : String(e) };
  }

  const supplemental = await buildGoogleMerchantFeed();
  const supplementalEligible = supplemental.diagnostics.eligibleItems;

  const summary = {
    auditedAt: new Date().toISOString(),
    database: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL.replace(/^postgresql:/, "http:")).hostname : "",
    siteOrigin: SITE_ORIGIN,
    apiBase: API_BASE,
    shop: {
      activeInventoryRows: shopInvCount,
      activeShopVariants: activeShopVariants.length,
      activeSkus: activeShopVariants.map((v) => v.sku).length,
      inactiveVariants,
      draftProducts,
      catalogHiddenProducts: hiddenProducts,
      missingWooOnActiveShop: missingWooActive.length,
      nativeOnlySupplementalWithWoo: nativeOnlyShop.length
    },
    ctxRegistry: {
      total: registry.length,
      publish: publishRegistry.length,
      intentionallyExcluded: registry.filter((r) => r.classification === "INTENTIONALLY_EXCLUDE").length,
      manualReview: registry.filter((r) => r.classification === "MANUAL_REVIEW").length
    },
    productsSource2Feed: {
      builtItemCount: feedItems.length,
      diagnostics,
      uniqueGIds: new Set(gIds).size,
      duplicateGIds: [...new Set(dupGids)],
      groupedOffers: feedItems.filter((i) => i.itemGroupId).length,
      simpleOffers: feedItems.filter((i) => !i.itemGroupId).length,
      missingProductType: missingProductType,
      liveApiItemCount,
      liveApiHeaders
    },
    historicalContinuity764: {
      publishRegistry: publishRegistry.length,
      inFeed: feedItems.length,
      idMismatches: idMismatch,
      productTypeMismatches: ptMismatch,
      itemGroupMismatches: groupMismatch,
      missingFromFeed
    },
    currentCommerceAuthority: {
      priceMismatchesVsStorefront: priceMismatch,
      availabilityMismatchesVsStorefront: availMismatch
    },
    landing: {
      wrongProduct: wrongProductLanding,
      wrongVariant: wrongVariantLanding,
      brokenNativePdps: brokenPdp
    },
    images: { brokenPrimaryImages: brokenImages },
    supplementalNativeFeed: {
      eligibleItems: supplementalEligible,
      note: "products.xml — not PRODUCTS SOURCE 2"
    },
    testInternal: {
      testVariants: testVariants.map((t) => t.sku),
      hiddenDuplicates: hiddenDupes
    },
    former32Unresolved: formerOut.slice(1).filter((line) => {
      const cols = line.split(",");
      const status = cols[18]?.replace(/"/g, "") ?? "";
      return status === "MANUAL_REVIEW";
    }).length,
    closureGate: {
      CURRENT_ACTIVE_SHOP_OFFERS: activeShopVariants.length,
      MERCHANT_ELIGIBLE_CTX_PUBLISH: publishRegistry.length,
      NATIVE_FEED_ITEMS_SOURCE2: feedItems.length,
      HISTORICAL_CTX_CONTINUITY_ITEMS: publishRegistry.length,
      NEW_NATIVE_ONLY_ITEMS: nativeOnlyShop.length,
      INTENTIONALLY_EXCLUDED: registry.filter((r) => r.classification === "INTENTIONALLY_EXCLUDE").length,
      TEST_INTERNAL_EXCLUDED: testVariants.length,
      MISSING_FROM_FEED: missingFromFeed,
      DUPLICATE_IDS: dupGids.length,
      ID_CONTINUITY_MISMATCHES: idMismatch,
      PRODUCT_TYPE_MISMATCHES: ptMismatch,
      ITEM_GROUP_MISMATCHES: groupMismatch,
      PRICE_MISMATCHES_VS_CURRENT_SARVEDA: priceMismatch,
      AVAILABILITY_MISMATCHES_VS_CURRENT_SARVEDA: availMismatch,
      WRONG_PRODUCT_LANDINGS: wrongProductLanding,
      WRONG_VARIANT_LANDINGS: wrongVariantLanding,
      BROKEN_NATIVE_PDPs: brokenPdp,
      BROKEN_IMAGES: brokenImages,
      MANUAL_REVIEW_REMAINING: registry.filter((r) => r.classification === "MANUAL_REVIEW").length
    }
  };

  writeFileSync(path.join(OUT, "final_summary.json"), JSON.stringify(summary, null, 2), "utf8");

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
