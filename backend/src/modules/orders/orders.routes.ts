import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

import * as controller from "./orders.controller";
import * as serviceRequest from "./order-service-request.controller";

const router = Router();

router.get("/me", requireAuth, controller.listMine);
router.post(
  "/:orderNumber/cancel-request",
  requireAuth,
  serviceRequest.serviceRequestUpload,
  serviceRequest.submitCancelRequest
);
router.post(
  "/:orderNumber/refund-request",
  requireAuth,
  serviceRequest.serviceRequestUpload,
  serviceRequest.submitRefundRequest
);
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
