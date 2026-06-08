import { Router } from "express";

import { optionalAuth } from "../../middleware/optionalAuth";
import { validateBody } from "../../middleware/validate";

import * as controller from "./cart.controller";
import * as couponController from "./coupon.handlers";
import { cartAddSchema, cartCouponSchema, cartUpdateSchema } from "./schemas";

const router = Router();

router.use(optionalAuth);

router.post("/add", validateBody(cartAddSchema), controller.add);
router.post("/merge-session", controller.mergeSession);
router.get("/", controller.get);
router.delete("/", controller.clear);
router.put("/update", validateBody(cartUpdateSchema), controller.update);
router.delete("/remove/:variantId", controller.remove);
router.get("/coupon/offers", couponController.listOffers);
router.post("/coupon", validateBody(cartCouponSchema), couponController.applyCoupon);
router.delete("/coupon", couponController.removeCoupon);

export { router as cartRoutes };
