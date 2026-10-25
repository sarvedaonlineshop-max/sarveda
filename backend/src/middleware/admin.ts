import type { NextFunction, Request, Response } from "express";

import { prisma } from "../config/db";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "../utils/jwt";

/** Store-reports-only admins. Keep in sync with frontend/lib/reports-only-access.ts */
const REPORTS_ONLY_ADMIN_EMAILS = new Set([
  "astha@sarveda.com",
  "rahul@sarveda.com"
]);

export function isReportsOnlyAdminEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return normalized.length > 0 && REPORTS_ONLY_ADMIN_EMAILS.has(normalized);
}

function reportsOnlyRequestAllowed(req: Request): boolean {
  const path = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
  return req.method === "GET" && path === "/api/admin/reports/export";
}

/** Accept Bearer (mobile) or session cookie (web admin). */
function getAdminToken(req: Request): string | undefined {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  return req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getAdminToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated",
        code: "UNAUTHORIZED"
      });
    }
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, name: true, deletedAt: true }
    });
    if (!user || user.deletedAt) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated",
        code: "UNAUTHORIZED"
      });
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Admin access required",
        code: "FORBIDDEN"
      });
    }
    req.authUser = { id: user.id, email: user.email, role: user.role, name: user.name ?? undefined };
    if (isReportsOnlyAdminEmail(user.email) && !reportsOnlyRequestAllowed(req)) {
      return res.status(403).json({
        success: false,
        error: "This account can only download store reports",
        code: "FORBIDDEN"
      });
    }
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired session",
      code: "UNAUTHORIZED"
    });
  }
}
