import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AccountingError } from "./accounting-errors";
import { isAccountingBankStatementImportEnabled } from "./accounting-flag";
import {
  commitBankStatementImport,
  getBankStatementImportById,
  listBankStatementImports,
  listBankStatementLines,
  previewBankStatementImport
} from "./bank-statement-import.service";
import {
  confirmStatementMatch,
  getStatementLineCandidates,
  rejectStatementCandidate,
  runStatementMatchingForImport,
  unmatchStatementLine
} from "./bank-statement-matching.service";

function handleAccountingError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof AccountingError) {
    res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    return;
  }
  next(err);
}

function userId(req: Request): string | undefined {
  const u = (req as Request & { authUser?: { id?: string } }).authUser;
  return u?.id;
}

const importIdSchema = z.object({ importId: z.string().uuid() });
const lineIdSchema = z.object({ lineId: z.string().uuid() });

const matchConfirmSchema = z.object({
  lineId: z.string().uuid(),
  journalEntryId: z.string().uuid(),
  note: z.string().max(500).optional()
});

export async function bankStatementImportStatus(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      success: true,
      data: { statementImportEnabled: isAccountingBankStatementImportEnabled() }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const bankAccountId = z.string().uuid().parse(req.body.bankAccountId ?? req.query.bankAccountId);
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ success: false, error: "Statement file required", code: "FILE_REQUIRED" });
      return;
    }
    const preview = await previewBankStatementImport({
      bankAccountId,
      fileName: file.originalname,
      buffer: file.buffer
    });
    res.json({ success: true, data: preview });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementCommit(req: Request, res: Response, next: NextFunction) {
  try {
    const bankAccountId = z.string().uuid().parse(req.body.bankAccountId ?? req.query.bankAccountId);
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ success: false, error: "Statement file required", code: "FILE_REQUIRED" });
      return;
    }
    const result = await commitBankStatementImport({
      bankAccountId,
      fileName: file.originalname,
      buffer: file.buffer,
      importedByUserId: userId(req)
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementImportList(req: Request, res: Response, next: NextFunction) {
  try {
    const bankAccountId = req.query.bankAccountId
      ? z.string().uuid().parse(req.query.bankAccountId)
      : undefined;
    const rows = await listBankStatementImports(bankAccountId);
    res.json({ success: true, data: { imports: rows } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementImportDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { importId } = importIdSchema.parse(req.params);
    const row = await getBankStatementImportById(importId);
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementLineList(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z
      .object({
        importId: z.string().uuid().optional(),
        bankAccountId: z.string().uuid().optional(),
        matchStatus: z.string().optional(),
        limit: z.coerce.number().int().positive().max(500).optional()
      })
      .parse(req.query);
    const lines = await listBankStatementLines(q);
    res.json({ success: true, data: { lines } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementLineCandidates(req: Request, res: Response, next: NextFunction) {
  try {
    const { lineId } = lineIdSchema.parse(req.params);
    const line = await getStatementLineCandidates(lineId);
    res.json({ success: true, data: line });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementMatchConfirm(req: Request, res: Response, next: NextFunction) {
  try {
    const body = matchConfirmSchema.parse(req.body);
    const line = await confirmStatementMatch({
      lineId: body.lineId,
      journalEntryId: body.journalEntryId,
      userId: userId(req),
      note: body.note
    });
    res.json({ success: true, data: line });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementUnmatch(req: Request, res: Response, next: NextFunction) {
  try {
    const { lineId } = lineIdSchema.parse(req.body);
    const result = await unmatchStatementLine({ lineId, userId: userId(req) });
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementRejectCandidate(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({ lineId: z.string().uuid(), matchId: z.string().uuid() })
      .parse(req.body);
    const result = await rejectStatementCandidate({
      lineId: body.lineId,
      matchId: body.matchId,
      userId: userId(req)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementRerunMatching(req: Request, res: Response, next: NextFunction) {
  try {
    const { importId } = importIdSchema.parse(req.params);
    await runStatementMatchingForImport(importId);
    const row = await getBankStatementImportById(importId);
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}
