import type { NextFunction, Request, Response } from "express";

import { AUTH_COOKIE_NAME, verifyAccessToken } from "../utils/jwt";

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    if (token) {
      const payload = verifyAccessToken(token);
      req.authUser = { id: payload.sub, email: payload.email, role: payload.role };
    }
  } catch {
    // Guest submission — ignore invalid session cookie
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
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
    req.authUser = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired session",
      code: "UNAUTHORIZED"
    });
  }
}
