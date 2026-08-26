import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import {
  isAccountingGstEnabled,
  isAccountingItcVerificationEnabled
} from "./accounting-flag";
import { discoverItcEvidence } from "./itc-discovery.service";
import {
  ItcTransitionError,
  blockItcEvidence,
  buildItcSummary,
  getItcEvidenceById,
  listItcEvidence,
  markItcDataGap,
  verifyItcEvidence
} from "./itc.service";
import { ITC_SOURCE_TYPES, ITC_STATUSES } from "./itc.constants";

function userId(req: Request): string | undefined {
  return (req as Request & { authUser?: { id?: string } }).authUser?.id;
}

function requireItc(_req: Request, res: Response): boolean {
  if (!isAccountingGstEnabled()) {
    res.status(503).json({
      success: false,
      code: "ACCOUNTING_GST_DISABLED",
      error: "Set ACCOUNTING_GST_ENABLED=1 (and NATIVE_ACCOUNTING_ENABLED=1)"
    });
    return false;
  }
  if (!isAccountingItcVerificationEnabled()) {
    res.status(503).json({
      success: false,
      code: "ACCOUNTING_ITC_VERIFICATION_DISABLED",
      error: "Set ACCOUNTING_ITC_VERIFICATION_ENABLED=1 to enable ITC verification"
    });
    return false;
  }
  return true;
}

function mapTransitionError(err: unknown, res: Response): boolean {
  if (err instanceof ItcTransitionError) {
    const status = err.code === "NOT_FOUND" ? 404 : 400;
    res.status(status).json({ success: false, code: err.code, error: err.message });
    return true;
  }
  return false;
}

export async function itcSummary(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireItc(req, res)) return;
    const q = z.object({ month: z.string().optional() }).parse(req.query);
    const data = await buildItcSummary(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function itcList(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireItc(req, res)) return;
    const q = z
      .object({
        status: z.enum(ITC_STATUSES).optional(),
        sourceType: z.enum(ITC_SOURCE_TYPES).optional(),
        vendor: z.string().optional(),
        month: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional()
      })
      .parse(req.query);
    const data = await listItcEvidence({
      status: q.status,
      sourceType: q.sourceType,
      vendorQuery: q.vendor,
      month: q.month,
      limit: q.limit,
      offset: q.offset
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function itcGet(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireItc(req, res)) return;
    const id = z.string().uuid().parse(req.params.id);
    const row = await getItcEvidenceById(id);
    if (!row) {
      res.status(404).json({ success: false, code: "NOT_FOUND", error: "ITC evidence not found" });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function itcDiscover(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireItc(req, res)) return;
    const body = z
      .object({
        sourceType: z.enum([...ITC_SOURCE_TYPES, "ALL"] as const).optional(),
        limit: z.number().int().min(1).max(500).optional()
      })
      .parse(req.body ?? {});
    const data = await discoverItcEvidence({
      sourceType: body.sourceType,
      limit: body.limit
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function itcVerify(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireItc(req, res)) return;
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ reason: z.string().min(1).max(2000) }).parse(req.body ?? {});
    const data = await verifyItcEvidence({
      evidenceId: id,
      actorUserId: userId(req),
      reason: body.reason
    });
    res.json({ success: true, data });
  } catch (err) {
    if (mapTransitionError(err, res)) return;
    next(err);
  }
}

export async function itcBlock(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireItc(req, res)) return;
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ reason: z.string().min(1).max(2000) }).parse(req.body ?? {});
    const data = await blockItcEvidence({
      evidenceId: id,
      actorUserId: userId(req),
      reason: body.reason
    });
    res.json({ success: true, data });
  } catch (err) {
    if (mapTransitionError(err, res)) return;
    next(err);
  }
}

export async function itcMarkDataGap(req: Request, res: Response, next: NextFunction) {
  try {
    if (!requireItc(req, res)) return;
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ reason: z.string().min(1).max(2000) }).parse(req.body ?? {});
    const data = await markItcDataGap({
      evidenceId: id,
      actorUserId: userId(req),
      reason: body.reason
    });
    res.json({ success: true, data });
  } catch (err) {
    if (mapTransitionError(err, res)) return;
    next(err);
  }
}
