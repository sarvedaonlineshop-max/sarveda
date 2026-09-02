/**
 * CTX / PRODUCTS SOURCE 2 compatibility feed.
 *
 * Preserves historical numeric g:id, CTX product_type, item_group_id semantics.
 * Price / availability from current Sarveda catalog (storefront authority).
 */

import { MerchantCtxClassification } from "@prisma/client";

import { prisma } from "../../config/db";
import {
  MERCHANT_FEED_BRAND,
  MERCHANT_FEED_CURRENCY,
  MERCHANT_FEED_LANGUAGE,
  availableQty,
  merchantFeedAvailability,
  buildFeedTitle,
  escapeXml,
  formatMerchantPriceInr,
  normalizeAbsoluteHttpsImageUrl,
  resolveOfferImageUrl,
  resolveMerchantFeedSiteOrigin,
  sanitizeFeedText,
  type MerchantFeedExclusionReason
} from "./googleMerchantFeed";
import {
  classifyAllCtxOffers,
  loadPublishableCtxOffers,
  parseCtxFeedXml,
  readMappingTsv,
  resolveVariantIdForOffer,
  sellableExclusionReason,
  type CtxFeedRow,
  type PublishableCtxOffer
} from "./ctxOfferRegistry";
import {
  buildMerchantCanonicalLink,
  buildMerchantProductLink,
  ctxFeedItemGroupId
} from "./merchantVariantLink";

export type CtxCompatibilityFeedItem = {
  gId: string;
  itemGroupId: string | null;
  title: string;
  description: string;
  link: string;
  canonicalLink: string;
  imageLink: string;
  additionalImageLinks: string[];
  availability: "in_stock" | "out_of_stock";
  condition: "new";
  price: string;
  salePrice: string | null;
  brand: string;
  identifierExists: false;
  productType: string;
  wooOfferId: number;
  wooParentId: number | null;
  sarvedaVariantId: string;
  sarvedaSlug: string;
  saleInPaise: number;
  mrpInPaise: number;
  availableQty: number;
};

export type CtxCompatibilityDiagnostics = {
  registryTotal: number;
  publishedItems: number;
  publishClassification: number;
  intentionallyExcluded: number;
  manualReview: number;
  siteOrigin: string;
  currency: string;
  language: string;
};

export type CtxCompatibilityBuildResult = {
  items: CtxCompatibilityFeedItem[];
  diagnostics: CtxCompatibilityDiagnostics;
  xml: string;
};

type VariantBundle = NonNullable<PublishableCtxOffer["sarvedaVariant"]>;

function collectAdditionalImages(
  variant: VariantBundle,
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

export function mapCtxOfferToFeedItem(
  offer: PublishableCtxOffer,
  siteOrigin: string,
  env: NodeJS.ProcessEnv = process.env
): CtxCompatibilityFeedItem | { exclude: MerchantFeedExclusionReason } {
  const variant = offer.sarvedaVariant;
  if (!variant) return { exclude: "NULL_IDENTITY" };

  const exclusion = sellableExclusionReason({
    id: variant.id,
    status: variant.status,
    saleInPaise: variant.saleInPaise,
    productRel: variant.productRel,
    inventory: variant.inventory
  });
  if (exclusion) return { exclude: exclusion };

  const p = variant.productRel;
  const slug = (p.slug || "").trim();
  if (!slug) return { exclude: "MISSING_SLUG" };

  const labelParts = variant.attributeValues
    .map((av) => av.attributeValue.value?.trim())
    .filter((v): v is string => Boolean(v));

  const title =
    sanitizeFeedText(offer.ctxTitle, 150) ||
    buildFeedTitle(p.name, p.productType, labelParts);
  if (!title) return { exclude: "MISSING_TITLE" };

  const imageLink = resolveOfferImageUrl(
    {
      images: variant.images,
      productRel: p
    },
    env
  );
  if (!imageLink) return { exclude: "MISSING_IMAGE" };

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

  const groupId =
    offer.ctxItemGroupId ??
    ctxFeedItemGroupId(null, offer.wooOfferId, offer.wooParentId, p.wooCommerceId);

  return {
    gId: String(offer.wooOfferId),
    itemGroupId: groupId,
    title,
    description,
    link: buildMerchantProductLink(siteOrigin, slug, offer.wooOfferId),
    canonicalLink: buildMerchantCanonicalLink(siteOrigin, slug),
    imageLink,
    additionalImageLinks: collectAdditionalImages(variant, imageLink, env),
    availability,
    condition: "new",
    price,
    salePrice,
    brand: MERCHANT_FEED_BRAND,
    identifierExists: false,
    productType: offer.ctxProductType,
    wooOfferId: offer.wooOfferId,
    wooParentId: offer.wooParentId,
    sarvedaVariantId: variant.id,
    sarvedaSlug: slug,
    saleInPaise: variant.saleInPaise,
    mrpInPaise: variant.mrpInPaise,
    availableQty: qty
  };
}

export function renderCtxCompatibilityRssXml(
  items: CtxCompatibilityFeedItem[],
  siteOrigin: string
): string {
  const channelLink = escapeXml(siteOrigin.replace(/\/$/, ""));
  const itemXml = items
    .map((it) => {
      const lines: string[] = [
        "    <item>",
        `      <g:id>${escapeXml(it.gId)}</g:id>`,
        `      <title>${escapeXml(it.title)}</title>`,
        `      <description>${escapeXml(it.description)}</description>`,
        `      <link>${escapeXml(it.link)}</link>`,
        `      <g:canonical_link>${escapeXml(it.canonicalLink)}</g:canonical_link>`,
        `      <g:image_link>${escapeXml(it.imageLink)}</g:image_link>`
      ];
      for (const url of it.additionalImageLinks) {
        lines.push(`      <g:additional_image_link>${escapeXml(url)}</g:additional_image_link>`);
      }
      lines.push(`      <g:availability>${escapeXml(it.availability)}</g:availability>`);
      lines.push(`      <g:condition>${escapeXml(it.condition)}</g:condition>`);
      lines.push(`      <g:price>${escapeXml(it.price)}</g:price>`);
      if (it.salePrice) {
        lines.push(`      <g:sale_price>${escapeXml(it.salePrice)}</g:sale_price>`);
      }
      if (it.itemGroupId) {
        lines.push(`      <g:item_group_id>${escapeXml(it.itemGroupId)}</g:item_group_id>`);
      }
      lines.push(`      <g:brand>${escapeXml(it.brand)}</g:brand>`);
      lines.push(`      <g:identifier_exists>no</g:identifier_exists>`);
      lines.push(`      <g:product_type>${escapeXml(it.productType)}</g:product_type>`);
      lines.push("    </item>");
      return lines.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(`${MERCHANT_FEED_BRAND} Products (CTX Source 2 Compatibility)`)}</title>
    <link>${channelLink}</link>
    <description>${escapeXml(`${MERCHANT_FEED_BRAND} Google Merchant CTX compatibility feed`)}</description>
${itemXml}
  </channel>
</rss>
`;
}

export async function buildCtxCompatibilityFeed(
  env: NodeJS.ProcessEnv = process.env
): Promise<CtxCompatibilityBuildResult> {
  const siteOrigin = resolveMerchantFeedSiteOrigin(env);

  const [registryCounts, publishOffers] = await Promise.all([
    prisma.merchantCtxOffer.groupBy({
      by: ["classification"],
      _count: { _all: true }
    }),
    loadPublishableCtxOffers()
  ]);

  const countMap: Record<MerchantCtxClassification, number> = {
    PUBLISH: 0,
    INTENTIONALLY_EXCLUDE: 0,
    MANUAL_REVIEW: 0
  };
  let registryTotal = 0;
  for (const row of registryCounts) {
    countMap[row.classification] = row._count._all;
    registryTotal += row._count._all;
  }

  const items: CtxCompatibilityFeedItem[] = [];
  for (const offer of publishOffers) {
    const mapped = mapCtxOfferToFeedItem(offer, siteOrigin, env);
    if ("exclude" in mapped) continue;
    items.push(mapped);
  }

  items.sort((a, b) => a.wooOfferId - b.wooOfferId);

  const diagnostics: CtxCompatibilityDiagnostics = {
    registryTotal,
    publishedItems: items.length,
    publishClassification: countMap.PUBLISH,
    intentionallyExcluded: countMap.INTENTIONALLY_EXCLUDE,
    manualReview: countMap.MANUAL_REVIEW,
    siteOrigin,
    currency: MERCHANT_FEED_CURRENCY,
    language: MERCHANT_FEED_LANGUAGE
  };

  return {
    items,
    diagnostics,
    xml: renderCtxCompatibilityRssXml(items, siteOrigin)
  };
}

/** In-memory certification row for all 883 CTX offers (no DB required). */
export async function buildInMemoryCtxCertificationRows(
  ctxRows: CtxFeedRow[],
  env: NodeJS.ProcessEnv = process.env
): Promise<
  Array<{
    legacy: CtxFeedRow;
    classification: MerchantCtxClassification;
    publishStatus: string;
    reason: string | null;
    manualAction: string | null;
    native: CtxCompatibilityFeedItem | null;
    sarvedaVariantId: string | null;
    sarvedaSlug: string | null;
  }>
> {
  const siteOrigin = resolveMerchantFeedSiteOrigin(env);
  const [variants, mappingByOffer] = await Promise.all([
    prisma.productVariant.findMany({
      include: {
        inventory: true,
        attributeValues: {
          include: { attributeValue: { include: { attribute: true } } }
        },
        images: { orderBy: { position: "asc" } },
        productRel: {
          include: {
            images: { orderBy: { position: "asc" } },
            categories: { include: { category: true } }
          }
        },
        merchantCtxOffer: true
      }
    }),
    readMappingTsv()
  ]);

  const byWooOffer = new Map<number, (typeof variants)[0]>();
  const byId = new Map<string, (typeof variants)[0]>();
  for (const v of variants) {
    byId.set(v.id, v);
    if (v.wooCommerceVariationId != null) byWooOffer.set(v.wooCommerceVariationId, v);
  }

  const out: Array<{
    legacy: CtxFeedRow;
    classification: MerchantCtxClassification;
    publishStatus: string;
    reason: string | null;
    manualAction: string | null;
    native: CtxCompatibilityFeedItem | null;
    sarvedaVariantId: string | null;
    sarvedaSlug: string | null;
  }> = [];

  for (const legacy of ctxRows) {
    const mapping = mappingByOffer.get(legacy.wooOfferId);
    const resolved = resolveVariantIdForOffer(
      legacy.wooOfferId,
      new Map(
        [...byWooOffer.entries()].map(([k, v]) => [k, v.id] as [number, string])
      ),
      null,
      mapping
    );
    const variant = resolved.variantId ? byId.get(resolved.variantId) : undefined;

    let classification: MerchantCtxClassification = MerchantCtxClassification.MANUAL_REVIEW;
    let reason: string | null = null;
    let manualAction: string | null = null;

    if (!variant) {
      if (!mapping) {
        reason = "NO_MAPPING_AUDIT_ROW";
        manualAction = "verify_woo_offer_exists_in_sarveda_import";
      } else if ((mapping.match_confidence || "").toLowerCase() === "unmatched") {
        reason = "UNMAPPED_WOO_OFFER";
        manualAction = "create_or_link_variant";
      } else {
        reason = "NO_NATIVE_VARIANT";
        manualAction = "create_or_link_variant";
      }
    } else {
      const ex = sellableExclusionReason(variant);
      if (ex) {
        classification = MerchantCtxClassification.INTENTIONALLY_EXCLUDE;
        reason = ex;
      } else {
        classification = MerchantCtxClassification.PUBLISH;
      }
    }

    let native: CtxCompatibilityFeedItem | null = null;
    if (classification === MerchantCtxClassification.PUBLISH && variant) {
      const pseudoOffer: PublishableCtxOffer = {
        wooOfferId: legacy.wooOfferId,
        wooParentId: legacy.wooParentId,
        ctxProductType: legacy.ctxProductType,
        ctxItemGroupId: legacy.ctxItemGroupId,
        ctxTitle: legacy.ctxTitle,
        ctxLegacyLink: legacy.ctxLegacyLink,
        classification,
        excludeReason: null,
        manualAction: null,
        sarvedaVariantId: variant.id,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        sarvedaVariant: variant
      };
      const mapped = mapCtxOfferToFeedItem(pseudoOffer, siteOrigin, env);
      native = "exclude" in mapped ? null : mapped;
    }

    out.push({
      legacy,
      classification,
      publishStatus:
        classification === MerchantCtxClassification.PUBLISH ? "PUBLISH" : classification,
      reason,
      manualAction,
      native,
      sarvedaVariantId: variant?.id ?? null,
      sarvedaSlug: variant?.productRel.slug ?? null
    });
  }

  return out;
}

export { classifyAllCtxOffers, importCtxFeedFromFile } from "./ctxOfferRegistry";
export { parseCtxFeedXml } from "./ctxOfferRegistry";
