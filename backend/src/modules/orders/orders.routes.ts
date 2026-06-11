import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

import * as controller from "./orders.controller";

const router = Router();

router.get("/me", requireAuth, controller.listMine);
router.get("/public/:orderNumber/invoice", controller.downloadInvoice);
router.post(
  "/public/:orderNumber/refresh-shipping",
  validateBody(z.object({ email: z.string().trim().min(3).max(254) })),
  controller.refreshShippingPublic
);
router.post(
  "/public/:orderNumber/reorder",
  validateBody(z.object({ email: z.string().trim().min(3).max(254) })),
  controller.reorderCancelledPublic
);
router.get("/public/:orderNumber", controller.getByOrderNumber);

export { router as ordersRoutes };
