import { Router, type NextFunction, type Request, type Response } from "express";

import { validateBody } from "../../middleware/validate";
import { isPurchasesModuleEnabled, PURCHASES_MODULE_DISABLED_MESSAGE } from "./purchases-flag";
import * as h from "./purchases.handlers";
import {
  createBillSchema,
  createExpenseSchema,
  createPoSchema,
  createVendorSchema,
  receivePoSchema,
  updateBillSchema,
  updateExpenseSchema,
  updatePoSchema,
  updateVendorSchema
} from "./purchases.handlers";

function requirePurchasesEnabled(req: Request, res: Response, next: NextFunction) {
  if (isPurchasesModuleEnabled()) return next();
  res.status(403).json({
    success: false,
    code: "PURCHASES_MODULE_DISABLED",
    error: PURCHASES_MODULE_DISABLED_MESSAGE
  });
}

const router = Router();
router.use(requirePurchasesEnabled);

router.get("/status", h.purchasesStatus);
router.get("/catalog-search", h.searchCatalogItems);

router.get("/vendors", h.listVendors);
router.get("/vendors/:id", h.getVendor);
router.post("/vendors", validateBody(createVendorSchema), h.createVendor);
router.patch("/vendors/:id", validateBody(updateVendorSchema), h.updateVendor);

router.get("/purchase-orders", h.listPurchaseOrders);
router.get("/purchase-orders/:id", h.getPurchaseOrder);
router.post("/purchase-orders", validateBody(createPoSchema), h.createPurchaseOrder);
router.patch("/purchase-orders/:id", validateBody(updatePoSchema), h.updatePurchaseOrder);
router.post("/purchase-orders/:id/receive", validateBody(receivePoSchema), h.receivePurchaseOrderHandler);

router.get("/bills", h.listBills);
router.get("/bills/:id", h.getBill);
router.post("/bills", validateBody(createBillSchema), h.createBill);
router.patch("/bills/:id", validateBody(updateBillSchema), h.updateBill);

router.get("/expenses", h.listExpenses);
router.get("/expenses/:id", h.getExpense);
router.post("/expenses", validateBody(createExpenseSchema), h.createExpense);
router.patch("/expenses/:id", validateBody(updateExpenseSchema), h.updateExpense);

export { router as purchasesAdminRoutes };
