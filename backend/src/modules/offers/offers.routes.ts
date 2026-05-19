import { Router } from "express";

import { getOfferHandler, listOffersHandler, offerSlugsHandler } from "./offers.controller";

export const offersRoutes = Router();

offersRoutes.get("/", listOffersHandler);
offersRoutes.get("/sitemap/slugs", offerSlugsHandler);
offersRoutes.get("/:slug", getOfferHandler);
