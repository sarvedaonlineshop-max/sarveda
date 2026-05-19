import type { Request, Response, NextFunction } from "express";

import { getVaidyaBySlug, listActiveVaidyas, listVaidyaSlugs } from "./vaidyas.service";

export async function listVaidyasHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const vaidyas = await listActiveVaidyas();
    res.json({ success: true, data: { vaidyas } });
  } catch (err) {
    next(err);
  }
}

export async function getVaidyaHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    const vaidya = await getVaidyaBySlug(slug);
    if (!vaidya) {
      res.status(404).json({ success: false, error: "Vaidya not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { vaidya } });
  } catch (err) {
    next(err);
  }
}

export async function vaidyaSlugsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const slugs = await listVaidyaSlugs();
    res.json({ success: true, data: { slugs } });
  } catch (err) {
    next(err);
  }
}
