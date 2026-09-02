import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

import * as controller from "./orders.controller";
import * as serviceRequest from "./order-service-request.controller";

const router = Router();

router.get("/me", requireAuth, controller.listMine);
router.get(
  "/:orderNumber/adjustment-options",
  requireAuth,
  serviceRequest.getAdjustmentOptions
);
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
router.post(
  "/:orderNumber/adjust-request",
  requireAuth,
  validateBody(
    z.object({
      reasonCode: z.enum(["change_address", "wrong_item", "change_quantity"]),
      orderItemId: z.string().uuid(),
      message: z.string().max(2000).optional(),
      requestedVariantId: z.string().uuid().optional(),
      requestedQty: z.number().int().positive().max(99).optional(),
      requestedAddress: z
        .object({
          fullName: z.string().min(1).max(120),
          phone: z.string().min(6).max(20),
          line1: z.string().min(1).max(200),
          line2: z.string().max(200).optional().nullable(),
          city: z.string().min(1).max(80),
          state: z.string().min(1).max(80),
          postalCode: z.string().min(3).max(12),
          country: z.string().min(2).max(2).default("IN")
        })
        .optional()
    })
  ),
  serviceRequest.submitAdjustRequest
);
router.post(
  "/:orderNumber/supplementary-payment",
  requireAuth,
  validateBody(z.object({ requestId: z.string().uuid() })),
  serviceRequest.createSupplementaryPayment
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
