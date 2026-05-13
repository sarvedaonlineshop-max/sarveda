import { Router } from "express";

import { requireAdmin } from "../../middleware/admin";

import * as controller from "./shipping.controller";

const router = Router();

router.post("/check-pincode", controller.checkPincode);
router.get("/rates", controller.getRates);
router.post("/create-shipment/:orderId", requireAdmin, controller.createShipmentForOrder);
router.get("/track/:waybill", controller.track);
router.get("/international-rates", controller.internationalRates);

export { router as shippingRoutes };
