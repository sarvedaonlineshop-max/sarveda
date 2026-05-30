import type { NextFunction, Request, Response } from "express";
import express from "express";
import passport from "passport";
import type { Profile } from "passport-google-oauth20";

import { prisma } from "../../config/db";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { setAuthCookie } from "../../utils/jwt";
import { googleOAuthConfigured } from "./passport";
import {
  getPrimaryFrontendBase,
  OAUTH_NEXT_COOKIE,
  postOAuthFrontendPath,
  safeRelativeRedirect
} from "./redirect";
import {
  getMe,
  loginUser,
  logoutUser,
  registerUser,
  sendOtp,
  upsertGoogleUser,
  updateProfile,
  verifyOtpAndLogin
} from "./service";
import { loginSchema, registerSchema, sendOtpSchema, updateProfileSchema, verifyOtpSchema } from "./schemas";

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
    const auth = req.authUser;
    if (!auth?.id) {
      res.status(401).json({ success: false, error: "Not authenticated", code: "UNAUTHORIZED" });
      return;
    }
    const user = await getMe(auth.id);
    const jwtRole = (auth.role ?? "").trim().toUpperCase();
    const dbRole = user.role.trim().toUpperCase();
    if (jwtRole !== dbRole) {
      setAuthCookie(res, { sub: user.id, email: user.email, role: user.role });
    }
    res.json({ success: true, data: { user } });
  })
);

authRouter.patch(
  "/me",
  requireAuth,
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await updateProfile(req.authUser!.id, req.body);
    res.json({ success: true, data: { user } });
  })
);

authRouter.get(
  "/me/enrollments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.enrollment.findMany({
      where: { userId: req.authUser!.id },
      include: { course: { select: { slug: true, title: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json({
      success: true,
      data: rows.map((r) => ({
        slug: r.course.slug,
        title: r.course.title,
        enrolledAt: r.createdAt.toISOString()
      }))
    });
  })
);

authRouter.get(
  "/me/bookings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.booking.findMany({
      where: { userId: req.authUser!.id },
      include: { event: { select: { slug: true, title: true, startDate: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json({
      success: true,
      data: rows.map((r) => ({
        slug: r.event.slug,
        title: r.event.title,
        startDate: r.event.startDate.toISOString(),
        bookedAt: r.createdAt.toISOString()
      }))
    });
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
  const nextPath =
    typeof req.query.next === "string" ? req.query.next : "/my-account";
  const secure = process.env.NODE_ENV === "production";
  res.cookie(OAUTH_NEXT_COOKIE, safeRelativeRedirect(nextPath, "/my-account"), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/"
  });
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
    failureRedirect: `${getPrimaryFrontendBase()}/login?error=google`
  }),
  asyncHandler(async (req, res) => {
    const profile = req.user as Profile | undefined;
    const frontendBase = getPrimaryFrontendBase();
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
    const rawNext = req.cookies?.[OAUTH_NEXT_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_NEXT_COOKIE, { path: "/" });
    const destination = postOAuthFrontendPath(user.role, rawNext);
    res.redirect(`${frontendBase}${destination}`);
  })
);
