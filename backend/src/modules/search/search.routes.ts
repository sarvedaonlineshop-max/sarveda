import { Router } from "express";

import { suggestHandler } from "./search.controller";

const router = Router();

router.get("/suggest", suggestHandler);

export { router as searchRoutes };
