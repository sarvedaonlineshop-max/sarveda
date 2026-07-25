import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import {
  adminActivityDashboard,
  listAdminActivity
} from "../../middleware/adminActivity";

export async function activityDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const data = await adminActivityDashboard(days);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function activityList(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(30),
        actorUserId: z.string().uuid().optional(),
        resource: z.string().max(64).optional(),
        action: z.string().max(32).optional(),
        q: z.string().max(120).optional()
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid query",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const data = await listAdminActivity(parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
