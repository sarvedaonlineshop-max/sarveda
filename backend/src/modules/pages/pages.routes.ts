import { Router } from "express";

import { getPageHandler, pageSlugsHandler } from "./pages.controller";

export const pagesRoutes = Router();

pagesRoutes.get("/sitemap/slugs", pageSlugsHandler);
pagesRoutes.get("/:slug", getPageHandler);
