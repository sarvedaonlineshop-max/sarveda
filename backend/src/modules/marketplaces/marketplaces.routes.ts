import { Router } from "express";

import { validateBody } from "../../middleware/validate";
import * as controller from "./marketplaces.controller";
import {
  marketplaceEmailIngestSchema,
  marketplaceListingPatchSchema,
  marketplaceListingUpsertSchema,
  marketplaceOrderCreateSchema,
  marketplaceOrdersImportSchema,
  marketplaceReturnCreateSchema
} from "./marketplaces.schemas";

const router = Router();

router.get("/overview", controller.overview);
router.get("/analytics", controller.analytics);
router.get("/listings", controller.listings);
router.post("/listings", validateBody(marketplaceListingUpsertSchema), controller.createListing);
router.patch("/listings/:id", validateBody(marketplaceListingPatchSchema), controller.updateListing);
router.get("/orders", controller.orders);
router.post("/orders", validateBody(marketplaceOrderCreateSchema), controller.createOrder);
router.post("/orders/import", validateBody(marketplaceOrdersImportSchema), controller.importOrders);
router.get("/returns", controller.returnsList);
router.post("/returns", validateBody(marketplaceReturnCreateSchema), controller.createReturn);
router.get("/inbox", controller.inbox);
router.post("/email-ingest", validateBody(marketplaceEmailIngestSchema), controller.ingestEmail);

export { router as marketplaceAdminRoutes };
