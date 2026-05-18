import { Router } from "express";

import * as controller from "./categories.controller";

const router = Router();

router.get("/", controller.tree);
router.get("/sitemap/slugs", controller.sitemapSlugs);
router.get("/:slug", controller.getOne);

export { router as categoriesRoutes };
