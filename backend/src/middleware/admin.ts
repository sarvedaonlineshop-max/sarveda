import type { NextFunction, Request, Response } from "express";

import { prisma } from "../config/db";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "../utils/jwt";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
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
      select: { id: true, email: true, role: true, deletedAt: true }
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
    req.authUser = { id: user.id, email: user.email, role: user.role };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired session",
      code: "UNAUTHORIZED"
    });
  }
}
