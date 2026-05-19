import type { Request, Response, NextFunction } from "express";

import { getPageBySlug, listPageSlugs } from "./pages.service";

export async function getPageHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    if (!slug) {
      res.status(400).json({ success: false, error: "slug required", code: "BAD_REQUEST" });
      return;
    }
    const page = await getPageBySlug(slug);
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { page } });
  } catch (err) {
    next(err);
  }
}

export async function pageSlugsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const slugs = await listPageSlugs();
    res.json({ success: true, data: { slugs } });
  } catch (err) {
    next(err);
  }
}
