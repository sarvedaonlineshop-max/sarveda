import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import {
  isAccountingGstEnabled,
  isAccountingGstReconciliationEnabled,
  isAccountingItcVerificationEnabled,
  isAccountingGstReportingEnabled
} from "./accounting-flag";
import { buildGstLedger } from "./gst-ledger.service";
import {
  buildGstDataGaps,
  buildGstOverview,
  buildGstReconciliation
} from "./gst-reconciliation.service";
import { SHIPPING_GST_POLICY } from "./gst.constants";

function requireGst(_req: Request, res: Response): boolean {
  if (!isAccountingGstEnabled()) {
    res.status(503).json({
      success: false,
      code: "ACCOUNTING_GST_DISABLED",
      error: "Set ACCOUNTING_GST_ENABLED=1 (and NATIVE_ACCOUNTING_ENABLED=1) to enable GST ledger"
    });
    return false;
  }
  return true;
}

function requireGstRecon(_req: Request, res: Response): boolean {
  if (!requireGst(_req, res)) return false;
  if (!isAccountingGstReconciliationEnabled()) {
    res.status(503).json({
      success: false,
      code: "ACCOUNTING_GST_RECONCILIATION_DISABLED",
      error: "Set ACCOUNTING_GST_RECONCILIATION_ENABLED=1 to enable GST reconciliation"
    });
    return false;
  }
  return true;
}

const periodQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  month: z.string().optional()
});

export async function gstStatus(_req: Request, res: Response) {
  res.json({
    success: true,
    data: {
      gstEnabled: isAccountingGstEnabled(),
      gstReconciliationEnabled: isAccountingGstReconciliationEnabled(),
      itcVerificationEnabled: isAccountingItcVerificationEnabled(),
      gstReportingEnabled: isAccountingGstReportingEnabled(),
      shippingGstPolicy: SHIPPING_GST_POLICY,
      itcEligibleWorkflow: isAccountingItcVerificationEnabled(),
      note: "GSTR-style reports are management/reconciliation views — NOT GSTN filing"
    }
  });
}

export async function gstOverview(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireGst(req, res)) return;
    const q = periodQuery.parse(req.query);
    if (!q.month && !(q.from && q.to)) {
      const now = new Date();
      q.month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const data = await buildGstOverview(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function gstLedger(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireGst(req, res)) return;
    const q = periodQuery.parse(req.query);
    if (!q.month && !(q.from && q.to)) {
      const now = new Date();
      q.month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const data = await buildGstLedger(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function gstReconciliation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireGstRecon(req, res)) return;
    const q = z
      .object({
        scope: z
          .enum(["ALL", "SALES", "FULL_REFUNDS", "VENDOR_BILLS", "EXPENSES", "GATEWAY_FEES"])
          .optional(),
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional()
      })
      .parse(req.query);
    const data = await buildGstReconciliation(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function gstDataGaps(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireGstRecon(req, res)) return;
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
      .parse(req.query);
    const data = await buildGstDataGaps(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
