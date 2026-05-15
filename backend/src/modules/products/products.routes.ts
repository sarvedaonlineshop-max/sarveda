import { Router } from "express";

import * as controller from "./products.controller";

const router = Router();

router.get("/suggest", controller.suggest);
router.get("/", controller.list);
router.get("/:slug", controller.getOne);

export { router as productsRoutes };
