import { OrderStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { requireAdmin } from "../../middleware/admin";
import { validateBody } from "../../middleware/validate";
import * as productsController from "../products/products.controller";
import { createProductSchema, updateProductSchema } from "../products/schemas";

import * as admin from "./admin.handlers";
import * as pickupLocations from "./pickupLocations.handlers";
import {
  createPickupLocationSchema,
  updatePickupLocationSchema
} from "./pickupLocations.handlers";

const router = Router();
router.use(requireAdmin);

router.get("/pickup-locations", pickupLocations.listPickupLocations);
router.post(
  "/pickup-locations",
  validateBody(createPickupLocationSchema),
  pickupLocations.createPickupLocation
);
router.patch(
  "/pickup-locations/:id",
  validateBody(updatePickupLocationSchema),
  pickupLocations.updatePickupLocation
);
router.delete("/pickup-locations/:id", pickupLocations.deletePickupLocation);

router.get("/dashboard", admin.dashboard);
router.get("/orders", admin.ordersList);
router.get("/orders/:id/invoice", admin.orderInvoice);
router.get("/orders/:id", admin.orderDetail);
router.patch(
  "/orders/:id/status",
  validateBody(z.object({ status: z.nativeEnum(OrderStatus) })),
  admin.patchOrderStatus
);

router.get("/inventory", admin.inventoryList);
router.patch(
  "/inventory/:variantId",
  validateBody(z.object({ onHand: z.number().int().min(0) })),
  admin.patchInventory
);

const productsAdmin = Router();
productsAdmin.get("/", productsController.adminList);
productsAdmin.get("/:id", productsController.adminGetOne);
productsAdmin.post("/", validateBody(createProductSchema), productsController.create);
productsAdmin.put("/:id", validateBody(updateProductSchema), productsController.update);

router.use("/products", productsAdmin);

export { router as adminRoutes };
