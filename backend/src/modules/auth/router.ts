import type { NextFunction, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
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
import { requestPasswordReset, resetPassword } from "./passwordReset.service";
import { loginSchema, registerSchema, sendOtpSchema, updateProfileSchema, verifyOtpSchema } from "./schemas";

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

export const authRouter = express.Router();

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Too many OTP requests. Please wait 10 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as { email?: string; phone?: string };
    const identifier = body.email ?? body.phone ?? "";
    return `${req.ip}:${identifier}`;
  }
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many failed attempts. Please request a new OTP." },
  standardHeaders: true,
  legacyHeaders: false
});

const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: "Too many reset requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 admin login attempts per 15 min
  message: {
    error: "Too many login attempts. Try again in 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as { email?: string };
    return `admin-login:${req.ip}:${body.email ?? ""}`;
  }
});

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
  async (req, res, next) => {
    // Customers and admins share the same login endpoint; apply the stricter limiter only for admin roles.
    const body = req.body as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email) return next();

    const user = await prisma.user.findUnique({
      where: { email },
      select: { role: true, deletedAt: true }
    });

    const isAdmin =
      !!user &&
      !user.deletedAt &&
      (user.role === "ADMIN" || user.role === "SUPER_ADMIN");

    if (!isAdmin) return next();
    return adminLoginLimiter(req, res, next);
  },
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
  otpLimiter,
  validateBody(sendOtpSchema),
  asyncHandler(async (req, res) => {
    await sendOtp(req.body);
    res.json({ success: true, message: "OTP sent" });
  })
);

authRouter.post(
  "/verify-otp",
  otpVerifyLimiter,
  validateBody(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const user = await verifyOtpAndLogin(res, req.body);
    res.json({ success: true, data: { user } });
  })
);

authRouter.post(
  "/forgot-password",
  resetRequestLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      res.status(400).json({ success: false, error: "Email is required", code: "VALIDATION_ERROR" });
      return;
    }
    await requestPasswordReset(email.trim());
    res.json({
      success: true,
      message: "If this email exists, a reset link has been sent."
    });
  })
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) {
      res.status(400).json({
        success: false,
        error: "Token and password required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    await resetPassword(token, password);
    res.json({
      success: true,
      message: "Password reset successfully. You can now log in."
    });
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
  "/me/addresses",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.address.findMany({
      where: { userId: req.authUser!.id },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }]
    });
    res.json({ success: true, data: { items: rows } });
  })
);

authRouter.get(
  "/me/enrollments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.enrollment.findMany({
      where: { userId: req.authUser!.id, status: "ACTIVE" },
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
      where: { userId: req.authUser!.id, status: "ACTIVE" },
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
