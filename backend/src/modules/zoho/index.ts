import { Router } from "express";

import { logger } from "../../config/logger";
import { requireAdmin } from "../../middleware/admin";

import { getZohoAccessToken } from "./zoho-auth";
import { createZohoInvoiceForOrder } from "./zoho-invoices";
import {
  syncStockForProduct,
  syncStockFromZoho,
  syncUnmatchedSkusFromZoho
} from "./zoho-inventory";

export { createZohoInvoiceForOrder } from "./zoho-invoices";
export { syncStockFromZoho } from "./zoho-inventory";

export const zohoRouter = Router();

zohoRouter.get("/status", async (_req, res) => {
  try {
    await getZohoAccessToken();
    res.json({ success: true, message: "Zoho Books connected ✅" });
  } catch (err) {
    res.json({ success: false, message: "Zoho Books connection failed", error: String(err) });
  }
});

zohoRouter.post("/sync/stock", requireAdmin, async (req, res, next) => {
  try {
    const productId =
      typeof req.body?.productId === "string" ? req.body.productId.trim() : undefined;
    const unmatchedOnly = req.body?.unmatchedOnly === true;

    let result;
    if (productId) {
      result = await syncStockForProduct(productId);
    } else if (unmatchedOnly) {
      result = await syncUnmatchedSkusFromZoho();
    } else {
      result = await syncStockFromZoho();
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Public test endpoint — remove after testing
zohoRouter.get("/test/stock-sync", async (_req, res, next) => {
  try {
    const result = await syncStockFromZoho();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

zohoRouter.post("/sync/invoice/:orderId", requireAdmin, async (req, res, next) => {
  try {
    await createZohoInvoiceForOrder(req.params.orderId);
    res.json({ success: true });
  } catch (err) {
    logger.error("Zoho invoice sync route failed", { orderId: req.params.orderId, err });
    next(err);
  }
});
