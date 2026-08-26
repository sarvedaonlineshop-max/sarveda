import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AccountingError } from "./accounting-errors";
import { isAccountingBankReconciliationEnabled } from "./accounting-flag";
import { categorizeBankCharge } from "./bank-charge-posting.service";
import { categorizeBankInterest } from "./bank-interest-posting.service";
import {
  createBankReconciliation,
  getBankReconciliationById,
  listBankReconciliations,
  reconcileBankReconciliation,
  recomputeBankReconciliation,
  reopenBankReconciliation,
  updateReconciliationStatementBalances
} from "./bank-reconciliation.service";
import {
  ignoreStatementLine,
  markStatementLineUnknown
} from "./bank-statement-categorization.service";
import {
  getCodRemittanceDesignStub,
  getGatewayClearingControls
} from "./gateway-clearing-control.service";

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

const uuid = z.string().uuid();

export async function bankReconciliationStatus(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      success: true,
      data: { bankReconciliationEnabled: isAccountingBankReconciliationEnabled() }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankReconciliationCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({
        bankAccountId: uuid,
        periodStart: z.string().min(1),
        periodEnd: z.string().min(1),
        statementImportId: uuid.nullable().optional(),
        statementOpeningBalanceInPaise: z.number().int().nullable().optional(),
        statementClosingBalanceInPaise: z.number().int().nullable().optional(),
        notes: z.string().max(2000).nullable().optional()
      })
      .parse(req.body);
    const row = await createBankReconciliation({
      bankAccountId: body.bankAccountId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      statementImportId: body.statementImportId,
      statementOpeningBalanceInPaise: body.statementOpeningBalanceInPaise,
      statementClosingBalanceInPaise: body.statementClosingBalanceInPaise,
      notes: body.notes,
      userId: userId(req)
    });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankReconciliationList(req: Request, res: Response, next: NextFunction) {
  try {
    const bankAccountId = req.query.bankAccountId
      ? uuid.parse(req.query.bankAccountId)
      : undefined;
    const rows = await listBankReconciliations(bankAccountId);
    res.json({ success: true, data: { reconciliations: rows } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankReconciliationDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const row = await getBankReconciliationById(id);
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankReconciliationRecompute(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const row = await recomputeBankReconciliation(id);
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankReconciliationReconcile(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const row = await reconcileBankReconciliation({
      reconciliationId: id,
      userId: userId(req)
    });
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankReconciliationReopen(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const body = z.object({ reason: z.string().min(3).max(2000) }).parse(req.body);
    const row = await reopenBankReconciliation({
      reconciliationId: id,
      reason: body.reason,
      userId: userId(req)
    });
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankReconciliationUpdateBalances(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = uuid.parse(req.params.id);
    const body = z
      .object({
        statementOpeningBalanceInPaise: z.number().int().nullable().optional(),
        statementClosingBalanceInPaise: z.number().int().nullable().optional()
      })
      .parse(req.body);
    const row = await updateReconciliationStatementBalances({
      reconciliationId: id,
      ...body
    });
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementCategorizeCharge(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = z
      .object({ lineId: uuid, note: z.string().max(500).optional() })
      .parse(req.body);
    const result = await categorizeBankCharge({
      statementLineId: body.lineId,
      note: body.note,
      userId: userId(req)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementCategorizeInterest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = z
      .object({ lineId: uuid, note: z.string().max(500).optional() })
      .parse(req.body);
    const result = await categorizeBankInterest({
      statementLineId: body.lineId,
      note: body.note,
      userId: userId(req)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementIgnore(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({ lineId: uuid, reason: z.string().min(3).max(2000) })
      .parse(req.body);
    const row = await ignoreStatementLine({
      statementLineId: body.lineId,
      reason: body.reason,
      userId: userId(req)
    });
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function bankStatementMarkUnknown(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({ lineId: uuid, note: z.string().max(2000).optional() })
      .parse(req.body);
    const row = await markStatementLineUnknown({
      statementLineId: body.lineId,
      note: body.note,
      userId: userId(req)
    });
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function gatewayClearingControls(_req: Request, res: Response, next: NextFunction) {
  try {
    const controls = await getGatewayClearingControls();
    res.json({
      success: true,
      data: {
        controls,
        codRemittanceDesign: getCodRemittanceDesignStub()
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}
