/**
 * Final native Sarveda Merchant feed — 764 historical CTX offers + native-only shop supplements.
 * GET /api/merchant/google/sarveda-products.xml
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import {
  shopCatalogProductWhere,
  shopCatalogVariantSkuWhere
} from "../../utils/shop-catalog";
import {
  mapCtxOfferToFeedItem,
  renderCtxCompatibilityRssXml,
  type CtxCompatibilityFeedItem
} from "./ctxCompatibilityFeed";
import { loadPublishableCtxOffers, sellableExclusionReason } from "./ctxOfferRegistry";
import {
  availableQty,
  buildFeedTitle,
  formatMerchantPriceInr,
  merchantFeedAvailability,
  MERCHANT_FEED_BRAND,
  MERCHANT_FEED_CURRENCY,
  MERCHANT_FEED_LANGUAGE,
  normalizeAbsoluteHttpsImageUrl,
  resolveOfferImageUrl,
  resolveMerchantFeedSiteOrigin,
  sanitizeFeedText,
  type MerchantFeedExclusionReason
} from "./googleMerchantFeed";
import {
  buildMerchantCanonicalLink,
  buildNativeMerchantProductLink
} from "./merchantVariantLink";
import {
  nativeMerchantGroupId,
  nativeMerchantOfferId
} from "./nativeMerchantIdentity";

export type SarvedaProductsFeedSegment = "historical" | "native";

export type SarvedaProductsFeedItem = CtxCompatibilityFeedItem & {
  segment: SarvedaProductsFeedSegment;
};

export type SarvedaProductsDiagnostics = {
  activeShopOffers: number;
  historicalItems: number;
  nativeOnlyItems: number;
  totalItems: number;
  siteOrigin: string;
  currency: string;
  language: string;
  nativeExclusions: Record<string, number>;
};

export type SarvedaProductsBuildResult = {
  items: SarvedaProductsFeedItem[];
  diagnostics: SarvedaProductsDiagnostics;
  xml: string;
};

const variantInclude = {
  inventory: true,
  attributeValues: {
    include: { attributeValue: { include: { attribute: true } } }
  },
  images: { orderBy: { position: "asc" as const } },
  productRel: {
    include: {
      images: { orderBy: { position: "asc" as const } },
      categories: { include: { category: true } }
    }
  }
} satisfies Prisma.ProductVariantInclude;

export type ShopFeedVariantRow = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;

type CategoryRow = { id: string; name: string; parentId: string | null };

function collectAdditionalImages(
  variant: ShopFeedVariantRow,
  primaryUrl: string,
  env: NodeJS.ProcessEnv
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>([primaryUrl]);

  const push = (raw: string | null | undefined) => {
    const abs = normalizeAbsoluteHttpsImageUrl(raw, env);
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    urls.push(abs);
  };

  for (const img of variant.images) push(img.url);
  for (const img of variant.productRel.images) {
    if (!img.variantId || img.variantId === variant.id) push(img.url);
  }
  return urls.slice(0, 10);
}

function categoryBreadcrumb(
  categoryId: string,
  byId: Map<string, CategoryRow>
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let cur = byId.get(categoryId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const name = sanitizeFeedText(cur.name, 80);
    if (name) parts.unshift(name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(" > ");
}

/** Deepest category breadcrumb wins (deterministic, stable for Ads filtering). */
export function sarvedaProductTypePath(
  categories: ShopFeedVariantRow["productRel"]["categories"],
  categoryById: Map<string, CategoryRow>
): string | null {
  if (!categories.length) return null;
  let best = "";
  for (const pc of categories) {
    const path = categoryBreadcrumb(pc.categoryId, categoryById);
    if (path.length > best.length) best = path;
  }
  return best || null;
}

export async function loadActiveShopFeedVariants(): Promise<ShopFeedVariantRow[]> {
  return prisma.productVariant.findMany({
    where: {
      ...shopCatalogVariantSkuWhere,
      status: "ACTIVE",
      productRel: { ...shopCatalogProductWhere, status: "ACTIVE" },
      inventory: { isNot: null }
    },
    include: variantInclude,
    orderBy: { sku: "asc" }
  });
}

export function mapNativeShopVariantToFeedItem(
  variant: ShopFeedVariantRow,
  siblingCountOnProduct: number,
  categoryById: Map<string, CategoryRow>,
  siteOrigin: string,
  env: NodeJS.ProcessEnv = process.env
): SarvedaProductsFeedItem | { exclude: MerchantFeedExclusionReason } {
  const exclusion = sellableExclusionReason(variant);
  if (exclusion) return { exclude: exclusion };

  const p = variant.productRel;
  const slug = (p.slug || "").trim();
  if (!slug) return { exclude: "MISSING_SLUG" };

  const labelParts = variant.attributeValues
    .map((av) => av.attributeValue.value?.trim())
    .filter((v): v is string => Boolean(v));

  const title = buildFeedTitle(p.name, p.productType, labelParts);
  if (!title) return { exclude: "MISSING_TITLE" };

  const imageLink = resolveOfferImageUrl(variant, env);
  if (!imageLink) return { exclude: "MISSING_IMAGE" };

  const productType =
    sarvedaProductTypePath(p.categories, categoryById) ||
    sanitizeFeedText(p.name, 150);
  if (!productType) return { exclude: "MISSING_TITLE" };

  const qty = availableQty(variant.inventory?.onHand, variant.inventory?.reserved);
  const availability = merchantFeedAvailability(
    variant.inventory?.onHand,
    variant.inventory?.reserved,
    variant.dropShipEnabled
  );
  const description =
    sanitizeFeedText(p.description, 5000) ||
    sanitizeFeedText(p.shortDescription, 5000) ||
    title;

  const onSale = Number.isInteger(variant.mrpInPaise) && variant.mrpInPaise > variant.saleInPaise;
  const price = onSale
    ? formatMerchantPriceInr(variant.mrpInPaise)
    : formatMerchantPriceInr(variant.saleInPaise);
  const salePrice = onSale ? formatMerchantPriceInr(variant.saleInPaise) : null;

  const emitGroup =
    p.productType === "VARIABLE" || siblingCountOnProduct > 1;
  const itemGroupId = emitGroup ? nativeMerchantGroupId(p.id) : null;

  return {
    segment: "native",
    gId: nativeMerchantOfferId(variant.id),
    itemGroupId,
    title,
    description,
    link: buildNativeMerchantProductLink(siteOrigin, slug, variant.id),
    canonicalLink: buildMerchantCanonicalLink(siteOrigin, slug),
    imageLink,
    additionalImageLinks: collectAdditionalImages(variant, imageLink, env),
    availability,
    condition: "new",
    price,
    salePrice,
    brand: MERCHANT_FEED_BRAND,
    identifierExists: false,
    productType,
    wooOfferId: 0,
    wooParentId: null,
    sarvedaVariantId: variant.id,
    sarvedaSlug: slug,
    saleInPaise: variant.saleInPaise,
    mrpInPaise: variant.mrpInPaise,
    availableQty: qty
  };
}

export function renderSarvedaProductsRssXml(
  items: SarvedaProductsFeedItem[],
  siteOrigin: string
): string {
  return renderCtxCompatibilityRssXml(items, siteOrigin).replace(
    `${MERCHANT_FEED_BRAND} Products (CTX Source 2 Compatibility)`,
    `${MERCHANT_FEED_BRAND} Products (Native Catalog)`
  ).replace(
    `${MERCHANT_FEED_BRAND} Google Merchant CTX compatibility feed`,
    `${MERCHANT_FEED_BRAND} Google Merchant native catalog feed`
  );
}

export async function buildSarvedaProductsFeed(
  env: NodeJS.ProcessEnv = process.env
): Promise<SarvedaProductsBuildResult> {
  const siteOrigin = resolveMerchantFeedSiteOrigin(env);

  const [publishOffers, shopVariants, categories] = await Promise.all([
    loadPublishableCtxOffers(),
    loadActiveShopFeedVariants(),
    prisma.category.findMany({
      select: { id: true, name: true, parentId: true }
    })
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const historicalItems: SarvedaProductsFeedItem[] = [];
  const historicalVariantIds = new Set<string>();

  for (const offer of publishOffers) {
    const mapped = mapCtxOfferToFeedItem(offer, siteOrigin, env);
    if ("exclude" in mapped) continue;
    historicalItems.push({ ...mapped, segment: "historical" });
    historicalVariantIds.add(mapped.sarvedaVariantId);
  }

  historicalItems.sort((a, b) => a.wooOfferId - b.wooOfferId);

  const siblingsByProduct = new Map<string, number>();
  for (const v of shopVariants) {
    siblingsByProduct.set(v.productId, (siblingsByProduct.get(v.productId) ?? 0) + 1);
  }

  const nativeExclusions: Record<string, number> = {};
  const nativeItems: SarvedaProductsFeedItem[] = [];

  for (const variant of shopVariants) {
    if (historicalVariantIds.has(variant.id)) continue;

    const mapped = mapNativeShopVariantToFeedItem(
      variant,
      siblingsByProduct.get(variant.productId) ?? 1,
      categoryById,
      siteOrigin,
      env
    );
    if ("exclude" in mapped) {
      nativeExclusions[mapped.exclude] = (nativeExclusions[mapped.exclude] ?? 0) + 1;
      continue;
    }
    nativeItems.push(mapped);
  }

  nativeItems.sort((a, b) => a.gId.localeCompare(b.gId));

  const items = [...historicalItems, ...nativeItems];

  const diagnostics: SarvedaProductsDiagnostics = {
    activeShopOffers: shopVariants.length,
    historicalItems: historicalItems.length,
    nativeOnlyItems: nativeItems.length,
    totalItems: items.length,
    siteOrigin,
    currency: MERCHANT_FEED_CURRENCY,
    language: MERCHANT_FEED_LANGUAGE,
    nativeExclusions
  };

  return {
    items,
    diagnostics,
    xml: renderSarvedaProductsRssXml(items, siteOrigin)
  };
}
