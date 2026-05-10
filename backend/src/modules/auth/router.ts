import type { NextFunction, Request, Response } from "express";
import express from "express";
import passport from "passport";
import type { Profile } from "passport-google-oauth20";

import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { setAuthCookie } from "../../utils/jwt";
import { googleOAuthConfigured } from "./passport";
import {
  getMe,
  loginUser,
  logoutUser,
  registerUser,
  sendOtp,
  upsertGoogleUser,
  verifyOtpAndLogin
} from "./service";
import { loginSchema, registerSchema, sendOtpSchema, verifyOtpSchema } from "./schemas";

const frontendBase =
  process.env.FRONTEND_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

export const authRouter = express.Router();

authRouter.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await registerUser(req.body);
    res.status(201).json({ success: true, data: { user } });
  })
);

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await loginUser(res, req.body);
    res.json({ success: true, data: { user } });
  })
);

authRouter.post("/logout", (_req, res) => {
  logoutUser(res);
  res.json({ success: true, message: "Logged out" });
});

authRouter.post(
  "/send-otp",
  validateBody(sendOtpSchema),
  asyncHandler(async (req, res) => {
    await sendOtp(req.body);
    res.json({ success: true, message: "OTP sent" });
  })
);

authRouter.post(
  "/verify-otp",
  validateBody(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const user = await verifyOtpAndLogin(res, req.body);
    res.json({ success: true, data: { user } });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getMe(req.authUser!.id);
    res.json({ success: true, data: { user } });
  })
);

authRouter.get("/google", (req, res, next) => {
  if (!googleOAuthConfigured()) {
    res.status(503).json({
      success: false,
      error: "Google sign-in is not configured",
      code: "GOOGLE_NOT_CONFIGURED"
    });
    return;
  }
  passport.authenticate("google", {
    scope: ["email", "profile"],
    session: false,
    prompt: "select_account"
  })(req, res, next);
});

authRouter.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${frontendBase}/login?error=google`
  }),
  asyncHandler(async (req, res) => {
    const profile = req.user as Profile | undefined;
    if (!profile?.id) {
      res.redirect(`${frontendBase}/login?error=google_profile`);
      return;
    }
    const user = await upsertGoogleUser({
      id: profile.id,
      emails: profile.emails,
      displayName: profile.displayName ?? undefined
    });
    setAuthCookie(res, { sub: user.id, email: user.email, role: user.role });
    res.redirect(`${frontendBase}/`);
  })
);
