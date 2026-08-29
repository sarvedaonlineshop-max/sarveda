import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";
import {
  cancelQuotation,
  createQuotation,
  displayExpiryState,
  generateProformaPdfBuffer,
  generateQuotePdfBuffer,
  getQuotation,
  listQuotations,
  markQuotationAccepted,
  markQuotationSent,
  searchQuoteCatalog,
  searchQuoteCustomers,
  updateQuotation
} from "./quotation.service";
import { quotationListQuerySchema, quotationUpsertSchema } from "./quotation.schemas";
import { computeQuotationTotals } from "./quotation-totals";

function fail(res: Response, status: number, error: string, code: string) {
  res.status(status).json({ success: false, error, code });
}

export async function quotationsList(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = quotationListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, 400, "Invalid query", "VALIDATION_ERROR");
      return;
    }
    const data = await listQuotations(parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function quotationsGet(req: Request, res: Response, next: NextFunction) {
  try {
    const q = await getQuotation(req.params.id);
    if (!q) {
      fail(res, 404, "Quotation not found", "NOT_FOUND");
      return;
    }
    res.json({
      success: true,
      data: {
        quotation: q,
        expiry: displayExpiryState(q.validUntil, q.status),
        convertToOrder: {
          available: false,
          reason:
            "Deferred — e-commerce Order conversion must use checkout/stock/payment paths. Use Quote/Proforma documents for V1."
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function quotationsPreviewTotals(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = quotationUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, parsed.error.issues.map((i) => i.message).join("; "), "VALIDATION_ERROR");
      return;
    }
    const body = parsed.data;
    const ship = body.shippingSameAsBilling ? body.billingAddress : body.shippingAddress;
    const totals = computeQuotationTotals({
      lines: body.lines,
      shippingInPaise: body.shippingInPaise ?? 0,
      headerDiscountInPaise: body.discountInPaise ?? 0,
      currency: body.currency ?? "INR",
      shippingAddress: ship
    });
    res.json({ success: true, data: totals });
  } catch (err) {
    next(err);
  }
}

export async function quotationsCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = quotationUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, parsed.error.issues.map((i) => i.message).join("; "), "VALIDATION_ERROR");
      return;
    }
    const quotation = await createQuotation(parsed.data);
    res.status(201).json({ success: true, data: { quotation }, message: "Quotation saved" });
  } catch (err) {
    next(err);
  }
}

export async function quotationsUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = quotationUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, parsed.error.issues.map((i) => i.message).join("; "), "VALIDATION_ERROR");
      return;
    }
    const returnToDraft = req.query.returnToDraft === "1" || req.body?.returnToDraft === true;
    const quotation = await updateQuotation(req.params.id, parsed.data, { returnToDraft });
    res.json({ success: true, data: { quotation }, message: "Quotation saved" });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      fail(res, e.statusCode, e.message, e.code ?? "ERROR");
      return;
    }
    next(err);
  }
}

export async function quotationsMarkSent(req: Request, res: Response, next: NextFunction) {
  try {
    const quotation = await markQuotationSent(req.params.id);
    res.json({ success: true, data: { quotation }, message: "Quotation issued" });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      fail(res, e.statusCode, e.message, e.code ?? "ERROR");
      return;
    }
    next(err);
  }
}

export async function quotationsMarkAccepted(req: Request, res: Response, next: NextFunction) {
  try {
    const quotation = await markQuotationAccepted(req.params.id);
    res.json({ success: true, data: { quotation }, message: "Quotation accepted" });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      fail(res, e.statusCode, e.message, e.code ?? "ERROR");
      return;
    }
    next(err);
  }
}

export async function quotationsCancel(req: Request, res: Response, next: NextFunction) {
  try {
    const quotation = await cancelQuotation(req.params.id);
    res.json({ success: true, data: { quotation }, message: "Quotation cancelled" });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      fail(res, e.statusCode, e.message, e.code ?? "ERROR");
      return;
    }
    next(err);
  }
}

export async function quotationsDownloadQuotePdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { pdf, quoteNumber } = await generateQuotePdfBuffer(req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quoteNumber.replace(/\//g, "-")}-quotation.pdf"`
    );
    res.send(pdf);
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      fail(res, e.statusCode, e.message, e.code ?? "ERROR");
      return;
    }
    next(err);
  }
}

export async function quotationsDownloadProformaPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { pdf, quoteNumber } = await generateProformaPdfBuffer(req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quoteNumber.replace(/\//g, "-")}-proforma.pdf"`
    );
    res.send(pdf);
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      fail(res, e.statusCode, e.message, e.code ?? "ERROR");
      return;
    }
    next(err);
  }
}

export async function quotationsCatalogSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const data = await searchQuoteCatalog(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function quotationsCustomerSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const data = await searchQuoteCustomers(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** Safety probe: quote create must not create accounting journals. */
export async function quotationsAccountingSafetyProbe(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const before = await prisma.accountingJournalEntry.count();
    res.json({
      success: true,
      data: {
        journalCount: before,
        note: "Quotations never write journals; use tests for create/proforma isolation."
      }
    });
  } catch (err) {
    next(err);
  }
}
