import { Router } from "express";

import { getRetreatHandler, listRetreatsHandler, retreatSlugsHandler } from "./retreats.controller";

export const retreatsRoutes = Router();

retreatsRoutes.get("/", listRetreatsHandler);
retreatsRoutes.get("/sitemap/slugs", retreatSlugsHandler);
retreatsRoutes.get("/:slug", getRetreatHandler);
