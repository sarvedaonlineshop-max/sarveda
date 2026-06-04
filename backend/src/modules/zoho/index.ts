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
import { getZohoStockSyncHistory } from "./zoho-stock-sync-history";

export { createZohoInvoiceForOrder } from "./zoho-invoices";
export { syncStockFromZoho } from "./zoho-inventory";
export { syncProductVariantsToZoho } from "./zoho-items";

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

    const productName =
      typeof req.body?.productName === "string" ? req.body.productName.trim() : undefined;

    let result;
    if (productId) {
      result = await syncStockForProduct(productId, productName);
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

zohoRouter.get("/sync/history", requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const entries = await getZohoStockSyncHistory(limit);
    res.json({ success: true, data: { entries } });
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
