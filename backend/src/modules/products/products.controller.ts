import type { NextFunction, Request, Response } from "express";

import { ProductStatus } from "@prisma/client";

import { buildCatalogGapsReport } from "../admin/catalogGaps.service";
import { deleteProductAdmin, saveProductAdmin } from "./productAdmin.service";
import {
  getProductAdminById,
  getProductBySlug,
  listProductSitemapEntries,
  listProducts,
  listProductsAdmin,
  suggestProducts
} from "./products.service";
import type { CreateProductBody, UpdateProductBody } from "./schemas";
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

function normalizeAdminBody(body: CreateProductBody | UpdateProductBody): ProductAdminSaveInput {
  return {
    slug: body.slug!,
    name: body.name!,
    description: body.description,
    shortDescription: body.shortDescription,
    productType: body.productType!,
    status: body.status,
    taxClass: body.taxClass,
    hasAudio: body.hasAudio,
    audioUrl: body.audioUrl === undefined ? undefined : body.audioUrl || null,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    seoKeyword: body.seoKeyword,
    categoryIds: body.categoryIds,
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

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as CreateProductBody;
    const { id } = await saveProductAdmin(null, normalizeAdminBody(body));
    const product = await getProductAdminById(id);
    res.status(201).json({ success: true, data: { product } });
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
      hasAudio: body.hasAudio ?? existing.hasAudio,
      audioUrl: body.audioUrl === undefined ? existing.audioUrl : body.audioUrl || null,
      seoTitle: body.seoTitle !== undefined ? body.seoTitle : existing.seoTitle,
      seoDescription:
        body.seoDescription !== undefined ? body.seoDescription : existing.seoDescription,
      seoKeyword: body.seoKeyword !== undefined ? body.seoKeyword : existing.seoKeyword,
      categoryIds:
        body.categoryIds ??
        existing.categories.map((c: { category: { id: string } }) => c.category.id),
      variants: body.variants,
      images: body.images,
      accordionItems: body.accordionItems
    };
    await saveProductAdmin(id, merged);
    const product = await getProductAdminById(id);
    res.json({ success: true, data: { product } });
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
