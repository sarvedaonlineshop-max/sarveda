import type { NextFunction, Request, Response } from "express";

import {
  flattenCategorySlugs,
  getCategoryBySlug,
  getCategoryTree
} from "./categories.service";

export async function tree(_req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await getCategoryTree();
    res.json({ success: true, data: { categories } });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
    if (!slug) {
      res.status(400).json({ success: false, error: "slug required", code: "BAD_REQUEST" });
      return;
    }
    const category = await getCategoryBySlug(slug);
    if (!category) {
      res.status(404).json({ success: false, error: "Category not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { category } });
  } catch (err) {
    next(err);
  }
}

export async function sitemapSlugs(_req: Request, res: Response, next: NextFunction) {
  try {
    const tree = await getCategoryTree();
    res.json({ success: true, data: { slugs: flattenCategorySlugs(tree) } });
  } catch (err) {
    next(err);
  }
}
