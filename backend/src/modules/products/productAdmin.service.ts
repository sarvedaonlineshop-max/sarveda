import type { ProductStatus, ProductType } from "@prisma/client";

import { prisma } from "../../config/db";
import { syncProductVariantsToZoho, type ZohoProductSyncResult } from "../zoho/zoho-items";
import { normalizeTaxClass } from "../../utils/tax-class";

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
  hasAudio?: boolean;
  audioUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeyword?: string | null;
  categoryIds?: string[];
  variants?: VariantAdminInput[];
  images?: ImageAdminInput[];
  accordionItems?: AccordionAdminInput[];
};

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

async function syncVariants(productId: string, variants: VariantAdminInput[]): Promise<void> {
  if (variants.length === 0) return;

  const existing = await prisma.productVariant.findMany({ where: { productId } });
  const incomingIds = new Set(variants.filter((v) => v.id).map((v) => v.id!));

  for (const ex of existing) {
    if (!incomingIds.has(ex.id)) {
      await prisma.productVariant.update({
        where: { id: ex.id },
        data: { status: "INACTIVE" }
      });
    }
  }

  const defaultIdx = variants.findIndex((v) => v.isDefault);
  const primaryIdx = defaultIdx >= 0 ? defaultIdx : 0;

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const isDefault = i === primaryIdx;

    if (v.id) {
      const clash = await prisma.productVariant.findFirst({
        where: { sku: v.sku, id: { not: v.id } }
      });
      if (clash) throw httpError(409, `SKU ${v.sku} already in use`, "SKU_EXISTS");

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
          isDefault,
          status: v.status ?? "ACTIVE"
        }
      });

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
          isDefault,
          status: v.status ?? "ACTIVE",
          inventory: { create: { onHand: v.onHand ?? 0 } }
        }
      });

      if (v.shippingRates?.length) {
        await upsertShippingRates(created.id, v.shippingRates);
      }
    }
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

async function syncImages(productId: string, images: ImageAdminInput[]): Promise<void> {
  await prisma.productImage.deleteMany({ where: { productId } });
  if (images.length === 0) return;
  let primaryIdx = images.findIndex((im) => im.isPrimary);
  if (primaryIdx < 0) primaryIdx = 0;
  for (let i = 0; i < images.length; i++) {
    const im = images[i];
    if (!im.url.trim()) continue;
    const variantId = await resolveVariantId(productId, im);
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
  input: ProductAdminSaveInput
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
        hasAudio: input.hasAudio ?? undefined,
        audioUrl: input.audioUrl === "" ? null : input.audioUrl,
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

    if (input.variants) await syncVariants(productId, input.variants);
    if (input.images) await syncImages(productId, input.images);
    if (input.accordionItems) await syncAccordion(productId, input.accordionItems);

    const zohoSync = await syncProductVariantsToZoho(productId);
    return { id: productId, zohoSync };
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
      hasAudio: input.hasAudio ?? false,
      audioUrl: input.audioUrl || undefined,
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

  await syncVariants(product.id, variants);
  if (input.images) await syncImages(product.id, input.images);
  if (input.accordionItems) await syncAccordion(product.id, input.accordionItems);

  const zohoSync = await syncProductVariantsToZoho(product.id);
  return { id: product.id, zohoSync };
}

export async function deleteProductAdmin(id: string): Promise<void> {
  const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw httpError(404, "Product not found", "NOT_FOUND");
  await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), status: "ARCHIVED" }
  });
}
