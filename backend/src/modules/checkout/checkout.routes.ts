import { Router } from "express";

import { optionalAuth } from "../../middleware/optionalAuth";
import { validateBody } from "../../middleware/validate";

import * as controller from "./checkout.controller";
import { createOrderSchema } from "./schemas";

const router = Router();

router.use(optionalAuth);

router.post("/create-order", validateBody(createOrderSchema), controller.createOrder);
router.get("/resume", controller.resumeOrder);

export { router as checkoutRoutes };
