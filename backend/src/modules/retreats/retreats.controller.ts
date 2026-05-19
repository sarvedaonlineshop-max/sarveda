import type { Request, Response, NextFunction } from "express";

import { getRetreatBySlug, listActiveRetreats, listRetreatSlugs } from "./retreats.service";

export async function listRetreatsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const retreats = await listActiveRetreats();
    res.json({ success: true, data: { retreats } });
  } catch (err) {
    next(err);
  }
}

export async function getRetreatHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    const retreat = await getRetreatBySlug(slug);
    if (!retreat) {
      res.status(404).json({ success: false, error: "Retreat not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { retreat } });
  } catch (err) {
    next(err);
  }
}

export async function retreatSlugsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const slugs = await listRetreatSlugs();
    res.json({ success: true, data: { slugs } });
  } catch (err) {
    next(err);
  }
}
