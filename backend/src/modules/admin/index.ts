import { Router } from "express";

import { adminRoutes as legacyAdminRoutes } from "./admin.routes";
import { rtoAdminRoutes } from "./rto-admin.routes";

const router = Router();

// RTO post-dispatch cancellation must intercept approve before the legacy
// pre-dispatch cancellation handler rejects dispatched orders.
router.use(rtoAdminRoutes);
router.use(legacyAdminRoutes);

export { router as adminRoutes };
