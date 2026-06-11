import { Router } from "express";

import { optionalAuth } from "../../middleware/optionalAuth";
import { requireAuth } from "../../middleware/auth";
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
router.get("/coupon/offers", requireAuth, couponController.listOffers);
router.post("/coupon", requireAuth, validateBody(cartCouponSchema), couponController.applyCoupon);
router.delete("/coupon", requireAuth, couponController.removeCoupon);

export { router as cartRoutes };
