import { Router } from "express";
import rateLimit from "express-rate-limit";

import { optionalAuth } from "../../middleware/optionalAuth";
import { validateBody } from "../../middleware/validate";

import * as controller from "./cart.controller";
import * as couponController from "./coupon.handlers";
import { cartAddSchema, cartCouponSchema, cartUpdateSchema } from "./schemas";

const router = Router();

/** Apply attempts only — GET /coupon/offers must not share this bucket (checkout refetches offers often). */
const couponApplyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  message: { success: false, error: "Too many coupon attempts. Please slow down.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as { code?: string; email?: string };
    const userId = req.authUser?.id;
    return `coupon-apply:${userId ?? req.ip}:${body.code?.trim().toUpperCase() ?? "unknown"}`;
  }
});

router.use(optionalAuth);

router.post("/add", validateBody(cartAddSchema), controller.add);
router.post("/merge-session", controller.mergeSession);
router.get("/", controller.get);
router.delete("/", controller.clear);
router.put("/update", validateBody(cartUpdateSchema), controller.update);
router.delete("/remove/:variantId", controller.remove);
router.get("/coupon/offers", couponController.listOffers);
router.post("/coupon", couponApplyLimiter, validateBody(cartCouponSchema), couponController.applyCoupon);
router.delete("/coupon", couponController.removeCoupon);

export { router as cartRoutes };
