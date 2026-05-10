import { Router } from "express";

import * as controller from "./orders.controller";

const router = Router();

router.get("/public/:orderNumber", controller.getByOrderNumber);

export { router as ordersRoutes };
