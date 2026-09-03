import type { ProductStatus, ProductType } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { normalizeTaxClass } from "../../utils/tax-class";
import { syncVariantAttributes, type VariantAttributeInput } from "./variant-attributes";

/** Zoho retired — retained shape for admin API compatibility only. */
export type ZohoProductSyncResult = {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

const ZOHO_RETIRED_SYNC: ZohoProductSyncResult = {
  ok: true,
  created: 0,
  updated: 0,
  skipped: 0,
  errors: []
};

function httpError(status: number, message: string, code: string): Error {
  const err = new Error(message) as Error & {
    status: number;
    statusCode: number;
    code: string;
  };
  err.status = status;
  err.statusCode = status;
  err.code = code;
  return err;
}

const SHIPPING_ZONES = ["IN", "US", "GB", "OTHER"] as const;

export type ShippingRateInput = {
  country: string;
  standardPerProduct: number;
  standardAdditional: number;
  codPerProduct?: number | null;
  codAdditional?: number | null;
  estimatedDays?: string | null;
};

export type VariantAdminInput = {
  id?: string;
  sku: string;
  mrpInPaise: number;
  saleInPaise: number;
  mrpUsdCents?: number | null;
  saleUsdCents?: number | null;
  mrpGbpPence?: number | null;
  saleGbpPence?: number | null;
  weightGrams?: number | null;
  isDefault?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  onHand?: number;
  shippingRates?: ShippingRateInput[];
  videoUrl?: string | null;
  audioUrl?: string | null;
  attributes?: VariantAttributeInput[];
  images?: ImageAdminInput[];
};

export type ImageAdminInput = {
  id?: string;
  url: string;
  altText?: string | null;
  position?: number;
  isPrimary?: boolean;
  variantId?: string | null;
  variantSku?: string | null;
};

export type AccordionAdminInput = {
  id?: string;
  title: string;
  content: string;
  position?: number;
};

export type ProductAdminSaveInput = {
  slug: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  productType: ProductType;
  status?: ProductStatus;
  taxClass?: string | null;
  hsnCode?: string | null;
  hasAudio?: boolean;
  audioUrl?: string | null;
  videoUrl?: string | null;
  expressShippingEnabled?: boolean;
  productCouponEnabled?: boolean;
  relatedArticleSlugs?: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeyword?: string | null;
  categoryIds?: string[];
  variantAxisOrder?: string[];
  variantOptionValueOrder?: Record<string, string[]>;
  variants?: VariantAdminInput[];
  /** Explicit soft-deletes only — omission from `variants` never deactivates. */
  deactivateVariantIds?: string[];
  images?: ImageAdminInput[];
  accordionItems?: AccordionAdminInput[];
};

export type ProductAdminSaveOptions = {
  actorId?: string | null;
};

function logVariantStatusTransition(opts: {
  variantId: string;
  productId: string;
  oldStatus: string;
  newStatus: string;
  actorId?: string | null;
  reason: string;
  action: string;
}): void {
  logger.info("variant_status_transition", {
    variantId: opts.variantId,
    productId: opts.productId,
    oldStatus: opts.oldStatus,
    newStatus: opts.newStatus,
    actorId: opts.actorId ?? null,
    reason: opts.reason,
    action: opts.action,
    timestamp: new Date().toISOString()
  });
}

async function upsertShippingRates(variantId: string, rates: ShippingRateInput[]): Promise<void> {
  for (const zone of SHIPPING_ZONES) {
    const row = rates.find((r) => r.country.toUpperCase() === zone);
    if (!row) continue;
    const country = zone;
    await prisma.variantShippingRate.upsert({
      where: { variantId_country: { variantId, country } },
      create: {
        variantId,
        country,
        standardPerProduct: row.standardPerProduct,
        standardAdditional: row.standardAdditional,
        expeditedPerProduct: row.standardPerProduct,
        expeditedAdditional: row.standardAdditional,
        codPerProduct: row.codPerProduct ?? null,
        codAdditional: row.codAdditional ?? null,
        estimatedDays: row.estimatedDays ?? null
      },
      update: {
        standardPerProduct: row.standardPerProduct,
        standardAdditional: row.standardAdditional,
        expeditedPerProduct: row.standardPerProduct,
        expeditedAdditional: row.standardAdditional,
        codPerProduct: row.codPerProduct ?? null,
        codAdditional: row.codAdditional ?? null,
        estimatedDays: row.estimatedDays ?? null
      }
    });
  }
}

/**
 * Upsert variants present in the payload.
 * Existing variants omitted from the payload are LEFT UNCHANGED (including status).
 * Soft-deactivation is only via `applyExplicitVariantDeactivations`.
 */
async function syncVariants(
  productId: string,
  variants: VariantAdminInput[],
  opts?: ProductAdminSaveOptions
): Promise<Map<string, string>> {
  const idBySku = new Map<string, string>();
  if (variants.length === 0) return idBySku;

  const existingById = new Map(
    (await prisma.productVariant.findMany({ where: { productId } })).map((v) => [v.id, v])
  );
  const incomingIds = new Set(variants.filter((v) => v.id).map((v) => v.id!));

  for (const id of incomingIds) {
    if (!existingById.has(id)) {
      throw httpError(400, `Variant ${id} does not belong to this product`, "VARIANT_NOT_ON_PRODUCT");
    }
  }

  const defaultIdx = variants.findIndex((v) => v.isDefault);
  const primaryIdx = defaultIdx >= 0 ? defaultIdx : 0;

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const isDefault = i === primaryIdx;
    const videoUrl = v.videoUrl === "" ? null : v.videoUrl ?? null;
    const audioUrl = v.audioUrl === undefined ? undefined : v.audioUrl === "" ? null : v.audioUrl;

    if (v.id) {
      const clash = await prisma.productVariant.findFirst({
        where: { sku: v.sku, id: { not: v.id } }
      });
      if (clash) throw httpError(409, `SKU ${v.sku} already in use`, "SKU_EXISTS");

      const prior = existingById.get(v.id)!;
      const nextStatus = v.status !== undefined ? v.status : undefined;

      await prisma.productVariant.update({
        where: { id: v.id },
        data: {
          sku: v.sku,
          mrpInPaise: v.mrpInPaise,
          saleInPaise: v.saleInPaise,
          mrpUsdCents: v.mrpUsdCents ?? null,
          saleUsdCents: v.saleUsdCents ?? null,
          mrpGbpPence: v.mrpGbpPence ?? null,
          saleGbpPence: v.saleGbpPence ?? null,
          weightGrams: v.weightGrams ?? null,
          videoUrl,
          ...(audioUrl !== undefined ? { audioUrl } : {}),
          isDefault,
          ...(nextStatus !== undefined ? { status: nextStatus } : {})
        }
      });

      if (nextStatus !== undefined && nextStatus !== prior.status) {
        logVariantStatusTransition({
          variantId: v.id,
          productId,
          oldStatus: prior.status,
          newStatus: nextStatus,
          actorId: opts?.actorId,
          reason: "explicit_status_field",
          action: "variant.status"
        });
      }

      if (v.onHand != null) {
        await prisma.inventory.upsert({
          where: { variantId: v.id },
          create: { variantId: v.id, onHand: v.onHand },
          update: { onHand: v.onHand }
        });
      }

      if (v.shippingRates?.length) {
        await upsertShippingRates(v.id, v.shippingRates);
      }

      if (v.attributes) {
        await syncVariantAttributes(v.id, v.attributes);
      }

      idBySku.set(v.sku.trim(), v.id);
    } else {
      const clash = await prisma.productVariant.findUnique({ where: { sku: v.sku } });
      if (clash) throw httpError(409, `SKU ${v.sku} already in use`, "SKU_EXISTS");

      const created = await prisma.productVariant.create({
        data: {
          productId,
          sku: v.sku,
          mrpInPaise: v.mrpInPaise,
          saleInPaise: v.saleInPaise,
          mrpUsdCents: v.mrpUsdCents ?? null,
          saleUsdCents: v.saleUsdCents ?? null,
          mrpGbpPence: v.mrpGbpPence ?? null,
          saleGbpPence: v.saleGbpPence ?? null,
          weightGrams: v.weightGrams ?? null,
          videoUrl,
          audioUrl: audioUrl ?? null,
          isDefault,
          status: v.status ?? "ACTIVE",
          inventory: { create: { onHand: v.onHand ?? 0 } }
        }
      });

      if (v.shippingRates?.length) {
        await upsertShippingRates(created.id, v.shippingRates);
      }

      if (v.attributes) {
        await syncVariantAttributes(created.id, v.attributes);
      }

      idBySku.set(v.sku.trim(), created.id);
    }
  }

  // Keep a single default: clear isDefault on rows not in this payload when payload sets one.
  if (incomingIds.size > 0 && variants.some((v) => v.isDefault)) {
    await prisma.productVariant.updateMany({
      where: { productId, isDefault: true, id: { notIn: [...incomingIds] } },
      data: { isDefault: false }
    });
  }

  return idBySku;
}

/** Explicit soft-delete only. Omitted / empty list → no status changes. */
export async function applyExplicitVariantDeactivations(
  productId: string,
  deactivateVariantIds: string[] | undefined,
  opts?: ProductAdminSaveOptions
): Promise<void> {
  if (!deactivateVariantIds?.length) return;

  const unique = [...new Set(deactivateVariantIds.filter(Boolean))];
  if (!unique.length) return;

  const belonging = await prisma.productVariant.findMany({
    where: { productId, id: { in: unique } },
    select: { id: true, status: true }
  });
  const found = new Set(belonging.map((b) => b.id));
  for (const id of unique) {
    if (!found.has(id)) {
      throw httpError(
        400,
        `Variant ${id} does not belong to this product`,
        "VARIANT_NOT_ON_PRODUCT"
      );
    }
  }

  for (const row of belonging) {
    if (row.status === "INACTIVE") continue;
    await prisma.productVariant.update({
      where: { id: row.id },
      data: { status: "INACTIVE", isDefault: false }
    });
    logVariantStatusTransition({
      variantId: row.id,
      productId,
      oldStatus: row.status,
      newStatus: "INACTIVE",
      actorId: opts?.actorId,
      reason: "explicit_deactivate",
      action: "deactivateVariantIds"
    });
  }
}

async function resolveVariantId(
  productId: string,
  im: ImageAdminInput
): Promise<string | null> {
  if (im.variantId) {
    const v = await prisma.productVariant.findFirst({
      where: { id: im.variantId, productId }
    });
    return v?.id ?? null;
  }
  if (im.variantSku?.trim()) {
    const v = await prisma.productVariant.findFirst({
      where: { productId, sku: im.variantSku.trim() }
    });
    return v?.id ?? null;
  }
  return null;
}

async function syncImages(
  productId: string,
  images: ImageAdminInput[],
  idBySku: Map<string, string>
): Promise<void> {
  await prisma.productImage.deleteMany({ where: { productId } });
  if (images.length === 0) return;
  let primaryIdx = images.findIndex((im) => im.isPrimary);
  if (primaryIdx < 0) primaryIdx = 0;
  for (let i = 0; i < images.length; i++) {
    const im = images[i];
    if (!im.url.trim()) continue;
    let variantId = await resolveVariantId(productId, im);
    if (!variantId && im.variantSku?.trim()) {
      variantId = idBySku.get(im.variantSku.trim()) ?? null;
    }
    await prisma.productImage.create({
      data: {
        productId,
        variantId,
        url: im.url.trim(),
        altText: im.altText?.trim() || null,
        position: im.position ?? i,
        isPrimary: i === primaryIdx
      }
    });
  }
}

function flattenVariantImages(
  variants: VariantAdminInput[] | undefined,
  idBySku: Map<string, string>
): ImageAdminInput[] {
  if (!variants?.length) return [];
  const out: ImageAdminInput[] = [];
  for (const v of variants) {
    if (!v.images?.length) continue;
    const variantId = v.id ?? idBySku.get(v.sku.trim()) ?? null;
    for (const im of v.images) {
      if (!im.url.trim()) continue;
      out.push({
        ...im,
        variantId: variantId ?? im.variantId ?? null,
        variantSku: variantId ? null : v.sku.trim()
      });
    }
  }
  return out;
}

async function syncAccordion(productId: string, items: AccordionAdminInput[]): Promise<void> {
  await prisma.accordionItem.deleteMany({ where: { productId } });
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (!a.title.trim()) continue;
    await prisma.accordionItem.create({
      data: {
        productId,
        title: a.title.trim(),
        content: a.content,
        position: a.position ?? i
      }
    });
  }
}

export async function saveProductAdmin(
  productId: string | null,
  input: ProductAdminSaveInput,
  opts?: ProductAdminSaveOptions
): Promise<{ id: string; zohoSync?: ZohoProductSyncResult }> {
  if (productId) {
    const existing = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!existing) throw httpError(404, "Product not found", "NOT_FOUND");

    if (input.slug !== existing.slug) {
      const clash = await prisma.product.findUnique({ where: { slug: input.slug } });
      if (clash) throw httpError(409, "Slug already in use", "SLUG_EXISTS");
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description ?? undefined,
        shortDescription: input.shortDescription ?? undefined,
        productType: input.productType,
        status: input.status ?? existing.status,
        taxClass: input.taxClass !== undefined ? normalizeTaxClass(input.taxClass) : undefined,
        hsnCode: input.hsnCode !== undefined ? input.hsnCode?.trim() || null : undefined,
        hasAudio: input.hasAudio ?? undefined,
        audioUrl: input.audioUrl === "" ? null : input.audioUrl,
        videoUrl: input.videoUrl === "" ? null : input.videoUrl,
        expressShippingEnabled: input.expressShippingEnabled ?? undefined,
        productCouponEnabled: input.productCouponEnabled ?? undefined,
        relatedArticleSlugs: input.relatedArticleSlugs ?? undefined,
        variantAxisOrder: input.variantAxisOrder ?? undefined,
        variantOptionValueOrder: input.variantOptionValueOrder ?? undefined,
        seoTitle: input.seoTitle ?? undefined,
        seoDescription: input.seoDescription ?? undefined,
        seoKeyword: input.seoKeyword ?? undefined,
        categories: input.categoryIds
          ? {
              deleteMany: {},
              create: input.categoryIds.map((categoryId) => ({ categoryId }))
            }
          : undefined
      }
    });

    const idBySku = input.variants
      ? await syncVariants(productId, input.variants, opts)
      : new Map<string, string>();
    await applyExplicitVariantDeactivations(productId, input.deactivateVariantIds, opts);
    if (input.images || input.variants?.some((v) => v.images?.length)) {
      const merged = [
        ...(input.images ?? []),
        ...flattenVariantImages(input.variants, idBySku)
      ];
      await syncImages(productId, merged, idBySku);
    }
    if (input.accordionItems) await syncAccordion(productId, input.accordionItems);

    return { id: productId, zohoSync: ZOHO_RETIRED_SYNC };
  }

  const clash = await prisma.product.findUnique({ where: { slug: input.slug } });
  if (clash) throw httpError(409, "Slug already in use", "SLUG_EXISTS");

  const product = await prisma.product.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: input.description ?? undefined,
      shortDescription: input.shortDescription ?? undefined,
      productType: input.productType,
      status: input.status ?? "DRAFT",
      taxClass: normalizeTaxClass(input.taxClass ?? "standard"),
      hsnCode: input.hsnCode?.trim() || null,
      hasAudio: input.hasAudio ?? false,
      audioUrl: input.audioUrl || undefined,
      videoUrl: input.videoUrl || undefined,
      expressShippingEnabled: input.expressShippingEnabled ?? true,
      productCouponEnabled: input.productCouponEnabled ?? false,
      relatedArticleSlugs: input.relatedArticleSlugs ?? [],
      variantAxisOrder: input.variantAxisOrder ?? [],
      variantOptionValueOrder: input.variantOptionValueOrder ?? {},
      seoTitle: input.seoTitle ?? undefined,
      seoDescription: input.seoDescription ?? undefined,
      seoKeyword: input.seoKeyword ?? undefined,
      categories: input.categoryIds?.length
        ? { create: input.categoryIds.map((categoryId) => ({ categoryId })) }
        : undefined
    }
  });

  const variants =
    input.variants?.length ?
      input.variants
    : [
        {
          sku: `${input.slug}-default`.slice(0, 120),
          mrpInPaise: 0,
          saleInPaise: 0,
          isDefault: true,
          onHand: 0,
          shippingRates: SHIPPING_ZONES.map((country) => ({
            country,
            standardPerProduct: 0,
            standardAdditional: 0
          }))
        }
      ];

  const idBySku = await syncVariants(product.id, variants, opts);
  await applyExplicitVariantDeactivations(product.id, input.deactivateVariantIds, opts);
  if (input.images || input.variants?.some((v) => v.images?.length)) {
    const merged = [
      ...(input.images ?? []),
      ...flattenVariantImages(input.variants, idBySku)
    ];
    await syncImages(product.id, merged, idBySku);
  }
  if (input.accordionItems) await syncAccordion(product.id, input.accordionItems);

  return { id: product.id, zohoSync: ZOHO_RETIRED_SYNC };
}

export async function deleteProductAdmin(id: string): Promise<void> {
  const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw httpError(404, "Product not found", "NOT_FOUND");
  await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), status: "ARCHIVED" }
  });
}
