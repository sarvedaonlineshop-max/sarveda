import { Router } from "express";

import { requireAuth } from "../../middleware/auth";

import * as controller from "./orders.controller";

const router = Router();

router.get("/me", requireAuth, controller.listMine);
router.get("/public/:orderNumber/invoice", controller.downloadInvoice);
router.get("/public/:orderNumber", controller.getByOrderNumber);

export { router as ordersRoutes };
