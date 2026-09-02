import { Router } from "express";

import { requireAdmin } from "../../middleware/admin";

import {
  isZohoInventorySyncEnabled,
  ZOHO_INVENTORY_SYNC_DISABLED_MESSAGE
} from "./zoho-inventory-sync-flag";

/** Legacy re-exports — callers must not invoke these in production commerce paths. */
export { createZohoInvoiceForOrder } from "./zoho-invoices";
export { syncStockFromZoho, refreshZohoAuditCache } from "./zoho-inventory";
export { syncProductVariantsToZoho } from "./zoho-items";

export const zohoRouter = Router();

const RETIRED = {
  success: false as const,
  code: "ZOHO_RETIRED",
  error: "Zoho Books is retired. Native Sarveda accounting is the sole accounting authority."
};

function retiredGone(res: import("express").Response): void {
  res.status(410).json(RETIRED);
}

function retiredOkDisabled(res: import("express").Response): void {
  res.status(200).json({
    success: false,
    code: "ZOHO_INVENTORY_SYNC_DISABLED",
    error: ZOHO_INVENTORY_SYNC_DISABLED_MESSAGE,
    data: { inventorySyncEnabled: isZohoInventorySyncEnabled(), retired: true }
  });
}

zohoRouter.get("/status", (_req, res) => {
  res.json({
    success: true,
    message: "Zoho Books retired — native Sarveda accounting is authoritative",
    data: { connected: false, retired: true, inventorySyncEnabled: false }
  });
});

zohoRouter.post("/sync/audit", requireAdmin, (_req, res) => {
  retiredOkDisabled(res);
});

zohoRouter.get("/sync/summary", requireAdmin, (_req, res) => {
  retiredOkDisabled(res);
});

zohoRouter.post("/sync/stock", requireAdmin, (_req, res) => {
  retiredOkDisabled(res);
});

zohoRouter.post("/sync/pull-stock", requireAdmin, (_req, res) => {
  retiredOkDisabled(res);
});

zohoRouter.post("/sync/push-stock", requireAdmin, (_req, res) => {
  retiredOkDisabled(res);
});

zohoRouter.post("/sync/push-items", requireAdmin, (_req, res) => {
  retiredOkDisabled(res);
});

zohoRouter.post("/sync/ignore-zoho", requireAdmin, (_req, res) => {
  retiredOkDisabled(res);
});

zohoRouter.get("/test/stock-sync", (_req, res) => {
  retiredOkDisabled(res);
});

zohoRouter.get("/sync/history", requireAdmin, (_req, res) => {
  res.json({ success: true, data: { entries: [], retired: true } });
});

/** Manual invoice sync permanently gone. */
zohoRouter.post("/sync/invoice/:orderId", requireAdmin, (_req, res) => {
  retiredGone(res);
});
