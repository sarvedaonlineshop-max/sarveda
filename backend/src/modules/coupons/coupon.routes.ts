import { Router } from "express";

import { listActivePdpCouponOffers } from "./coupon.service";

const router = Router();

/** Public PDP offers — active, non-expired coupons only. */
router.get("/offers", async (_req, res, next) => {
  try {
    const offers = await listActivePdpCouponOffers();
    res.json({ success: true, data: { offers } });
  } catch (err) {
    next(err);
  }
});

export { router as couponRoutes };
