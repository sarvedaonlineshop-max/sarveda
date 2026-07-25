import { Router } from "express";

import { requireAdmin } from "../../middleware/admin";
import { logAdminMutations } from "../../middleware/adminActivity";

import * as controller from "./shipping.controller";

const router = Router();

router.post("/check-pincode", controller.checkPincode);
router.post("/check-india-shiprocket", controller.checkIndiaShiprocketServiceability);
router.get("/rates", controller.getRates);
router.post(
  "/create-shipment/:orderId",
  requireAdmin,
  logAdminMutations,
  controller.createShipmentForOrder
);
router.post(
  "/admin/orders/:orderId/sync-tracking",
  requireAdmin,
  logAdminMutations,
  controller.syncOrderShipments
);
router.post("/admin/cancel-waybill", requireAdmin, logAdminMutations, controller.cancelWaybillAdmin);
router.get("/admin/label/:waybill", requireAdmin, controller.getAdminLabel);
router.post("/admin/delhivery-estimate", requireAdmin, controller.estimateDelhiveryCharge);
router.post(
  "/admin/manual-awb/:orderId",
  requireAdmin,
  logAdminMutations,
  controller.postManualAwb
);
router.post(
  "/admin/reverse-shipment/:orderId",
  requireAdmin,
  logAdminMutations,
  controller.createReverseShipment
);
router.get("/public/track/:waybill", controller.publicTrack);
router.get("/track/:waybill", requireAdmin, controller.track);
router.get("/international-rates", controller.internationalRates);

export { router as shippingRoutes };
