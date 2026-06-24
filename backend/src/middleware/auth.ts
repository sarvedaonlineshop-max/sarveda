import type { NextFunction, Request, Response } from "express";

import { AUTH_COOKIE_NAME, verifyAccessToken } from "../utils/jwt";

function getAuthToken(req: Request): string | undefined {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  return req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getAuthToken(req);
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
    const token = getAuthToken(req);
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
