/**
 * Phase 7B — admin opening balance handlers.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AccountingError, AccountingOpeningBalanceDisabledError } from "./accounting-errors";
import {
  isAccountingOpeningBalanceEnabled,
  isNativeAccountingEnabled
} from "./accounting-flag";
import {
  createOpeningBatch,
  getOpeningBatch,
  listOpeningBatches,
  markOpeningBatchValidated,
  postOpeningBatch,
  previewOpeningBatchPost,
  replaceOpeningStaging
} from "./opening-batch.service";
import {
  buildOpeningReviewWorkbook,
  buildOpeningTemplateXlsx,
  mapImportRowsToStaging,
  parseOpeningImportFile,
  type OpeningImportKind
} from "./opening-import.service";
import { loadOpeningBatchGraph } from "./opening-validation.service";
import { isProductionLikeEnvironment } from "./production-guard";

function handleAccountingError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof AccountingError) {
    res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    return;
  }
  if (err instanceof Error && err.message.includes("ACCOUNTING_OPENING_BALANCE_ENABLED")) {
    const e = new AccountingOpeningBalanceDisabledError();
    res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    return;
  }
  next(err);
}

function assertOpeningMutationsEnabled(): void {
  if (!isAccountingOpeningBalanceEnabled()) {
    throw new AccountingOpeningBalanceDisabledError();
  }
}

const openingKindSchema = z.enum([
  "sku_mapping",
  "inventory",
  "bank",
  "gateway",
  "ap",
  "ar",
  "gst",
  "equity"
]);

const createBatchSchema = z.object({
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(500).optional(),
  source: z.string().max(64).optional(),
  arApprovedZero: z.boolean().optional()
});

const stagingSchema = z.object({
  skuMappings: z
    .array(
      z.object({
        newSarvedaSku: z.string().min(1),
        legacySku: z.string().nullable().optional(),
        productName: z.string().nullable().optional(),
        variantLabel: z.string().nullable().optional(),
        matchStatus: z.enum(["EXACT", "MANUAL_MATCH", "NEW_SKU", "LEGACY_ONLY", "UNKNOWN"]),
        openingQty: z.number().int().min(0),
        unitCostInPaise: z.number().int().min(0),
        source: z.string().nullable().optional(),
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
        notes: z.string().nullable().optional()
      })
    )
    .optional(),
  inventoryLines: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().min(0),
        unitCostInPaise: z.number().int().min(0),
        source: z.string().nullable().optional(),
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
      })
    )
    .optional(),
  bankLines: z
    .array(
      z.object({
        name: z.string().min(1),
        bankName: z.string().nullable().optional(),
        maskedAccountNumber: z.string().nullable().optional(),
        ifsc: z.string().nullable().optional(),
        accountType: z.string().optional(),
        glAccountCode: z.string().min(1),
        openingBookBalanceInPaise: z.number().int(),
        statementBalanceInPaise: z.number().int().nullable().optional(),
        source: z.string().nullable().optional(),
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
      })
    )
    .optional(),
  gatewayLines: z
    .array(
      z.object({
        provider: z.string().min(1),
        glAccountCode: z.string().min(1),
        unsettledAmountInPaise: z.number().int(),
        direction: z.string().optional(),
        sourceReference: z.string().nullable().optional(),
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
      })
    )
    .optional(),
  apLines: z
    .array(
      z.object({
        vendorName: z.string().min(1),
        vendorId: z.string().uuid().nullable().optional(),
        billNumber: z.string().min(1),
        billDate: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        outstandingInPaise: z.number().int().min(0),
        gstComponentInPaise: z.number().int().optional(),
        tdsInPaise: z.number().int().optional(),
        currency: z.string().optional(),
        reference: z.string().nullable().optional(),
        source: z.string().nullable().optional(),
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
      })
    )
    .optional(),
  arLines: z
    .array(
      z.object({
        customerName: z.string().min(1),
        customerId: z.string().uuid().nullable().optional(),
        invoiceReference: z.string().min(1),
        invoiceDate: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        outstandingInPaise: z.number().int().min(0),
        currency: z.string().optional(),
        source: z.string().nullable().optional(),
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
      })
    )
    .optional(),
  gstLines: z
    .array(
      z.object({
        accountCode: z.string().min(1),
        balanceInPaise: z.number().int(),
        source: z.string().nullable().optional(),
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
      })
    )
    .optional(),
  equityLines: z
    .array(
      z.object({
        accountCode: z.string().min(1),
        amountInPaise: z.number().int(),
        reason: z.string().nullable().optional(),
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
      })
    )
    .optional(),
  arApprovedZero: z.boolean().optional(),
  equity3900Reason: z.string().nullable().optional(),
  equity3900Reviewer: z.string().nullable().optional(),
  equity3900Approved: z.boolean().optional()
});

export async function openingStatus(_req: Request, res: Response) {
  const posted = await listOpeningBatches(1).then((rows) =>
    rows.find((b) => b.status === "POSTED")
  );
  res.json({
    success: true,
    data: {
      nativeAccountingEnabled: isNativeAccountingEnabled(),
      openingBalanceEnabled: isAccountingOpeningBalanceEnabled(),
      productionLike: isProductionLikeEnvironment(),
      postedOpeningBatch: posted
        ? { id: posted.id, batchNumber: posted.batchNumber, postedAt: posted.postedAt }
        : null,
      resetNotice: "Accounting reset must be performed by authorized operations.",
      cutoverReady: isNativeAccountingEnabled() && !isAccountingOpeningBalanceEnabled()
    }
  });
}

export async function openingBatchList(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const batches = await listOpeningBatches(limit);
    res.json({ success: true, data: batches });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingBatchCreate(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const parsed = createBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    const batch = await createOpeningBatch({ ...parsed.data, createdByUserId: userId });
    res.status(201).json({ success: true, data: batch });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingBatchGet(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const batch = await getOpeningBatch(req.params.id!);
    if (!batch) {
      res.status(404).json({ success: false, error: "Opening batch not found", code: "OPENING_BATCH_NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: batch });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingBatchStaging(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const parsed = stagingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid staging body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const batch = await replaceOpeningStaging(req.params.id!, parsed.data);
    res.json({ success: true, data: batch });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingBatchValidate(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const result = await markOpeningBatchValidated(req.params.id!);
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingBatchPreview(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const data = await previewOpeningBatchPost(req.params.id!);
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingBatchPost(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    const data = await postOpeningBatch(req.params.id!, { postedByUserId: userId });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingTemplateGet(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const parsed = openingKindSchema.safeParse(req.params.kind);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid template kind", code: "VALIDATION_ERROR" });
      return;
    }
    const buf = await buildOpeningTemplateXlsx(parsed.data as OpeningImportKind);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sarveda-opening-${parsed.data}-template.xlsx"`
    );
    res.send(buf);
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingBatchImport(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    assertOpeningMutationsEnabled();
    const kindParsed = openingKindSchema.safeParse(req.params.kind);
    if (!kindParsed.success) {
      res.status(400).json({ success: false, error: "Invalid import kind", code: "VALIDATION_ERROR" });
      return;
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file?.buffer) {
      res.status(400).json({ success: false, error: "CSV or XLSX file required", code: "VALIDATION_ERROR" });
      return;
    }

    const preview = await parseOpeningImportFile({
      kind: kindParsed.data as OpeningImportKind,
      buffer: file.buffer,
      filename: file.originalname
    });

    if (preview.errors.some((e) => e.code === "FORMULA_INJECTION")) {
      res.status(400).json({
        success: false,
        error: "Formula injection detected in import file",
        code: "OPENING_IMPORT_FORMULA_INJECTION",
        data: preview
      });
      return;
    }

    const existing = await loadOpeningBatchGraph(req.params.id!);
    if (!existing) {
      res.status(404).json({ success: false, error: "Opening batch not found", code: "OPENING_BATCH_NOT_FOUND" });
      return;
    }

    const staging = mapImportRowsToStaging(kindParsed.data as OpeningImportKind, preview.rows, existing);
    const batch = await replaceOpeningStaging(req.params.id!, staging);

    res.json({
      success: true,
      data: { preview, batch }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function openingBatchExportReview(req: Request, res: Response, next: NextFunction) {
  try {
    assertOpeningMutationsEnabled();
    const buf = await buildOpeningReviewWorkbook(req.params.id!);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sarveda-opening-review-${req.params.id}.xlsx"`
    );
    res.send(buf);
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}
