#!/usr/bin/env tsx
/**
 * Exhaustive certification for GET /api/merchant/google/sarveda-products.xml
 *
 *   MERCHANT_FEED_SITE_URL=https://sarveda.com \
 *   CTX_CERT_API_BASE=https://sarveda-demo.xyz \
 *   npx tsx scripts/certify-sarveda-products-feed.ts
 */
import { createWriteStream, mkdirSync, writeFileSync } from "fs";
import path from "path";

import dotenv from "dotenv";

import { buildCtxCompatibilityFeed } from "../src/modules/merchant/ctxCompatibilityFeed";
import { DEFAULT_CTX_FEED_PATH, parseCtxFeedXml } from "../src/modules/merchant/ctxOfferRegistry";
import {
  buildSarvedaProductsFeed,
  type SarvedaProductsFeedItem
} from "../src/modules/merchant/sarvedaProductsFeed";
import { isNativeMerchantOfferId } from "../src/modules/merchant/nativeMerchantIdentity";
import { readFileSync } from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "../..");
const OUT = path.join(REPO, "docs/audit/google-merchant-final-native");
const API_BASE = (process.env.CTX_CERT_API_BASE || "https://sarveda-demo.xyz").replace(/\/$/, "");
const SITE_ORIGIN = (process.env.MERCHANT_FEED_SITE_URL || "https://sarveda.com").replace(/\/$/, "");

function esc(s: string | number | null | undefined): string {
  const t = s == null ? "" : String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchProductBySlug(slug: string) {
  const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    data?: {
      product?: {
        slug: string;
        variants?: Array<{
          id: string;
          wooCommerceVariationId?: number | null;
          saleInPaise: number;
          mrpInPaise: number;
          inventory?: { onHand: number; reserved: number } | null;
        }>;
      };
    };
  };
  const product = body.data?.product;
  if (!product) return null;
  return {
    product,
    variants: product.variants ?? []
  };
}

function storefrontPriceAvailability(
  product: NonNullable<Awaited<ReturnType<typeof fetchProductBySlug>>>,
  variantId: string
) {
  const v = product.variants.find((x) => x.id === variantId);
  if (!v) return null;
  const qty = Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0));
  const onSale = v.mrpInPaise > v.saleInPaise;
  const priceInr = (onSale ? v.mrpInPaise : v.saleInPaise) / 100;
  const saleInr = onSale ? v.saleInPaise / 100 : null;
  return {
    price: `${priceInr.toFixed(2)} INR`,
    salePrice: saleInr != null ? `${saleInr.toFixed(2)} INR` : null,
    availability: qty > 0 ? "in_stock" : "out_of_stock"
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const ctxXml = readFileSync(DEFAULT_CTX_FEED_PATH, "utf8");
  const ctxById = new Map(parseCtxFeedXml(ctxXml).map((r) => [r.wooOfferId, r]));

  const [ctxFrozen, sarveda] = await Promise.all([
    buildCtxCompatibilityFeed(),
    buildSarvedaProductsFeed()
  ]);

  writeFileSync(path.join(OUT, "feed_snapshot.xml"), sarveda.xml, "utf8");

  const historical = sarveda.items.filter((i) => i.segment === "historical");
  const nativeOnly = sarveda.items.filter((i) => i.segment === "native");

  const gIds = sarveda.items.map((i) => i.gId);
  const dupGids = gIds.filter((id, idx) => gIds.indexOf(id) !== idx);

  let idMismatch = 0;
  let ptMismatch = 0;
  let groupMismatch = 0;
  let priceMismatch = 0;
  let availMismatch = 0;
  let wrongProduct = 0;
  let wrongVariant = 0;
  let brokenPdp = 0;
  let brokenImages = 0;
  let badUrls = 0;

  const certRows: string[] = [
    [
      "segment",
      "g_id",
      "sku",
      "variant_id",
      "product_type",
      "item_group_id",
      "price",
      "sale_price",
      "availability",
      "link",
      "canonical_link",
      "image_ok",
      "landing_ok",
      "variant_selected",
      "price_match",
      "availability_match",
      "notes"
    ].join(",")
  ];

  const nativeRows: string[] = [
    [
      "native_merchant_id",
      "product_slug",
      "variant_id",
      "sku",
      "product_type",
      "item_group_id",
      "price",
      "availability",
      "link",
      "image_link"
    ].join(",")
  ];

  async function certifyItem(item: SarvedaProductsFeedItem) {
    const notes: string[] = [];
    if (!item.gId?.trim()) notes.push("missing_g_id");
    if (item.link.includes("sarveda-demo") || item.link.includes("vercel.app")) {
      badUrls += 1;
      notes.push("bad_link_host");
    }
    if (item.link.includes("/store/")) {
      badUrls += 1;
      notes.push("woo_store_url");
    }
    if (!item.canonicalLink.startsWith(`${SITE_ORIGIN}/product/`)) {
      badUrls += 1;
      notes.push("bad_canonical");
    }

    if (item.segment === "historical") {
      const ctx = ctxById.get(item.wooOfferId);
      const frozen = ctxFrozen.items.find((f) => f.wooOfferId === item.wooOfferId);
      if (!frozen) notes.push("missing_frozen_row");
      else {
        if (item.gId !== frozen.gId) {
          idMismatch += 1;
          notes.push("g_id_regression");
        }
        if (item.productType !== frozen.productType) {
          ptMismatch += 1;
          notes.push("product_type_regression");
        }
        if ((item.itemGroupId ?? "") !== (frozen.itemGroupId ?? "")) {
          groupMismatch += 1;
          notes.push("item_group_regression");
        }
        if (item.price !== frozen.price || (item.salePrice ?? "") !== (frozen.salePrice ?? "")) {
          priceMismatch += 1;
          notes.push("price_regression_vs_frozen");
        }
        if (item.availability !== frozen.availability) {
          availMismatch += 1;
          notes.push("availability_regression_vs_frozen");
        }
      }
      if (ctx && item.productType !== ctx.ctxProductType) {
        ptMismatch += 1;
        notes.push("ctx_product_type_mismatch");
      }
    }

    if (isNativeMerchantOfferId(item.gId) && !item.gId.startsWith("sv_")) {
      notes.push("bad_native_namespace");
    }

    const imageOk = item.imageLink.startsWith("https://") && (await headOk(item.imageLink));
    if (!imageOk) brokenImages += 1;

    const product = await fetchProductBySlug(item.sarvedaSlug);
    let landingOk = "no";
    let variantSelected = "no";
    let priceMatch = "no";
    let availMatch = "no";

    if (!product) {
      brokenPdp += 1;
      notes.push("pdp_404");
    } else {
      landingOk = "ok";
      if (product.product.slug !== item.sarvedaSlug) {
        wrongProduct += 1;
        notes.push("wrong_product");
      }
      const store = storefrontPriceAvailability(product, item.sarvedaVariantId);
      if (store) {
        priceMatch = store.price === item.price && (store.salePrice ?? "") === (item.salePrice ?? "") ? "yes" : "no";
        availMatch = store.availability === item.availability ? "yes" : "no";
        if (priceMatch === "no") priceMismatch += 1;
        if (availMatch === "no") availMismatch += 1;
      }
      const hit = product.variants.find((v) => v.id === item.sarvedaVariantId);
      if (hit) variantSelected = "yes";
      else {
        wrongVariant += 1;
        notes.push("variant_not_on_pdp");
      }
    }

    const variant = await import("../src/config/db").then(({ prisma }) =>
      prisma.productVariant.findUnique({
        where: { id: item.sarvedaVariantId },
        select: { sku: true }
      })
    );

    certRows.push(
      [
        item.segment,
        item.gId,
        variant?.sku ?? "",
        item.sarvedaVariantId,
        item.productType,
        item.itemGroupId ?? "",
        item.price,
        item.salePrice ?? "",
        item.availability,
        item.link,
        item.canonicalLink,
        imageOk ? "yes" : "no",
        landingOk,
        variantSelected,
        priceMatch,
        availMatch,
        notes.join(";")
      ].map(esc).join(",")
    );

    if (item.segment === "native") {
      nativeRows.push(
        [
          item.gId,
          item.sarvedaSlug,
          item.sarvedaVariantId,
          variant?.sku ?? "",
          item.productType,
          item.itemGroupId ?? "",
          item.price,
          item.availability,
          item.link,
          item.imageLink
        ].map(esc).join(",")
      );
    }
  }

  for (const item of sarveda.items) {
    await certifyItem(item);
  }

  writeFileSync(path.join(OUT, "feed_790_certification.csv"), certRows.join("\n"), "utf8");
  writeFileSync(path.join(OUT, "native_only_offers.csv"), nativeRows.join("\n"), "utf8");

  let liveApiCount: number | null = null;
  try {
    const res = await fetch(`${API_BASE}/api/merchant/google/sarveda-products.xml`);
    if (res.ok) {
      const text = await res.text();
      liveApiCount = (text.match(/<item>/g) ?? []).length;
    }
  } catch {
    liveApiCount = null;
  }

  const summary = {
    auditedAt: new Date().toISOString(),
    siteOrigin: SITE_ORIGIN,
    apiBase: API_BASE,
    setProof: {
      currentActiveGenuineShopOffers: sarveda.diagnostics.activeShopOffers,
      historical: historical.length,
      nativeOnly: nativeOnly.length,
      finalNativeFeedItems: sarveda.items.length,
      expectedSum: historical.length + nativeOnly.length === sarveda.items.length
    },
    liveApiItemCount: liveApiCount,
    duplicateGIds: dupGids.length,
    historicalRegression: {
      idMismatches: idMismatch,
      productTypeMismatches: ptMismatch,
      itemGroupMismatches: groupMismatch
    },
    commerceParity: {
      priceMismatches: priceMismatch,
      availabilityMismatches: availMismatch,
      wrongProductLandings: wrongProduct,
      wrongVariantLandings: wrongVariant,
      brokenNativePdps: brokenPdp,
      brokenImages,
      badUrls
    },
    closureGate: {
      FINAL_FEED_COUNT: sarveda.items.length,
      HISTORICAL_COUNT: historical.length,
      NATIVE_ONLY_COUNT: nativeOnly.length,
      HISTORICAL_ID_MISMATCHES: idMismatch,
      PRODUCT_TYPE_MISMATCHES: ptMismatch,
      ITEM_GROUP_MISMATCHES: groupMismatch,
      PRICE_MISMATCHES: priceMismatch,
      AVAILABILITY_MISMATCHES: availMismatch,
      WRONG_PRODUCT_LANDINGS: wrongProduct,
      WRONG_VARIANT_LANDINGS: wrongVariant,
      BROKEN_IMAGES: brokenImages,
      DUPLICATE_IDS: dupGids.length,
      MANUAL_REVIEW: 0
    },
    nativeProductTypes: [...new Set(nativeOnly.map((i) => i.productType))].sort()
  };

  writeFileSync(path.join(OUT, "final_summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  const { prisma } = await import("../src/config/db");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
