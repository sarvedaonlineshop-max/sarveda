import { Router } from "express";

import { logger } from "../../config/logger";
import { requireAdmin } from "../../middleware/admin";

import { getZohoAccessToken } from "./zoho-auth";
import { createZohoInvoiceForOrder } from "./zoho-invoices";
import { recordZohoPaymentForOrder } from "./zoho-financials";
import {
  pullStockFromZohoForSkus,
  refreshZohoAuditCache,
  syncStockForProduct,
  syncStockFromZoho,
  syncUnmatchedSkusFromZoho
} from "./zoho-inventory";
import {
  markZohoItemsInactiveForSkus,
  pushStockToZohoForSkus,
  pushVariantsToZoho,
  syncProductVariantsToZoho
} from "./zoho-items";
import { computeZohoSyncSummary, listZohoOnlyItems } from "./zoho-sync-audit";
import { getZohoStockSyncHistory } from "./zoho-stock-sync-history";

export { createZohoInvoiceForOrder } from "./zoho-invoices";
export { syncStockFromZoho, refreshZohoAuditCache } from "./zoho-inventory";
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

/** Refresh Zoho SKU + stock audit cache (does not change Sarveda inventory). */
zohoRouter.post("/sync/audit", requireAdmin, async (_req, res, next) => {
  try {
    const data = await refreshZohoAuditCache();
    const summary = await computeZohoSyncSummary();
    res.json({ success: true, data: { ...data, summary } });
  } catch (err) {
    next(err);
  }
});

zohoRouter.get("/sync/summary", requireAdmin, async (_req, res, next) => {
  try {
    const [summary, zohoOnlyItems] = await Promise.all([
      computeZohoSyncSummary(),
      listZohoOnlyItems()
    ]);
    res.json({ success: true, data: { summary, zohoOnlyItems } });
  } catch (err) {
    next(err);
  }
});

zohoRouter.post("/sync/stock", requireAdmin, async (req, res, next) => {
  try {
    const productId =
      typeof req.body?.productId === "string" ? req.body.productId.trim() : undefined;
    const unmatchedOnly = req.body?.unmatchedOnly === true;
    const auditOnly = req.body?.auditOnly !== false;

    const productName =
      typeof req.body?.productName === "string" ? req.body.productName.trim() : undefined;

    if (auditOnly && !productId && !unmatchedOnly) {
      const data = await refreshZohoAuditCache();
      const summary = await computeZohoSyncSummary();
      res.json({
        success: true,
        data: { synced: data.zohoSkuCount, errors: 0, skipped: 0, summary }
      });
      return;
    }

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

function readStringArray(body: unknown, key: string): string[] {
  const val = (body as Record<string, unknown>)?.[key];
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

zohoRouter.post("/sync/pull-stock", requireAdmin, async (req, res, next) => {
  try {
    const skus = readStringArray(req.body, "skus");
    if (skus.length === 0) {
      res.status(400).json({ success: false, error: "Provide skus array", code: "VALIDATION" });
      return;
    }
    const result = await pullStockFromZohoForSkus(skus);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

zohoRouter.post("/sync/push-stock", requireAdmin, async (req, res, next) => {
  try {
    const skus = readStringArray(req.body, "skus");
    if (skus.length === 0) {
      res.status(400).json({ success: false, error: "Provide skus array", code: "VALIDATION" });
      return;
    }
    const result = await pushStockToZohoForSkus(skus);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

zohoRouter.post("/sync/push-items", requireAdmin, async (req, res, next) => {
  try {
    const variantIds = readStringArray(req.body, "variantIds");
    if (variantIds.length === 0) {
      res.status(400).json({
        success: false,
        error: "Provide variantIds array",
        code: "VALIDATION"
      });
      return;
    }
    const result = await pushVariantsToZoho(variantIds);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

zohoRouter.post("/sync/ignore-zoho", requireAdmin, async (req, res, next) => {
  try {
    const skus = readStringArray(req.body, "skus");
    if (skus.length === 0) {
      res.status(400).json({ success: false, error: "Provide skus array", code: "VALIDATION" });
      return;
    }
    const result = await markZohoItemsInactiveForSkus(skus);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

zohoRouter.get("/test/stock-sync", async (_req, res, next) => {
  try {
    const result = await refreshZohoAuditCache();
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
    await recordZohoPaymentForOrder(req.params.orderId);
    res.json({ success: true });
  } catch (err) {
    console.error("[ZOHO_INVOICE_FAILED]", { orderId: req.params.orderId, err });
    logger.error("Zoho invoice sync route failed", { orderId: req.params.orderId, err });
    next(err);
  }
});
