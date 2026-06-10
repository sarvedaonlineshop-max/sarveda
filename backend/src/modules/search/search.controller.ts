import type { NextFunction, Request, Response } from "express";

import { suggestSiteSearch } from "./search.service";

export async function suggestHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 10;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 40) : 10;
    const items = await suggestSiteSearch(q, limit);
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
}
