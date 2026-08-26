import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { isAccountingReportsEnabled } from "./accounting-flag";
import { buildGeneralLedger, GL_PAGINATION } from "./general-ledger.service";
import { financialYearConfigSummary } from "./financial-year";
import { buildTrialBalance, listReportAccounts } from "./trial-balance.service";
import { buildProfitLoss } from "./profit-loss.service";
import { buildBalanceSheet } from "./balance-sheet.service";
import { buildFinancialDashboard } from "./financial-dashboard.service";
import {
  buildFinancialIntegrityReport,
  buildTestFixtureRegister
} from "./financial-integrity.service";
import {
  buildFinancialStatementsWorkbook,
  buildGeneralLedgerWorkbook,
  buildProfitLossPdf,
  buildBalanceSheetPdf,
  buildTrialBalancePdf
} from "./financial-export.service";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const trialBalanceQuery = z
  .object({
    asOf: dateOnly.optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    includeZeroBalanceAccounts: z
      .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
      .optional()
  })
  .superRefine((q, ctx) => {
    const hasAsOf = Boolean(q.asOf);
    const hasFrom = Boolean(q.from);
    const hasTo = Boolean(q.to);
    if (hasAsOf && (hasFrom || hasTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either asOf or from+to, not both"
      });
    }
    if (!hasAsOf && !(hasFrom && hasTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "asOf or from+to required"
      });
    }
  });

const glQuery = z.object({
  accountCode: z.string().min(1).max(32).optional(),
  accountId: z.string().uuid().optional(),
  from: dateOnly,
  to: dateOnly,
  limit: z.coerce.number().int().min(1).max(GL_PAGINATION.MAX_GL_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional()
}).superRefine((q, ctx) => {
  if (!q.accountCode && !q.accountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "accountCode or accountId required"
    });
  }
});

function requireReports(_req: Request, res: Response): boolean {
  if (!isAccountingReportsEnabled()) {
    res.status(503).json({
      success: false,
      code: "ACCOUNTING_REPORTS_DISABLED",
      error:
        "Set ACCOUNTING_REPORTS_ENABLED=1 (and NATIVE_ACCOUNTING_ENABLED=1) to enable financial reports"
    });
    return false;
  }
  return true;
}

function mapClientError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (
    /required|must be|Invalid date|Provide either|from must|Account not found|ACCOUNTING_FY/i.test(
      msg
    )
  ) {
    const code = /Account not found/i.test(msg)
      ? "ACCOUNT_NOT_FOUND"
      : /ACCOUNTING_FY/i.test(msg)
        ? "INVALID_FY_CONFIG"
        : "INVALID_REPORT_QUERY";
    res.status(code === "ACCOUNT_NOT_FOUND" ? 404 : 400).json({
      success: false,
      code,
      error: msg
    });
    return true;
  }
  return false;
}

export async function financialReportsTrialBalance(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = trialBalanceQuery.parse(req.query);
    const includeZero =
      q.includeZeroBalanceAccounts === "1" || q.includeZeroBalanceAccounts === "true";
    const data = await buildTrialBalance({
      asOf: q.asOf,
      from: q.from,
      to: q.to,
      includeZeroBalanceAccounts: includeZero
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}

export async function financialReportsGeneralLedger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = glQuery.parse(req.query);
    const data = await buildGeneralLedger({
      accountCode: q.accountCode,
      accountId: q.accountId,
      from: q.from,
      to: q.to,
      limit: q.limit,
      offset: q.offset
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}

export async function financialReportsAccounts(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const data = await listReportAccounts();
    res.json({ success: true, data: { items: data, total: data.length } });
  } catch (err) {
    if (mapClientError(err, res)) return;
    next(err);
  }
}

export async function financialReportsFinancialYear(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const data = financialYearConfigSummary();
    res.json({ success: true, data });
  } catch (err) {
    if (mapClientError(err, res)) return;
    next(err);
  }
}

const plQuery = z.object({
  from: dateOnly,
  to: dateOnly,
  comparison: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
});

const bsQuery = z.object({
  asOf: dateOnly,
  comparison: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
});

const dashboardQuery = z.object({
  from: dateOnly,
  to: dateOnly,
  asOf: dateOnly.optional()
});

export async function financialReportsProfitLoss(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = plQuery.parse(req.query);
    const data = await buildProfitLoss({
      from: q.from,
      to: q.to,
      includeComparison: q.comparison === "1" || q.comparison === "true"
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}

export async function financialReportsBalanceSheet(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = bsQuery.parse(req.query);
    const data = await buildBalanceSheet({
      asOf: q.asOf,
      includeComparison: q.comparison === "1" || q.comparison === "true"
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}

export async function financialReportsDashboard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = dashboardQuery.parse(req.query);
    const data = await buildFinancialDashboard({
      from: q.from,
      to: q.to,
      asOf: q.asOf
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}

const integrityQuery = z.object({
  asOf: dateOnly.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional()
});

export async function financialReportsIntegrity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = integrityQuery.parse(req.query);
    const data = await buildFinancialIntegrityReport({
      asOf: q.asOf,
      from: q.from,
      to: q.to
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}

export async function financialReportsTestFixtures(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const data = await buildTestFixtureRegister();
    res.json({ success: true, data });
  } catch (err) {
    if (mapClientError(err, res)) return;
    next(err);
  }
}

const exportWorkbookQuery = z.object({
  asOf: dateOnly,
  from: dateOnly,
  to: dateOnly
}).superRefine((q, ctx) => {
  if (q.from > q.to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must be <= to" });
  }
});

export async function financialReportsExportXlsx(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = exportWorkbookQuery.parse(req.query);
    const { buffer } = await buildFinancialStatementsWorkbook(q);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sarveda-financial-statements-${q.from}_${q.to}.xlsx"`
    );
    res.send(buffer);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}

const glExportQuery = z.object({
  accountCode: z.string().min(1).max(32),
  from: dateOnly,
  to: dateOnly
}).superRefine((q, ctx) => {
  if (q.from > q.to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must be <= to" });
  }
});

export async function financialReportsExportGlXlsx(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = glExportQuery.parse(req.query);
    const { buffer } = await buildGeneralLedgerWorkbook(q);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sarveda-gl-${q.accountCode}-${q.from}_${q.to}.xlsx"`
    );
    res.send(buffer);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}

const pdfKindQuery = z.object({
  kind: z.enum(["profit-loss", "balance-sheet", "trial-balance"]),
  asOf: dateOnly.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional()
}).superRefine((q, ctx) => {
  if (q.kind === "profit-loss") {
    if (!q.from || !q.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from and to required for P&L PDF" });
    } else if (q.from > q.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must be <= to" });
    }
  } else if (!q.asOf) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "asOf required for TB/BS PDF" });
  }
});

export async function financialReportsExportPdf(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireReports(req, res)) return;
    const q = pdfKindQuery.parse(req.query);
    let buffer: Buffer;
    let filename: string;
    if (q.kind === "profit-loss") {
      const out = await buildProfitLossPdf({ from: q.from!, to: q.to! });
      buffer = out.buffer;
      filename = `sarveda-profit-loss-${q.from}_${q.to}.pdf`;
    } else if (q.kind === "balance-sheet") {
      const out = await buildBalanceSheetPdf({ asOf: q.asOf! });
      buffer = out.buffer;
      filename = `sarveda-balance-sheet-${q.asOf}.pdf`;
    } else {
      const out = await buildTrialBalancePdf({ asOf: q.asOf! });
      buffer = out.buffer;
      filename = `sarveda-trial-balance-${q.asOf}.pdf`;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "INVALID_REPORT_QUERY",
        error: err.issues.map((i) => i.message).join("; ")
      });
      return;
    }
    if (mapClientError(err, res)) return;
    next(err);
  }
}
