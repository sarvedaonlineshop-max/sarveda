import { Router } from "express";

import { optionalAuth } from "../../middleware/optionalAuth";
import { validateBody } from "../../middleware/validate";

import * as controller from "./cart.controller";
import { cartAddSchema, cartUpdateSchema } from "./schemas";

const router = Router();

router.use(optionalAuth);

router.post("/add", validateBody(cartAddSchema), controller.add);
router.get("/", controller.get);
router.put("/update", validateBody(cartUpdateSchema), controller.update);
router.delete("/remove/:variantId", controller.remove);

export { router as cartRoutes };
