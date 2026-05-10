import type { NextFunction, Request, Response } from "express";

import { AUTH_COOKIE_NAME, verifyAccessToken } from "../utils/jwt";

/**
 * Attach req.authUser when a valid auth cookie is present; otherwise continue without user.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    if (token) {
      const payload = verifyAccessToken(token);
      req.authUser = { id: payload.sub, email: payload.email, role: payload.role };
    }
  } catch {
    /* no session */
  }
  next();
}
