import { Router } from "express";

import * as controller from "./merchant.controller";

const router = Router();

/** Public read-only Google Merchant RSS feed (File URL). No auth. */
router.get("/google/products.xml", controller.googleProductsXml);

/** CTX / PRODUCTS SOURCE 2 compatibility feed — numeric historical IDs + CTX product_type. */
router.get("/google/products-source-2.xml", controller.googleProductsSource2Xml);

/** Final native catalog feed — 764 historical + native-only shop offers. */
router.get("/google/sarveda-products.xml", controller.googleSarvedaProductsXml);

export { router as merchantRoutes };
