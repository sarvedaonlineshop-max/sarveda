import type { Request, Response, NextFunction } from "express";

import { getOfferBySlug, listActiveOffers, listOfferSlugs } from "./offers.service";

export async function listOffersHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const offers = await listActiveOffers();
    res.json({ success: true, data: { offers } });
  } catch (err) {
    next(err);
  }
}

export async function getOfferHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    const offer = await getOfferBySlug(slug);
    if (!offer) {
      res.status(404).json({ success: false, error: "Offer not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { offer } });
  } catch (err) {
    next(err);
  }
}

export async function offerSlugsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const slugs = await listOfferSlugs();
    res.json({ success: true, data: { slugs } });
  } catch (err) {
    next(err);
  }
}
