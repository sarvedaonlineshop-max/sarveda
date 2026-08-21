import type { NextFunction, Request, Response } from "express";

import { prisma } from "../config/db";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "../utils/jwt";

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
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired session",
      code: "UNAUTHORIZED"
    });
  }
}
