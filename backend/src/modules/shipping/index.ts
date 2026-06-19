import { Router } from "express";

import { requireAdmin } from "../../middleware/admin";

import * as controller from "./shipping.controller";

const router = Router();

router.post("/check-pincode", controller.checkPincode);
router.post("/check-india-shiprocket", controller.checkIndiaShiprocketServiceability);
router.get("/rates", controller.getRates);
router.post("/create-shipment/:orderId", requireAdmin, controller.createShipmentForOrder);
router.post("/admin/orders/:orderId/sync-tracking", requireAdmin, controller.syncOrderShipments);
router.post("/admin/cancel-waybill", requireAdmin, controller.cancelWaybillAdmin);
router.get("/admin/label/:waybill", requireAdmin, controller.getAdminLabel);
router.post("/admin/manual-awb/:orderId", requireAdmin, controller.postManualAwb);
router.get("/public/track/:waybill", controller.publicTrack);
router.get("/track/:waybill", requireAdmin, controller.track);
router.get("/international-rates", controller.internationalRates);

export { router as shippingRoutes };
