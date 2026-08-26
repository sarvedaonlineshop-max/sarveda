import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AccountingError } from "./accounting-errors";
import {
  isAccountingBankingEnabled,
  isAccountingBankReconciliationEnabled,
  isAccountingBankStatementImportEnabled
} from "./accounting-flag";
import {
  BANK_OPENING_BALANCE_CALC_VERSION,
  BANK_TRANSFER_MADE_CALC_VERSION
} from "./bank-account.constants";
import {
  createBankAccount,
  deactivateBankAccount,
  getBankAccountById,
  listBankAccounts,
  updateBankAccountMetadata
} from "./bank-account.service";
import { getLatestImportedStatementBalance } from "./bank-statement-import.service";
import { getLatestReconciliationSummary } from "./bank-reconciliation.service";
import { getGatewayClearingControls } from "./gateway-clearing-control.service";
import {
  postBankOpeningBalance,
  previewBankOpeningBalance
} from "./bank-opening-posting.service";
import {
  postBankTransfer,
  previewBankTransfer
} from "./bank-transfer-posting.service";
import {
  createBankTransferDraft,
  deleteBankTransferDraft,
  listBankTransfers,
  updateBankTransferDraft
} from "./bank-transfer.service";

function handleAccountingError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof AccountingError) {
    res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    return;
  }
  next(err);
}

const bankAccountTypeSchema = z.enum(["BANK", "CASH", "PETTY_CASH"]);
const transferKindSchema = z.enum(["INTERNAL_TRANSFER", "CASH_DEPOSIT", "CASH_WITHDRAWAL"]);

const bankAccountCreateSchema = z.object({
  name: z.string().min(1).max(200),
  bankName: z.string().max(200).nullable().optional(),
  maskedAccountNumber: z.string().max(32).nullable().optional(),
  ifsc: z.string().max(16).nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  glAccountCode: z.string().min(1).max(16),
  accountType: bankAccountTypeSchema,
  isDefault: z.boolean().optional(),
  statementImportEnabled: z.boolean().optional(),
  razorpaySettlementTarget: z.boolean().optional(),
  createGlIfMissing: z.boolean().optional()
});

const bankAccountUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  bankName: z.string().max(200).nullable().optional(),
  maskedAccountNumber: z.string().max(32).nullable().optional(),
  ifsc: z.string().max(16).nullable().optional(),
  isDefault: z.boolean().optional(),
  statementImportEnabled: z.boolean().optional(),
  razorpaySettlementTarget: z.boolean().optional()
});

const transferCreateSchema = z.object({
  transferDate: z.string().min(1),
  amountInPaise: z.number().int().positive(),
  currency: z.string().min(1).max(8).optional(),
  transferKind: transferKindSchema,
  sourceBankAccountId: z.string().uuid(),
  destinationBankAccountId: z.string().uuid(),
  reference: z.string().max(128).nullable().optional(),
  memo: z.string().max(2000).nullable().optional()
});

const transferUpdateSchema = transferCreateSchema.partial().omit({ currency: true });

const transferIdSchema = z.object({ transferId: z.string().uuid() });

const openingPreviewSchema = z.object({
  bankAccountId: z.string().uuid(),
  openingAmountInPaise: z.number().int().refine((n) => n !== 0),
  openingDate: z.string().min(1)
});

function serializeBankAccount(row: Awaited<ReturnType<typeof getBankAccountById>>) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    bookBalanceLabel: "BOOK BALANCE"
  };
}

export async function accountingBankingDashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    const accounts = await listBankAccounts({ includeInactive: true });
    const enriched = [];
    for (const a of accounts) {
      const latestStatementBalanceInPaise =
        a.accountType === "BANK" ? await getLatestImportedStatementBalance(a.id) : null;
      const recon =
        a.accountType === "BANK" ? await getLatestReconciliationSummary(a.id) : null;
      enriched.push({
        id: a.id,
        name: a.name,
        glAccountCode: a.glAccountCode,
        accountType: a.accountType,
        isActive: a.isActive,
        isDefault: a.isDefault,
        razorpaySettlementTarget: a.razorpaySettlementTarget,
        maskedAccountNumber: a.maskedAccountNumber,
        bookBalanceInPaise: a.bookBalanceInPaise,
        bookBalanceLabel: "BOOK BALANCE",
        latestStatementBalanceInPaise,
        latestStatementBalanceLabel: "LATEST IMPORTED STATEMENT BALANCE",
        reconciliationDifferenceInPaise: recon?.differenceInPaise ?? null,
        reconciliationStatus: recon?.status ?? null,
        unmatchedCount: recon?.unmatchedCount ?? 0,
        reviewRequiredCount: recon?.reviewRequiredCount ?? 0,
        lastReconciliationAt: recon?.reconciledAt?.toISOString() ?? null,
        latestStatementPeriodEnd: recon?.periodEnd?.toISOString().slice(0, 10) ?? null
      });
    }
    const gatewayControls = await getGatewayClearingControls();
    res.json({
      success: true,
      data: {
        bankingEnabled: isAccountingBankingEnabled(),
        statementImportEnabled: isAccountingBankStatementImportEnabled(),
        bankReconciliationEnabled: isAccountingBankReconciliationEnabled(),
        accounts: enriched,
        gatewayControls
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankAccountList(req: Request, res: Response, next: NextFunction) {
  try {
    const includeInactive = req.query.includeInactive === "1" || req.query.includeInactive === "true";
    const rows = await listBankAccounts({ includeInactive });
    res.json({
      success: true,
      data: { accounts: rows.map(serializeBankAccount) }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankAccountGet(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getBankAccountById(String(req.params.id));
    res.json({ success: true, data: serializeBankAccount(row) });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankAccountCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = bankAccountCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const row = await createBankAccount({
      ...parsed.data,
      createdByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.status(201).json({ success: true, data: serializeBankAccount(row) });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankAccountUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = bankAccountUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const row = await updateBankAccountMetadata(String(req.params.id), {
      ...parsed.data,
      actorUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data: serializeBankAccount(row) });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankAccountDeactivate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const row = await deactivateBankAccount(
      String(req.params.id),
      (req as { authUser?: { id?: string } }).authUser?.id
    );
    res.json({ success: true, data: row });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankTransferList(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await listBankTransfers({ limit, status });
    res.json({
      success: true,
      data: {
        transfers: rows.map((t) => ({
          ...t,
          transferDate: t.transferDate.toISOString().slice(0, 10),
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString()
        }))
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankTransferCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = transferCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const transfer = await createBankTransferDraft({
      ...parsed.data,
      transferDate: new Date(parsed.data.transferDate),
      createdByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.status(201).json({ success: true, data: transfer });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankTransferUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = transferUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const transfer = await updateBankTransferDraft(String(req.params.id), {
      ...parsed.data,
      transferDate: parsed.data.transferDate ? new Date(parsed.data.transferDate) : undefined
    });
    res.json({ success: true, data: transfer });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankTransferDelete(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteBankTransferDraft(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankTransferPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = transferIdSchema.safeParse(req.body ?? { transferId: req.params.id });
    const transferId = parsed.success ? parsed.data.transferId : String(req.params.id);
    const preview = await previewBankTransfer(transferId);
    res.json({
      success: true,
      data: {
        calcVersion: BANK_TRANSFER_MADE_CALC_VERSION,
        ...preview,
        snapshot: {
          ...preview.snapshot,
          transferDate: preview.snapshot.transferDate.toISOString().slice(0, 10),
          updatedAt: preview.snapshot.updatedAt.toISOString()
        }
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankTransferPost(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = transferIdSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "transferId required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await postBankTransfer(parsed.data.transferId, {
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({
      success: true,
      data: {
        duplicate: result.duplicate,
        proposal: result.proposal,
        journal: {
          id: result.journal.id,
          entryNumber: result.journal.entryNumber,
          status: result.journal.status
        }
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankOpeningPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = openingPreviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const data = await previewBankOpeningBalance(
      parsed.data.bankAccountId,
      parsed.data.openingAmountInPaise,
      new Date(parsed.data.openingDate)
    );
    res.json({
      success: true,
      data: {
        calcVersion: BANK_OPENING_BALANCE_CALC_VERSION,
        ...data,
        proposal: {
          ...data.proposal,
          accountingDate: data.proposal.accountingDate.toISOString().slice(0, 10)
        }
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingBankOpeningPost(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = openingPreviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await postBankOpeningBalance(parsed.data.bankAccountId, {
      openingAmountInPaise: parsed.data.openingAmountInPaise,
      openingDate: new Date(parsed.data.openingDate),
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({
      success: true,
      data: {
        duplicate: result.duplicate,
        journal: {
          id: result.journal.id,
          entryNumber: result.journal.entryNumber,
          status: result.journal.status
        }
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}
