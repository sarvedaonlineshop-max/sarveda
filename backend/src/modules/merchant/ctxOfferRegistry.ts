/**
 * CTX / PRODUCTS SOURCE 2 offer registry — 883-row accounting + classification.
 */

import { createReadStream, readFileSync, existsSync } from "fs";
import path from "path";
import readline from "readline";

import { MerchantCtxClassification, type Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import type { MappingRow } from "../products/merchantIdentityBackfill";
import {
  type MerchantFeedExclusionReason
} from "./googleMerchantFeed";

export type CtxFeedRow = {
  wooOfferId: number;
  wooParentId: number | null;
  ctxProductType: string;
  ctxItemGroupId: string | null;
  ctxTitle: string;
  ctxLegacyLink: string;
  ctxAvailability: string;
  ctxPrice: string;
  ctxSalePrice: string;
};

export type CtxOfferResolution = {
  wooOfferId: number;
  classification: MerchantCtxClassification;
  excludeReason: string | null;
  manualAction: string | null;
  sarvedaVariantId: string | null;
  notes: string | null;
  sellable: boolean;
  exclusionReason: MerchantFeedExclusionReason | null;
};

/** Ops-locked exclusions — preserved across classifyAllCtxOffers() re-runs. */
export const MANUAL_EXCLUDE_LOCK = "manual_exclude_locked";

/** Ops-locked publish mappings — preserved across classifyAllCtxOffers() re-runs. */
export const MANUAL_MAP_LOCK = "manual_map_locked";

/** Owner confirmation queue — preserved as MANUAL_REVIEW. */
export const OWNER_CONFIRMATION_PENDING = "owner_confirmation_pending";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
export const DEFAULT_CTX_FEED_PATH = path.join(
  REPO_ROOT,
  "docs/audit/google-merchant-native-compatibility/ctx_india_authoritative.xml"
);
const DEFAULT_MAPPING_PATH = path.join(REPO_ROOT, "docs/audit/merchant_woo_sarveda_mapping.tsv");

function parsePositiveInt(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || !/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function extractTag(block: string, tag: string, namespaced = false): string {
  const name = namespaced ? `g:${tag}` : tag;
  const re = new RegExp(`<${name.replace(":", "\\:")}>([\\s\\S]*?)<\\/${name.replace(":", "\\:")}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  return m[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim() ?? "";
}

/** Parse authoritative CTX India RSS/XML feed. */
export function parseCtxFeedXml(xml: string): CtxFeedRow[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const rows: CtxFeedRow[] = [];

  for (const block of items) {
    const gid = parsePositiveInt(extractTag(block, "id", true));
    if (gid == null) continue;
    const groupRaw = extractTag(block, "item_group_id", true);
    const parent = parsePositiveInt(groupRaw);
    rows.push({
      wooOfferId: gid,
      wooParentId: parent,
      ctxProductType: extractTag(block, "product_type", true),
      ctxItemGroupId: groupRaw || null,
      ctxTitle: extractTag(block, "title"),
      ctxLegacyLink: extractTag(block, "link"),
      ctxAvailability: extractTag(block, "availability", true),
      ctxPrice: extractTag(block, "price", true),
      ctxSalePrice: extractTag(block, "sale_price", true)
    });
  }
  return rows;
}

export async function readMappingTsv(filePath = DEFAULT_MAPPING_PATH): Promise<Map<number, MappingRow>> {
  const out = new Map<number, MappingRow>();
  if (!existsSync(filePath)) return out;

  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  let headers: string[] | null = null;
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
    const woo = parsePositiveInt(obj.woo_offer_id);
    if (woo != null) out.set(woo, obj as MappingRow);
  }
  return out;
}

type VariantSellableRow = {
  id: string;
  status: string;
  saleInPaise: number;
  productRel: {
    status: string;
    catalogHidden: boolean;
    deletedAt: Date | null;
    productType: string;
    slug: string;
  };
  inventory: { onHand: number; reserved: number } | null;
};

export function sellableExclusionReason(v: VariantSellableRow): MerchantFeedExclusionReason | null {
  const p = v.productRel;
  if (p.deletedAt) return "DELETED_PRODUCT";
  if (p.catalogHidden) return "CATALOG_HIDDEN";
  if (p.productType === "DIGITAL") return "DIGITAL_PRODUCT";
  if (p.status !== "ACTIVE") return "INACTIVE_PRODUCT";
  if (v.status !== "ACTIVE") return "INACTIVE_VARIANT";
  if (!(p.slug || "").trim()) return "MISSING_SLUG";
  if (!Number.isInteger(v.saleInPaise) || v.saleInPaise <= 0) return "INVALID_PRICE";
  return null;
}

export function resolveCtxItemGroupId(
  ctxItemGroupId: string | null,
  wooOfferId: number,
  wooParentId: number | null,
  productWooId: number | null
): string | null {
  if (ctxItemGroupId) return ctxItemGroupId;
  if (wooParentId != null && wooParentId !== wooOfferId) return String(wooParentId);
  if (productWooId != null && productWooId !== wooOfferId) return String(productWooId);
  return null;
}

/** Deterministic variant resolution — no fuzzy name matching. */
export function resolveVariantIdForOffer(
  wooOfferId: number,
  byWooOffer: Map<number, string>,
  byRegistryVariant: string | null | undefined,
  mapping: MappingRow | undefined
): { variantId: string | null; via: string } {
  const fromWoo = byWooOffer.get(wooOfferId);
  if (fromWoo) return { variantId: fromWoo, via: "wooCommerceVariationId" };

  if (byRegistryVariant) return { variantId: byRegistryVariant, via: "registry" };

  if (!mapping) return { variantId: null, via: "none" };

  const conf = (mapping.match_confidence || "").toLowerCase();
  const vid = (mapping.sarveda_variant_id || "").trim();
  if (!vid) return { variantId: null, via: "none" };

  if (conf === "high") return { variantId: vid, via: "mapping_high" };

  if (conf === "medium" && mapping.match_method === "parent_plus_attr_values") {
    return { variantId: vid, via: "mapping_medium_attrs" };
  }

  if (conf === "medium" && mapping.match_method === "parent_plus_attributes") {
    return { variantId: vid, via: "mapping_medium_parent_attrs" };
  }

  if (conf === "medium" && mapping.sarveda_variant_id) {
    return { variantId: vid, via: "mapping_medium" };
  }

  return { variantId: null, via: "none" };
}

export async function upsertRegistryFromCtxRows(rows: CtxFeedRow[]): Promise<number> {
  let n = 0;
  for (const row of rows) {
    await prisma.merchantCtxOffer.upsert({
      where: { wooOfferId: row.wooOfferId },
      create: {
        wooOfferId: row.wooOfferId,
        wooParentId: row.wooParentId,
        ctxProductType: row.ctxProductType,
        ctxItemGroupId: row.ctxItemGroupId,
        ctxTitle: row.ctxTitle,
        ctxLegacyLink: row.ctxLegacyLink,
        classification: MerchantCtxClassification.MANUAL_REVIEW
      },
      update: {
        wooParentId: row.wooParentId,
        ctxProductType: row.ctxProductType,
        ctxItemGroupId: row.ctxItemGroupId,
        ctxTitle: row.ctxTitle,
        ctxLegacyLink: row.ctxLegacyLink
      }
    });
    n += 1;
  }
  return n;
}

/** Classify every registry row; updates DB classification fields. */
export async function classifyAllCtxOffers(): Promise<{
  resolutions: CtxOfferResolution[];
  counts: Record<MerchantCtxClassification, number>;
}> {
  const [registry, variants, mappingByOffer] = await Promise.all([
    prisma.merchantCtxOffer.findMany({ orderBy: { wooOfferId: "asc" } }),
    prisma.productVariant.findMany({
      select: {
        id: true,
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
    }),
    readMappingTsv()
  ]);

  const byWooOffer = new Map<number, string>();
  const variantById = new Map<string, (typeof variants)[number]>();
  for (const v of variants) {
    variantById.set(v.id, v);
    if (v.wooCommerceVariationId != null) {
      byWooOffer.set(v.wooCommerceVariationId, v.id);
    }
  }

  const resolutions: CtxOfferResolution[] = [];
  const counts: Record<MerchantCtxClassification, number> = {
    PUBLISH: 0,
    INTENTIONALLY_EXCLUDE: 0,
    MANUAL_REVIEW: 0
  };
  const claimedVariantIds = new Map<string, number>();

  for (const reg of registry) {
    if (
      reg.manualAction === OWNER_CONFIRMATION_PENDING &&
      reg.classification === MerchantCtxClassification.MANUAL_REVIEW
    ) {
      counts[MerchantCtxClassification.MANUAL_REVIEW] += 1;
      resolutions.push({
        wooOfferId: reg.wooOfferId,
        classification: MerchantCtxClassification.MANUAL_REVIEW,
        excludeReason: reg.excludeReason,
        manualAction: reg.manualAction,
        sarvedaVariantId: reg.sarvedaVariantId,
        notes: reg.notes,
        sellable: false,
        exclusionReason: null
      });
      continue;
    }

    if (
      reg.manualAction === MANUAL_MAP_LOCK &&
      reg.classification === MerchantCtxClassification.PUBLISH &&
      reg.sarvedaVariantId
    ) {
      const variant = variantById.get(reg.sarvedaVariantId);
      const exclusionReason = variant
        ? sellableExclusionReason(variant as VariantSellableRow)
        : null;
      if (variant && !exclusionReason) {
        counts[MerchantCtxClassification.PUBLISH] += 1;
        resolutions.push({
          wooOfferId: reg.wooOfferId,
          classification: MerchantCtxClassification.PUBLISH,
          excludeReason: null,
          manualAction: reg.manualAction,
          sarvedaVariantId: reg.sarvedaVariantId,
          notes: reg.notes,
          sellable: true,
          exclusionReason: null
        });
        continue;
      }
    }

    if (
      reg.manualAction === MANUAL_EXCLUDE_LOCK &&
      reg.classification === MerchantCtxClassification.INTENTIONALLY_EXCLUDE
    ) {
      counts[MerchantCtxClassification.INTENTIONALLY_EXCLUDE] += 1;
      resolutions.push({
        wooOfferId: reg.wooOfferId,
        classification: MerchantCtxClassification.INTENTIONALLY_EXCLUDE,
        excludeReason: reg.excludeReason,
        manualAction: reg.manualAction,
        sarvedaVariantId: reg.sarvedaVariantId,
        notes: reg.notes,
        sellable: false,
        exclusionReason: null
      });
      continue;
    }

    const mapping = mappingByOffer.get(reg.wooOfferId);
    const resolved = resolveVariantIdForOffer(
      reg.wooOfferId,
      byWooOffer,
      reg.sarvedaVariantId,
      mapping
    );

    let classification: MerchantCtxClassification = MerchantCtxClassification.MANUAL_REVIEW;
    let excludeReason: string | null = null;
    let manualAction: string | null = null;
    let notes: string | null = null;
    let sellable = false;
    let exclusionReason: MerchantFeedExclusionReason | null = null;

    const variant = resolved.variantId ? variantById.get(resolved.variantId) : undefined;

    if (!variant) {
      if (!mapping) {
        classification = MerchantCtxClassification.MANUAL_REVIEW;
        excludeReason = "NO_MAPPING_AUDIT_ROW";
        manualAction = "verify_woo_offer_exists_in_sarveda_import";
        notes = "CTX offer absent from merchant_woo_sarveda_mapping.tsv";
      } else if ((mapping.match_confidence || "").toLowerCase() === "unmatched") {
        classification = MerchantCtxClassification.MANUAL_REVIEW;
        excludeReason = "UNMAPPED_WOO_OFFER";
        manualAction = "create_or_link_variant";
        notes = mapping.notes || mapping.match_method;
      } else if ((mapping.match_confidence || "").toLowerCase() === "ambiguous") {
        classification = MerchantCtxClassification.MANUAL_REVIEW;
        excludeReason = "AMBIGUOUS_MAPPING";
        manualAction = "manual_reconcile";
      } else {
        classification = MerchantCtxClassification.MANUAL_REVIEW;
        excludeReason = "NO_NATIVE_VARIANT";
        manualAction = "create_or_link_variant";
        notes = `mapping ${mapping.match_confidence}/${mapping.match_method} without resolvable variant`;
      }
    } else {
      exclusionReason = sellableExclusionReason(variant as VariantSellableRow);
      if (exclusionReason) {
        classification = MerchantCtxClassification.INTENTIONALLY_EXCLUDE;
        excludeReason = exclusionReason;
        notes = `Resolved via ${resolved.via}`;
      } else {
        classification = MerchantCtxClassification.PUBLISH;
        sellable = true;
        notes = `Resolved via ${resolved.via}`;
      }
    }

    const linkedVariantId = variant?.id ?? null;

    if (
      linkedVariantId &&
      claimedVariantIds.has(linkedVariantId) &&
      claimedVariantIds.get(linkedVariantId) !== reg.wooOfferId
    ) {
      classification = MerchantCtxClassification.MANUAL_REVIEW;
      excludeReason = "DUPLICATE_VARIANT_LINK";
      manualAction = "manual_reconcile";
      notes = `Variant ${linkedVariantId} already linked to wooOfferId ${claimedVariantIds.get(linkedVariantId)}`;
      sellable = false;
      exclusionReason = null;
      counts[classification] += 1;
      await prisma.merchantCtxOffer.update({
        where: { wooOfferId: reg.wooOfferId },
        data: {
          classification,
          excludeReason,
          manualAction,
          notes,
          sarvedaVariantId: null
        }
      });
      resolutions.push({
        wooOfferId: reg.wooOfferId,
        classification,
        excludeReason,
        manualAction,
        sarvedaVariantId: null,
        notes,
        sellable: false,
        exclusionReason: null
      });
      continue;
    }

    if (linkedVariantId) {
      claimedVariantIds.set(linkedVariantId, reg.wooOfferId);
    }

    await prisma.merchantCtxOffer.update({
      where: { wooOfferId: reg.wooOfferId },
      data: {
        classification,
        excludeReason,
        manualAction,
        notes,
        sarvedaVariantId: linkedVariantId
      }
    });

    counts[classification] += 1;

    resolutions.push({
      wooOfferId: reg.wooOfferId,
      classification,
      excludeReason,
      manualAction,
      sarvedaVariantId: linkedVariantId,
      notes,
      sellable,
      exclusionReason
    });
  }

  return { resolutions, counts };
}

export async function importCtxFeedFromFile(
  filePath = DEFAULT_CTX_FEED_PATH
): Promise<{ imported: number; classified: Record<MerchantCtxClassification, number> }> {
  if (!existsSync(filePath)) {
    throw new Error(`CTX feed not found: ${filePath}`);
  }
  const xml = readFileSync(filePath, "utf8");
  const rows = parseCtxFeedXml(xml);
  if (rows.length !== 883) {
    throw new Error(`Expected 883 CTX rows, parsed ${rows.length}`);
  }
  const imported = await upsertRegistryFromCtxRows(rows);
  const { counts } = await classifyAllCtxOffers();
  return { imported, classified: counts };
}

export type PublishableCtxOffer = Prisma.MerchantCtxOfferGetPayload<{
  include: {
    sarvedaVariant: {
      include: {
        inventory: true;
        attributeValues: {
          include: { attributeValue: { include: { attribute: true } } };
        };
        images: true;
        productRel: {
          include: {
            images: true;
            categories: { include: { category: true } };
          };
        };
      };
    };
  };
}>;

export async function loadPublishableCtxOffers(): Promise<PublishableCtxOffer[]> {
  return prisma.merchantCtxOffer.findMany({
    where: { classification: MerchantCtxClassification.PUBLISH },
    orderBy: { wooOfferId: "asc" },
    include: {
      sarvedaVariant: {
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
          }
        }
      }
    }
  });
}
