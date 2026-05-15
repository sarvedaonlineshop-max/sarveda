import type { NextFunction, Request, Response } from "express";

import { ProductStatus } from "@prisma/client";

import {
  createProduct,
  getProductAdminById,
  getProductBySlug,
  listProducts,
  listProductsAdmin,
  suggestProducts,
  updateProduct
} from "./products.service";
import type { CreateProductBody, UpdateProductBody } from "./schemas";

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

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;
    const product = await getProductBySlug(slug);
    res.json({ success: true, data: { product } });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as CreateProductBody;
    const product = await createProduct({
      ...body,
      audioUrl: body.audioUrl || null,
      categoryIds: body.categoryIds,
      variants: body.variants
    });
    res.status(201).json({ success: true, data: { product } });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = req.body as UpdateProductBody;
    const product = await updateProduct(id, {
      ...body,
      audioUrl: body.audioUrl === undefined ? undefined : body.audioUrl || null,
      categoryIds: body.categoryIds
    });
    res.json({ success: true, data: { product } });
  } catch (err) {
    next(err);
  }
}
