import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ProductStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { subscribeStockNotification } from "../stock-notifications/stockNotification.service";

import { buildCatalogGapsReport } from "../admin/catalogGaps.service";
import { deleteProductAdmin, saveProductAdmin } from "./productAdmin.service";
import {
  listXlSheetRows,
  saveXlSheetRows,
  xlSheetSaveSchema
} from "./productXlSheet.service";
import {
  getProductAdminById,
  getProductBySlug,
  listProductSitemapEntries,
  listProducts,
  listProductsAdmin,
  listRelatedProducts,
  reorderProducts,
  suggestProducts
} from "./products.service";
import type { CreateProductBody, ReorderProductsBody, UpdateProductBody } from "./schemas";
import type { ProductAdminSaveInput } from "./productAdmin.service";

const productStatuses: ProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

export async function adminList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const categorySlug =
      typeof req.query.category === "string" ? req.query.category : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      rawStatus && productStatuses.includes(rawStatus as ProductStatus)
        ? (rawStatus as ProductStatus)
        : undefined;

    const data = await listProductsAdmin({
      page: Number.isFinite(page) ? page : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      categorySlug,
      q,
      status
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function adminGetOne(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const product = await getProductAdminById(id);
    res.json({ success: true, data: { product } });
  } catch (err) {
    next(err);
  }
}

export async function adminReorder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as ReorderProductsBody;
    const data = await reorderProducts({
      categorySlug: body.categorySlug,
      orderedIds: body.orderedIds
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function suggest(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const items = await suggestProducts(q);
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const categorySlug =
      typeof req.query.category === "string" ? req.query.category : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      rawStatus && productStatuses.includes(rawStatus as ProductStatus)
        ? (rawStatus as ProductStatus)
        : undefined;

    const data = await listProducts({
      page: Number.isFinite(page) ? page : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      categorySlug,
      q,
      status
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function sitemapEntries(_req: Request, res: Response, next: NextFunction) {
  try {
    const entries = await listProductSitemapEntries();
    res.json({ success: true, data: { entries } });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;
    const product = await getProductBySlug(slug);
    res.json({ success: true, data: { product } });
  } catch (err) {
    next(err);
  }
}

export async function related(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 4;
    const data = await listRelatedProducts(slug, Number.isFinite(limit) ? limit : 4);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

const NotifyStockSchema = z.object({
  email: z.string().email().max(320).optional(),
  variantId: z.string().uuid().optional().nullable()
});

export async function notifyStock(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;
    const body = NotifyStockSchema.parse(req.body ?? {});
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true }
    });
    if (!product) {
      res.status(404).json({ success: false, error: "Product not found", code: "NOT_FOUND" });
      return;
    }

    const email = body.email?.trim().toLowerCase() || req.authUser?.email;
    if (!email) {
      res.status(400).json({
        success: false,
        error: "Enter your email to get notified when this item is back in stock.",
        code: "EMAIL_REQUIRED"
      });
      return;
    }

    const result = await subscribeStockNotification({
      productId: product.id,
      variantId: body.variantId ?? null,
      email,
      userId: req.authUser?.id ?? null
    });

    res.json({
      success: true,
      data: {
        subscribed: true,
        alreadySubscribed: !result.created,
        message: result.created
          ? "We will email you when this item is back in stock."
          : "You are already on the notify list for this item."
      }
    });
  } catch (err) {
    next(err);
  }
}

function normalizeAdminBody(body: CreateProductBody | UpdateProductBody): ProductAdminSaveInput {
  return {
    slug: body.slug!,
    name: body.name!,
    description: body.description,
    shortDescription: body.shortDescription,
    productType: body.productType!,
    status: body.status,
    taxClass: body.taxClass,
    hsnCode: body.hsnCode === undefined ? undefined : body.hsnCode?.trim() || null,
    hasAudio: body.hasAudio,
    audioUrl: body.audioUrl === undefined ? undefined : body.audioUrl || null,
    videoUrl: body.videoUrl === undefined ? undefined : body.videoUrl || null,
    expressShippingEnabled: body.expressShippingEnabled,
    relatedArticleSlugs: body.relatedArticleSlugs,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    seoKeyword: body.seoKeyword,
    categoryIds: body.categoryIds,
    variantAxisOrder: body.variantAxisOrder,
    variants: body.variants,
    images: body.images,
    accordionItems: body.accordionItems
  };
}

export async function catalogGaps(_req: Request, res: Response, next: NextFunction) {
  try {
    const report = await buildCatalogGapsReport();
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/products/xl-sheet — Aug-9 style Name / Variant / SKU + HSN */
export async function xlSheetList(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listXlSheetRows();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/products/xl-sheet — save edits back to Product + ProductVariant */
export async function xlSheetSave(req: Request, res: Response, next: NextFunction) {
  try {
    const body = xlSheetSaveSchema.parse(req.body);
    const data = await saveXlSheetRows(body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

const checkSkusBodySchema = z.object({
  skus: z.array(z.string().min(1).max(120)).min(1).max(200),
  /** When editing, ignore variants that already belong to this product. */
  excludeProductId: z.string().uuid().optional()
});

/** POST /api/admin/products/check-skus — which SKUs are already taken. */
export async function checkSkus(req: Request, res: Response, next: NextFunction) {
  try {
    const body = checkSkusBodySchema.parse(req.body);
    const normalized = Array.from(
      new Set(body.skus.map((s) => s.trim()).filter(Boolean))
    );
    if (normalized.length === 0) {
      res.json({ success: true, data: { taken: [] as string[] } });
      return;
    }

    const rows = await prisma.productVariant.findMany({
      where: {
        ...(body.excludeProductId
          ? { productId: { not: body.excludeProductId } }
          : {}),
        OR: normalized.map((s) => ({
          sku: { equals: s, mode: "insensitive" as const }
        }))
      },
      select: { sku: true }
    });

    const takenUpper = new Set(rows.map((r) => r.sku.toUpperCase()));
    const takenRequested = normalized.filter((s) => takenUpper.has(s.toUpperCase()));

    res.json({ success: true, data: { taken: takenRequested } });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as CreateProductBody;
    const { id, zohoSync } = await saveProductAdmin(null, normalizeAdminBody(body));
    const product = await getProductAdminById(id);
    res.status(201).json({ success: true, data: { product, zohoSync } });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = req.body as UpdateProductBody;
    const existing = await getProductAdminById(id);
    const merged: ProductAdminSaveInput = {
      slug: body.slug ?? existing.slug,
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      shortDescription:
        body.shortDescription !== undefined ? body.shortDescription : existing.shortDescription,
      productType: body.productType ?? existing.productType,
      status: body.status ?? existing.status,
      taxClass: body.taxClass !== undefined ? body.taxClass : existing.taxClass,
      hsnCode: body.hsnCode !== undefined ? body.hsnCode?.trim() || null : existing.hsnCode,
      hasAudio: body.hasAudio ?? existing.hasAudio,
      audioUrl: body.audioUrl === undefined ? existing.audioUrl : body.audioUrl || null,
      videoUrl:
        body.videoUrl === undefined
          ? (existing as { videoUrl?: string | null }).videoUrl ?? null
          : body.videoUrl || null,
      expressShippingEnabled:
        body.expressShippingEnabled ??
        (existing as { expressShippingEnabled?: boolean }).expressShippingEnabled ??
        true,
      relatedArticleSlugs:
        body.relatedArticleSlugs ??
        (existing as { relatedArticleSlugs?: string[] }).relatedArticleSlugs ??
        [],
      seoTitle: body.seoTitle !== undefined ? body.seoTitle : existing.seoTitle,
      seoDescription:
        body.seoDescription !== undefined ? body.seoDescription : existing.seoDescription,
      seoKeyword: body.seoKeyword !== undefined ? body.seoKeyword : existing.seoKeyword,
      categoryIds:
        body.categoryIds ??
        existing.categories.map((c: { category: { id: string } }) => c.category.id),
      variantAxisOrder:
        body.variantAxisOrder ??
        (existing as { variantAxisOrder?: string[] }).variantAxisOrder ??
        [],
      variants: body.variants,
      images: body.images,
      accordionItems: body.accordionItems
    };
    const { zohoSync } = await saveProductAdmin(id, merged);
    const product = await getProductAdminById(id);
    res.json({ success: true, data: { product, zohoSync } });
  } catch (err) {
    next(err);
  }
}

export async function adminDelete(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteProductAdmin(req.params.id);
    res.json({ success: true, message: "Product archived" });
  } catch (err) {
    next(err);
  }
}
