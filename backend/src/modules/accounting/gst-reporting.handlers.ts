import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import {
  isAccountingGstEnabled,
  isAccountingGstReportingEnabled
} from "./accounting-flag";
import { buildGstExportWorkbook } from "./gst-export.service";
import {
  buildB2bReport,
  buildB2cReport,
  buildCreditNoteReport,
  buildGstDataGapDashboard,
  buildGstReportIntegrity,
  buildGstReportingOverview,
  buildHsnSummaryReport,
  buildOutwardSupplyReport,
  buildPlaceOfSupplySummary,
  buildRateSummaryReport,
  buildGstr3bStyleSummary
} from "./gst-reporting.service";

const periodQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  month: z.string().optional()
});

function requireGstReporting(_req: Request, res: Response): boolean {
  if (!isAccountingGstEnabled()) {
    res.status(503).json({
      success: false,
      code: "ACCOUNTING_GST_DISABLED",
      error: "Set ACCOUNTING_GST_ENABLED=1 (and NATIVE_ACCOUNTING_ENABLED=1)"
    });
    return false;
  }
  if (!isAccountingGstReportingEnabled()) {
    res.status(503).json({
      success: false,
      code: "ACCOUNTING_GST_REPORTING_DISABLED",
      error: "Set ACCOUNTING_GST_REPORTING_ENABLED=1 to enable GSTR-style management reports"
    });
    return false;
  }
  return true;
}

function defaultPeriod(q: { from?: string; to?: string; month?: string }) {
  if (!q.month && !(q.from && q.to)) {
    const now = new Date();
    q.month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return q;
}

async function withPeriod(
  req: Request,
  res: Response,
  next: NextFunction,
  fn: (period: { from?: string; to?: string; month?: string }) => Promise<unknown>
) {
  try {
    if (!requireGstReporting(req, res)) return;
    const q = defaultPeriod(periodQuery.parse(req.query));
    const data = await fn(q);
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof Error && /month must|from and to|invalid/i.test(err.message)) {
      res.status(400).json({ success: false, code: "INVALID_PERIOD", error: err.message });
      return;
    }
    next(err);
  }
}

export async function gstReportsOverview(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildGstReportingOverview);
}

export async function gstReportsOutward(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildOutwardSupplyReport);
}

export async function gstReportsB2b(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildB2bReport);
}

export async function gstReportsB2c(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildB2cReport);
}

export async function gstReportsCreditNotes(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildCreditNoteReport);
}

export async function gstReportsHsn(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildHsnSummaryReport);
}

export async function gstReportsRates(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildRateSummaryReport);
}

export async function gstReports3bSummary(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildGstr3bStyleSummary);
}

export async function gstReportsIntegrity(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildGstReportIntegrity);
}

export async function gstReportsPos(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildPlaceOfSupplySummary);
}

export async function gstReportsDataGaps(req: Request, res: Response, next: NextFunction) {
  return withPeriod(req, res, next, buildGstDataGapDashboard);
}

export async function gstReportsExport(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireGstReporting(req, res)) return;
    const q = defaultPeriod(periodQuery.parse(req.query));
    const buffer = await buildGstExportWorkbook(q);
    const label = q.month ?? `${q.from}_${q.to}`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sarveda-gst-management-${label}.xlsx"`
    );
    res.send(buffer);
  } catch (err) {
    if (err instanceof Error && /month must|from and to|invalid/i.test(err.message)) {
      res.status(400).json({ success: false, code: "INVALID_PERIOD", error: err.message });
      return;
    }
    next(err);
  }
}
