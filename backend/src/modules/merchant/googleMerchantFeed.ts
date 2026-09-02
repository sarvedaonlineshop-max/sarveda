/**
 * Native Google Merchant RSS/XML feed (File URL) — V1 historical identity only.
 *
 * Eligibility: ProductVariant.wooCommerceVariationId IS NOT NULL + sellable catalog rules.
 * g:id = gla_<wooCommerceVariationId> (never UUID/SKU).
 * Variables: g:item_group_id = Product.wooCommerceId
 * Simples: omit item_group_id
 *
 * Shipping: left to Merchant Center account settings (not per-item).
 * Brand: constant "Sarveda" (no brand column in schema).
 * GTIN/MPN: not in schema → identifier_exists=no
 */

import { Prisma, type ProductType } from "@prisma/client";

import { prisma } from "../../config/db";
import { merchantFeedAvailability } from "../inventory/variant-fulfillment-availability";
import { merchantIdFromWooOfferId } from "../products/merchantIdentityBackfill";

export const MERCHANT_FEED_BRAND = "Sarveda";
export const MERCHANT_FEED_CURRENCY = "INR";
export const MERCHANT_FEED_LANGUAGE = "en";

export type MerchantFeedExclusionReason =
  | "NULL_IDENTITY"
  | "INACTIVE_PRODUCT"
  | "INACTIVE_VARIANT"
  | "CATALOG_HIDDEN"
  | "DIGITAL_PRODUCT"
  | "DELETED_PRODUCT"
  | "MISSING_SLUG"
  | "INVALID_PRICE"
  | "MISSING_IMAGE"
  | "MISSING_TITLE"
  | "VARIABLE_MISSING_PARENT_WOO_ID";

export type MerchantFeedItem = {
  gId: string;
  itemGroupId: string | null;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  availability: "in_stock" | "out_of_stock";
  condition: "new";
  price: string;
  salePrice: string | null;
  brand: string;
  identifierExists: false;
  sku: string;
  color: string | null;
  size: string | null;
  productType: string | null;
  wooOfferId: number;
  wooParentId: number | null;
  productTypeEnum: ProductType;
  productSlug: string;
  saleInPaise: number;
  mrpInPaise: number;
  availableQty: number;
};

export type MerchantFeedDiagnostics = {
  totalVariants: number;
  historicalIdentityVariants: number;
  eligibleItems: number;
  excludedNullIdentity: number;
  excludedInactiveProduct: number;
  excludedInactiveVariant: number;
  excludedCatalogHidden: number;
  excludedDigital: number;
  excludedDeleted: number;
  excludedMissingSlug: number;
  excludedInvalidPrice: number;
  excludedMissingImage: number;
  excludedMissingTitle: number;
  excludedVariableMissingParent: number;
  variableItems: number;
  simpleItems: number;
  inStock: number;
  outOfStock: number;
  siteOrigin: string;
  currency: string;
  language: string;
};

export type MerchantFeedBuildResult = {
  items: MerchantFeedItem[];
  diagnostics: MerchantFeedDiagnostics;
  xml: string;
};

type VariantFeedRow = {
  id: string;
  sku: string;
  status: string;
  saleInPaise: number;
  mrpInPaise: number;
  wooCommerceVariationId: number;
  dropShipEnabled?: boolean;
  productId: string;
  inventory: { onHand: number; reserved: number } | null;
  attributeValues: Array<{
    attributeValue: {
      value: string;
      attribute: { name: string; slug: string };
    };
  }>;
  images: Array<{ url: string; isPrimary: boolean; position: number }>;
  productRel: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    status: string;
    productType: ProductType;
    catalogHidden: boolean;
    deletedAt: Date | null;
    wooCommerceId: number | null;
    images: Array<{
      url: string;
      isPrimary: boolean;
      position: number;
      variantId: string | null;
    }>;
    categories: Array<{ category: { name: string; slug: string; parentId: string | null } }>;
  };
};

/** XML text escape (never concatenate raw DB strings into XML). */
export function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Strip HTML + control chars for g:description / titles. */
export function sanitizeFeedText(raw: string | null | undefined, maxLen = 5000): string {
  if (!raw) return "";
  let s = String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

/**
 * Canonical feed site origin.
 * Prefer MERCHANT_FEED_SITE_URL, then NEXT_PUBLIC_SITE_URL, then first FRONTEND_URL.
 * Does not hardcode sarveda.com (staging-safe).
 */
export function resolveMerchantFeedSiteOrigin(
  env: NodeJS.ProcessEnv = process.env
): string {
  const explicit = (env.MERCHANT_FEED_SITE_URL || "").trim();
  const nextPublic = (env.NEXT_PUBLIC_SITE_URL || "").trim();
  const frontendPrimary = (env.FRONTEND_URL || "").split(",")[0]?.trim() || "";
  const raw = explicit || nextPublic || frontendPrimary;
  if (!raw) {
    throw new Error("Merchant feed site origin not configured (MERCHANT_FEED_SITE_URL / NEXT_PUBLIC_SITE_URL / FRONTEND_URL)");
  }
  let origin: string;
  try {
    origin = new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
  } catch {
    throw new Error(`Invalid merchant feed site origin: ${raw}`);
  }
  if (!origin.startsWith("https://") && env.NODE_ENV === "production") {
    throw new Error("Merchant feed origin must be https in production");
  }
  return origin.replace(/\/$/, "");
}

export function formatMerchantPriceInr(paise: number): string {
  if (!Number.isInteger(paise) || paise <= 0) {
    throw new Error(`Invalid price paise: ${paise}`);
  }
  const major = paise / 100;
  return `${major.toFixed(2)} ${MERCHANT_FEED_CURRENCY}`;
}

export function availableQty(onHand: number | null | undefined, reserved: number | null | undefined): number {
  return Math.max(0, (onHand ?? 0) - (reserved ?? 0));
}

export { merchantFeedAvailability };

export function normalizeAbsoluteHttpsImageUrl(
  raw: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return t.replace(/^http:\/\//i, "https://");
  if (t.startsWith("//")) return `https:${t}`;
  const cdn = (env.AWS_CLOUDFRONT_URL || env.NEXT_PUBLIC_MEDIA_CDN_URL || "").replace(/\/$/, "");
  if (cdn && t.startsWith("/")) return `${cdn}${t}`;
  if (cdn && !t.includes("://")) return `${cdn}/${t.replace(/^\//, "")}`;
  return null;
}

function attrMap(
  attributeValues: VariantFeedRow["attributeValues"]
): { color: string | null; size: string | null; labelParts: string[] } {
  const labelParts: string[] = [];
  let color: string | null = null;
  let size: string | null = null;
  const sorted = [...attributeValues].sort((a, b) =>
    a.attributeValue.attribute.slug.localeCompare(b.attributeValue.attribute.slug)
  );
  for (const av of sorted) {
    const name = av.attributeValue.attribute.name;
    const slug = av.attributeValue.attribute.slug.toLowerCase();
    const value = av.attributeValue.value?.trim();
    if (!value) continue;
    labelParts.push(value);
    if (!color && (slug === "color" || slug === "colour" || slug.includes("color") || slug.includes("colour"))) {
      color = value;
    }
    if (!size && (slug === "size" || slug.includes("size"))) {
      size = value;
    }
    // ignore unused name for now (material/pattern not forced)
    void name;
  }
  return { color, size, labelParts };
}

export function buildFeedTitle(productName: string, productType: ProductType, labelParts: string[]): string {
  const base = sanitizeFeedText(productName, 150);
  if (!base) return "";
  if (productType !== "VARIABLE" || labelParts.length === 0) return base;
  const suffix = sanitizeFeedText(labelParts.join(" / "), 80);
  if (!suffix) return base;
  const lower = base.toLowerCase();
  if (suffix.split(" / ").every((p) => lower.includes(p.toLowerCase()))) return base;
  const combined = `${base} - ${suffix}`;
  return combined.length > 150 ? combined.slice(0, 150).trim() : combined;
}

export function resolveOfferImageUrl(
  variant: Pick<VariantFeedRow, "images" | "productRel">,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const variantSorted = [...variant.images].sort((a, b) => a.position - b.position);
  const variantPrimary = variantSorted.find((i) => i.isPrimary)?.url ?? variantSorted[0]?.url;
  if (variantPrimary) {
    const abs = normalizeAbsoluteHttpsImageUrl(variantPrimary, env);
    if (abs) return abs;
  }
  const shared = variant.productRel.images
    .filter((i) => !i.variantId)
    .sort((a, b) => a.position - b.position);
  const primaryShared = shared.find((i) => i.isPrimary)?.url ?? shared[0]?.url;
  if (primaryShared) {
    const abs = normalizeAbsoluteHttpsImageUrl(primaryShared, env);
    if (abs) return abs;
  }
  const any = [...variant.productRel.images].sort((a, b) => a.position - b.position)[0]?.url;
  return normalizeAbsoluteHttpsImageUrl(any, env);
}

export function productTypePath(
  categories: VariantFeedRow["productRel"]["categories"]
): string | null {
  if (!categories.length) return null;
  // Prefer leaf category name; join lightly for g:product_type (not google taxonomy id)
  const names = categories
    .map((c) => sanitizeFeedText(c.category.name, 80))
    .filter(Boolean);
  if (!names.length) return null;
  return names.slice(0, 3).join(" > ");
}

export type ExcludeEvent = {
  variantId: string;
  sku: string;
  reason: MerchantFeedExclusionReason;
};

/**
 * Pure eligibility + item mapping for a loaded variant row.
 * Returns item or exclusion reason.
 */
export function mapVariantToFeedItem(
  v: VariantFeedRow,
  siteOrigin: string,
  env: NodeJS.ProcessEnv = process.env
): { item: MerchantFeedItem } | { exclude: MerchantFeedExclusionReason } {
  const p = v.productRel;
  if (p.deletedAt) return { exclude: "DELETED_PRODUCT" };
  if (p.catalogHidden) return { exclude: "CATALOG_HIDDEN" };
  if (p.productType === "DIGITAL") return { exclude: "DIGITAL_PRODUCT" };
  if (p.status !== "ACTIVE") return { exclude: "INACTIVE_PRODUCT" };
  if (v.status !== "ACTIVE") return { exclude: "INACTIVE_VARIANT" };
  if (!v.wooCommerceVariationId) return { exclude: "NULL_IDENTITY" };

  const slug = (p.slug || "").trim();
  if (!slug) return { exclude: "MISSING_SLUG" };

  if (!Number.isInteger(v.saleInPaise) || v.saleInPaise <= 0) {
    return { exclude: "INVALID_PRICE" };
  }

  const attrs = attrMap(v.attributeValues);
  const title = buildFeedTitle(p.name, p.productType, attrs.labelParts);
  if (!title) return { exclude: "MISSING_TITLE" };

  const imageLink = resolveOfferImageUrl(v, env);
  if (!imageLink) return { exclude: "MISSING_IMAGE" };

  const isVariableType = p.productType === "VARIABLE";
  if (isVariableType && (p.wooCommerceId == null || p.wooCommerceId <= 0)) {
    return { exclude: "VARIABLE_MISSING_PARENT_WOO_ID" };
  }

  // Historical Merchant grouping: emit item_group_id when parent Woo id differs from
  // offer id (true variations), even if Sarveda productType was later stored as SIMPLE.
  const emitItemGroup =
    p.wooCommerceId != null &&
    p.wooCommerceId > 0 &&
    p.wooCommerceId !== v.wooCommerceVariationId;

  const qty = availableQty(v.inventory?.onHand, v.inventory?.reserved);
  const availability = merchantFeedAvailability(
    v.inventory?.onHand,
    v.inventory?.reserved,
    v.dropShipEnabled
  );
  const description =
    sanitizeFeedText(p.description, 5000) ||
    sanitizeFeedText(p.shortDescription, 5000) ||
    title;

  const onSale = Number.isInteger(v.mrpInPaise) && v.mrpInPaise > v.saleInPaise;
  const price = onSale ? formatMerchantPriceInr(v.mrpInPaise) : formatMerchantPriceInr(v.saleInPaise);
  const salePrice = onSale ? formatMerchantPriceInr(v.saleInPaise) : null;

  const link = `${siteOrigin.replace(/\/$/, "")}/product/${encodeURIComponent(slug)}`;

  return {
    item: {
      gId: merchantIdFromWooOfferId(v.wooCommerceVariationId),
      itemGroupId: emitItemGroup ? String(p.wooCommerceId) : null,
      title,
      description,
      link,
      imageLink,
      availability,
      condition: "new",
      price,
      salePrice,
      brand: MERCHANT_FEED_BRAND,
      identifierExists: false,
      sku: v.sku,
      color: attrs.color,
      size: attrs.size,
      productType: productTypePath(p.categories),
      wooOfferId: v.wooCommerceVariationId,
      wooParentId: p.wooCommerceId,
      productTypeEnum: p.productType,
      productSlug: slug,
      saleInPaise: v.saleInPaise,
      mrpInPaise: v.mrpInPaise,
      availableQty: qty
    }
  };
}

export function renderGoogleMerchantRssXml(items: MerchantFeedItem[], siteOrigin: string): string {
  const channelLink = escapeXml(siteOrigin.replace(/\/$/, ""));
  const itemXml = items
    .map((it) => {
      const lines: string[] = [
        "    <item>",
        `      <g:id>${escapeXml(it.gId)}</g:id>`,
        `      <title>${escapeXml(it.title)}</title>`,
        `      <description>${escapeXml(it.description)}</description>`,
        `      <link>${escapeXml(it.link)}</link>`,
        `      <g:image_link>${escapeXml(it.imageLink)}</g:image_link>`,
        `      <g:availability>${escapeXml(it.availability)}</g:availability>`,
        `      <g:condition>${escapeXml(it.condition)}</g:condition>`,
        `      <g:price>${escapeXml(it.price)}</g:price>`
      ];
      if (it.salePrice) {
        lines.push(`      <g:sale_price>${escapeXml(it.salePrice)}</g:sale_price>`);
      }
      if (it.itemGroupId) {
        lines.push(`      <g:item_group_id>${escapeXml(it.itemGroupId)}</g:item_group_id>`);
      }
      lines.push(`      <g:brand>${escapeXml(it.brand)}</g:brand>`);
      lines.push(`      <g:identifier_exists>no</g:identifier_exists>`);
      if (it.color) lines.push(`      <g:color>${escapeXml(it.color)}</g:color>`);
      if (it.size) lines.push(`      <g:size>${escapeXml(it.size)}</g:size>`);
      if (it.productType) lines.push(`      <g:product_type>${escapeXml(it.productType)}</g:product_type>`);
      lines.push("    </item>");
      return lines.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(`${MERCHANT_FEED_BRAND} Products`)}</title>
    <link>${channelLink}</link>
    <description>${escapeXml(`${MERCHANT_FEED_BRAND} Google Merchant product feed (native V1)`)}</description>
${itemXml}
  </channel>
</rss>
`;
}

const variantSelect = {
  id: true,
  sku: true,
  status: true,
  saleInPaise: true,
  mrpInPaise: true,
  wooCommerceVariationId: true,
  productId: true,
  inventory: { select: { onHand: true, reserved: true } },
  attributeValues: {
    select: {
      attributeValue: {
        select: {
          value: true,
          attribute: { select: { name: true, slug: true } }
        }
      }
    }
  },
  images: {
    select: { url: true, isPrimary: true, position: true },
    orderBy: [{ position: "asc" as const }]
  },
  productRel: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      shortDescription: true,
      status: true,
      productType: true,
      catalogHidden: true,
      deletedAt: true,
      wooCommerceId: true,
      images: {
        select: { url: true, isPrimary: true, position: true, variantId: true },
        orderBy: [{ position: "asc" as const }]
      },
      categories: {
        select: {
          category: { select: { name: true, slug: true, parentId: true } }
        }
      }
    }
  }
} satisfies Prisma.ProductVariantSelect;

export async function loadHistoricalIdentityVariants(): Promise<VariantFeedRow[]> {
  const rows = await prisma.productVariant.findMany({
    where: { wooCommerceVariationId: { not: null } },
    select: variantSelect,
    orderBy: [
      { productRel: { wooCommerceId: "asc" } },
      { wooCommerceVariationId: "asc" }
    ]
  });
  // Prisma types wooCommerceVariationId as number | null; filter narrows
  return rows.filter((r) => r.wooCommerceVariationId != null) as VariantFeedRow[];
}

export async function buildGoogleMerchantFeed(
  env: NodeJS.ProcessEnv = process.env
): Promise<MerchantFeedBuildResult> {
  const siteOrigin = resolveMerchantFeedSiteOrigin(env);
  const totalVariants = await prisma.productVariant.count();
  const historicalIdentityVariants = await prisma.productVariant.count({
    where: { wooCommerceVariationId: { not: null } }
  });

  const rows = await loadHistoricalIdentityVariants();
  const items: MerchantFeedItem[] = [];
  const diag: MerchantFeedDiagnostics = {
    totalVariants,
    historicalIdentityVariants,
    eligibleItems: 0,
    excludedNullIdentity: Math.max(0, totalVariants - historicalIdentityVariants),
    excludedInactiveProduct: 0,
    excludedInactiveVariant: 0,
    excludedCatalogHidden: 0,
    excludedDigital: 0,
    excludedDeleted: 0,
    excludedMissingSlug: 0,
    excludedInvalidPrice: 0,
    excludedMissingImage: 0,
    excludedMissingTitle: 0,
    excludedVariableMissingParent: 0,
    variableItems: 0,
    simpleItems: 0,
    inStock: 0,
    outOfStock: 0,
    siteOrigin,
    currency: MERCHANT_FEED_CURRENCY,
    language: MERCHANT_FEED_LANGUAGE
  };

  const bump = (reason: MerchantFeedExclusionReason) => {
    switch (reason) {
      case "INACTIVE_PRODUCT":
        diag.excludedInactiveProduct += 1;
        break;
      case "INACTIVE_VARIANT":
        diag.excludedInactiveVariant += 1;
        break;
      case "CATALOG_HIDDEN":
        diag.excludedCatalogHidden += 1;
        break;
      case "DIGITAL_PRODUCT":
        diag.excludedDigital += 1;
        break;
      case "DELETED_PRODUCT":
        diag.excludedDeleted += 1;
        break;
      case "MISSING_SLUG":
        diag.excludedMissingSlug += 1;
        break;
      case "INVALID_PRICE":
        diag.excludedInvalidPrice += 1;
        break;
      case "MISSING_IMAGE":
        diag.excludedMissingImage += 1;
        break;
      case "MISSING_TITLE":
        diag.excludedMissingTitle += 1;
        break;
      case "VARIABLE_MISSING_PARENT_WOO_ID":
        diag.excludedVariableMissingParent += 1;
        break;
      case "NULL_IDENTITY":
        diag.excludedNullIdentity += 1;
        break;
      default:
        break;
    }
  };

  for (const row of rows) {
    const mapped = mapVariantToFeedItem(row, siteOrigin, env);
    if ("exclude" in mapped) {
      bump(mapped.exclude);
      continue;
    }
    items.push(mapped.item);
  }

  // Deterministic sort (already ordered from query; re-sort for safety)
  items.sort((a, b) => {
    const pa = a.wooParentId ?? 0;
    const pb = b.wooParentId ?? 0;
    if (pa !== pb) return pa - pb;
    return a.wooOfferId - b.wooOfferId;
  });

  diag.eligibleItems = items.length;
  for (const it of items) {
    if (it.itemGroupId) diag.variableItems += 1;
    else diag.simpleItems += 1;
    if (it.availability === "in_stock") diag.inStock += 1;
    else diag.outOfStock += 1;
  }

  const xml = renderGoogleMerchantRssXml(items, siteOrigin);
  return { items, diagnostics: diag, xml };
}

/** Continuity vs backfill artifact rows. */
export function validateFeedHistoricalContinuity(
  items: MerchantFeedItem[],
  backfilled: Array<{
    woo_offer_id: string;
    woo_parent_id: string;
    merchant_id: string;
  }>
): {
  exactIdMatches: number;
  idMismatches: Array<{ expected: string; got: string }>;
  itemGroupExact: number;
  itemGroupMismatches: Array<{ gId: string; expected: string; got: string | null }>;
  missingFromFeed: number;
  unexpectedInFeed: number;
} {
  const byOffer = new Map(items.map((i) => [i.wooOfferId, i]));
  const backfillOffers = new Set(backfilled.map((b) => Number(b.woo_offer_id)));
  let exactIdMatches = 0;
  const idMismatches: Array<{ expected: string; got: string }> = [];
  let itemGroupExact = 0;
  const itemGroupMismatches: Array<{ gId: string; expected: string; got: string | null }> = [];
  let missingFromFeed = 0;

  for (const b of backfilled) {
    const offerId = Number(b.woo_offer_id);
    const item = byOffer.get(offerId);
    if (!item) {
      // May be excluded for inactive/image/price — count separately as missing
      missingFromFeed += 1;
      continue;
    }
    if (item.gId === b.merchant_id) exactIdMatches += 1;
    else idMismatches.push({ expected: b.merchant_id, got: item.gId });

    // Variable grouping: when parent != offer, expect item_group_id
    const parent = Number(b.woo_parent_id);
    if (parent && parent !== offerId) {
      const expectedGroup = String(parent);
      if (item.itemGroupId === expectedGroup) itemGroupExact += 1;
      else
        itemGroupMismatches.push({
          gId: item.gId,
          expected: expectedGroup,
          got: item.itemGroupId
        });
    }
  }

  let unexpectedInFeed = 0;
  for (const it of items) {
    if (!backfillOffers.has(it.wooOfferId)) unexpectedInFeed += 1;
  }

  return {
    exactIdMatches,
    idMismatches,
    itemGroupExact,
    itemGroupMismatches,
    missingFromFeed,
    unexpectedInFeed
  };
}
