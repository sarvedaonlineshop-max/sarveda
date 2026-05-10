import { Router } from "express";

import * as controller from "./categories.controller";

const router = Router();

router.get("/", controller.tree);

export { router as categoriesRoutes };
