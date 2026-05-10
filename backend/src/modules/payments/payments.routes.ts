import { Router } from "express";

import { validateBody } from "../../middleware/validate";

import * as controller from "./payments.controller";
import { razorpayVerifySchema } from "./verify.schema";

export type RazorpayVerifyBody = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

const router = Router();

router.post("/razorpay/verify", validateBody(razorpayVerifySchema), controller.verifyRazorpay);

export { router as paymentsJsonRoutes };
