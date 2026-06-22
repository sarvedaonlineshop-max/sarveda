import { Router } from "express";

import { optionalAuth } from "../../middleware/optionalAuth";
import * as controller from "./products.controller";

const router = Router();

router.get("/suggest", controller.suggest);
router.get("/sitemap/entries", controller.sitemapEntries);
router.get("/", controller.list);
router.post("/:slug/notify-stock", optionalAuth, controller.notifyStock);
router.get("/:slug", controller.getOne);

export { router as productsRoutes };
