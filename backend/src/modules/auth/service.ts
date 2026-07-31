import type { Response } from "express";
import type { User } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { sendMail, sendWelcomeEmail } from "../notifications/email";
import { hashPassword, verifyPassword } from "../../utils/hash";
import { clearAuthCookie, setAuthCookie } from "../../utils/jwt";
import { syncComplaintPassword } from "../complaints/whitelist-auth";
import type { LoginBody, RegisterBody, SendOtpBody, VerifyOtpBody, ChangePasswordBody } from "./schemas";
import {
  getOrSeedPrimaryAddress,
  serializePrimaryAddress,
  upsertPrimaryAddress
} from "./primary-address.service";

function httpError(status: number, message: string, code: string): Error {
  const e = new Error(message) as Error & { statusCode: number; code: string };
  e.statusCode = status;
  e.code = code;
  return e;
}

const emailCheck = z.string().email();

/**
 * Comma-separated admin emails (lowercased at compare). If the DB row is still CUSTOMER
 * (e.g. first Google sign-up defaulted role), promote to ADMIN on successful login.
 * Set only on the backend host (EC2); never expose on the public Next bundle.
 */
function adminBootstrapEmailSet(): Set<string> {
  const raw = process.env.ADMIN_BOOTSTRAP_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Comma-separated emails forced to SUPER_ADMIN on login (default: partha@sarveda.com). */
function superAdminBootstrapEmailSet(): Set<string> {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "partha@sarveda.com";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function applyAdminBootstrapIfNeeded(user: User): Promise<User> {
  const email = user.email.toLowerCase();
  const superAllow = superAdminBootstrapEmailSet();
  if (superAllow.has(email) && user.role !== "SUPER_ADMIN") {
    return prisma.user.update({
      where: { id: user.id },
      data: { role: "SUPER_ADMIN" }
    });
  }

  const allow = adminBootstrapEmailSet();
  if (allow.size === 0) return user;
  if (!allow.has(email)) return user;
  if (user.role !== "CUSTOMER") return user;
  return prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" }
  });
}

function looksLikeEmail(target: string): boolean {
  return emailCheck.safeParse(target.trim()).success;
}

function normalizeLoginTarget(raw: string): { kind: "email"; value: string } | { kind: "phone"; value: string } {
  const t = raw.trim();
  if (looksLikeEmail(t)) {
    return { kind: "email", value: t.toLowerCase() };
  }
  const digits = t.replace(/\D/g, "");
  if (digits.length < 10) {
    throw httpError(400, "Invalid phone or email format", "INVALID_TARGET");
  }
  if (digits.length === 10) {
    return { kind: "phone", value: `91${digits}` };
  }
  if (digits.startsWith("91") && digits.length === 12) {
    return { kind: "phone", value: digits };
  }
  return { kind: "phone", value: digits };
}

function otpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function deliverEmailOtp(target: string, code: string) {
  const sesConfigured =
    process.env.AWS_SES_SMTP_HOST?.trim() &&
    process.env.AWS_SES_SMTP_USER?.trim() &&
    process.env.AWS_SES_SMTP_PASS?.trim();
  const zeptoConfigured =
    process.env.ZEPTOMAIL_SMTP_PASS?.trim() && process.env.ZEPTOMAIL_FROM_EMAIL?.trim();
  if (!sesConfigured && !zeptoConfigured) {
    if (process.env.NODE_ENV === "production") {
      throw httpError(503, "Email delivery is not configured", "OTP_DELIVERY_UNAVAILABLE");
    }
    logger.warn("otp_email_skipped_dev", { target });
    logger.info("otp_dev_code_email", { target, code });
    return;
  }
  const text = `Your Sarveda verification code is ${code}. It expires in 10 minutes.`;
  const { buildShopEmail } = await import("../notifications/email");
  const html = buildShopEmail(
    "",
    [
      `Your Sarveda verification code is:`,
      `<strong style="font-size:28px;letter-spacing:4px">${code}</strong>`,
      "This code expires in 10 minutes. If you did not request it, you can ignore this email."
    ],
    {
      banner: "Verification code",
      showTick: false,
      greeting: "Dear Customer,",
      intro: "Warm greetings from Sarveda."
    }
  );
  await sendMail(target, "Your Sarveda verification code", html, text);
}

async function deliverPhoneOtp(target: string, code: string) {
  const msg91Key = process.env.MSG91_AUTH_KEY;
  if (!msg91Key) {
    if (process.env.NODE_ENV === "production") {
      throw httpError(503, "SMS delivery is not configured", "OTP_DELIVERY_UNAVAILABLE");
    }
    logger.warn("otp_sms_skipped_dev", { target });
    logger.info("otp_dev_code_sms", { target, code });
    return;
  }
  const response = await fetch("https://api.msg91.com/api/v5/flow", {
    method: "POST",
    headers: {
      authkey: msg91Key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sender: process.env.MSG91_SENDER_ID ?? "SARVEDA",
      short_url: "0",
      mobiles: target.replace(/^\+/, ""),
      otp: code
    })
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error("msg91_flow_failed", { status: response.status, body, target });
    throw httpError(502, "Failed to send SMS", "OTP_SMS_FAILED");
  }
}

function publicUser(u: {
  id: string;
  email: string;
  phone: string | null;
  name: string | null;
  avatarUrl?: string | null;
  role: string;
  isVerified: boolean;
  createdAt: Date;
  passwordHash?: string | null;
  complaintRole?: string | null;
  emailNotificationsEnabled?: boolean;
  pushNotificationsEnabled?: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    name: u.name,
    avatarUrl: u.avatarUrl ?? null,
    hasPassword: !!u.passwordHash,
    role: u.role,
    complaintRole: u.complaintRole ?? null,
    isVerified: u.isVerified,
    createdAt: u.createdAt,
    emailNotificationsEnabled: u.emailNotificationsEnabled ?? true,
    pushNotificationsEnabled: u.pushNotificationsEnabled ?? true
  };
}

export async function registerUser(body: RegisterBody) {
  const email = body.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !existing.deletedAt) {
    throw httpError(409, "An account with this email already exists", "EMAIL_EXISTS");
  }
  if (existing?.deletedAt) {
    throw httpError(409, "This email is not available", "EMAIL_UNAVAILABLE");
  }
  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: body.name.trim()
    }
  });

  void sendWelcomeEmail(user.email, user.name ?? "there").catch((err) => {
    logger.error("welcome_email_failed", { email: user.email, err });
  });

  return publicUser(user);
}

export async function loginUser(res: Response, body: LoginBody) {
  const email = body.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) {
    throw httpError(404, "No account found with this email address.", "EMAIL_NOT_FOUND");
  }
  // BUG 7: migrated Woo customers have no password — give a clear path to OTP/Google
  if (!user.passwordHash) {
    if (user.wooCommerceId != null) {
      throw httpError(
        401,
        "Password expired. Please set a new password or use OTP login.",
        "MIGRATED_ACCOUNT_USE_OTP"
      );
    }
    throw httpError(401, "Sign in with Google or OTP for this account", "PASSWORD_NOT_SET");
  }
  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    if (user.wooCommerceId != null) {
      throw httpError(
        401,
        "Password expired. Please set a new password or use OTP login.",
        "MIGRATED_ACCOUNT_USE_OTP"
      );
    }
    throw httpError(401, "Incorrect password. Try again or use Forgot password.", "INVALID_PASSWORD");
  }
  const effective = await applyAdminBootstrapIfNeeded(user);
  setAuthCookie(res, { sub: effective.id, email: effective.email, role: effective.role });
  return publicUser(effective);
}

export function logoutUser(res: Response) {
  clearAuthCookie(res);
}

export async function sendOtp(body: SendOtpBody) {
  const normalized = normalizeLoginTarget(body.target);
  const newCode = otpCode();

  await prisma.$transaction(async (tx) => {
    await tx.otpCode.deleteMany({
      where: {
        target: normalized.value,
        usedAt: null
      }
    });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await tx.otpCode.create({
      data: {
        target: normalized.value,
        code: newCode,
        expiresAt
      }
    });
  });

  const row = await prisma.otpCode.findFirst({
    where: { target: normalized.value },
    orderBy: { createdAt: "desc" }
  });
  const code = row?.code ?? newCode;

  if (normalized.kind === "email") {
    await deliverEmailOtp(normalized.value, code);
  } else {
    await deliverPhoneOtp(normalized.value, code);
  }

  logger.info("otp_sent", {
    kind: normalized.kind,
    target: normalized.value.replace(/^(91\d{6})/, "$1XXXX")
  });
}

export async function verifyOtpAndLogin(res: Response, body: VerifyOtpBody) {
  const normalized = normalizeLoginTarget(body.target);

  const row = await prisma.otpCode.findFirst({
    where: {
      target: normalized.value,
      code: body.code,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!row) {
    throw httpError(400, "Invalid or expired code", "INVALID_OTP");
  }

  await prisma.otpCode.update({
    where: { id: row.id },
    data: { usedAt: new Date() }
  });

  let user =
    normalized.kind === "email"
      ? await prisma.user.findUnique({ where: { email: normalized.value } })
      : await prisma.user.findUnique({ where: { phone: normalized.value } });

  if (!user) {
    throw httpError(404, "No account for this phone or email", "USER_NOT_FOUND");
  }

  if (user.deletedAt) {
    throw httpError(403, "Account is disabled", "ACCOUNT_DISABLED");
  }

  if (!user.isVerified) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true }
    });
  }

  const effective = await applyAdminBootstrapIfNeeded(user);
  setAuthCookie(res, { sub: effective.id, email: effective.email, role: effective.role });

  return publicUser(effective);
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw httpError(404, "User not found", "USER_NOT_FOUND");
  }
  const whitelist = await prisma.complaintWhitelist.findFirst({
    where: { email: user.email.toLowerCase(), isActive: true },
    select: { passwordHash: true, role: true }
  });
  const effectivePassword = user.passwordHash ?? whitelist?.passwordHash ?? null;
  return publicUser({
    ...user,
    passwordHash: effectivePassword,
    complaintRole: whitelist?.role ?? null
  });
}

function normalizePhoneInput(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === "") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) {
    throw httpError(400, "Enter a valid 10-digit mobile number", "INVALID_PHONE");
  }
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return digits;
  return digits;
}

export async function updateProfile(
  userId: string,
  body: {
    name: string;
    phone: string;
    address: {
      fullName: string;
      phone: string;
      line1: string;
      line2?: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  }
) {
  const phone = normalizePhoneInput(body.phone);
  if (!phone) {
    throw httpError(400, "Enter a valid 10-digit mobile number", "INVALID_PHONE");
  }

  const addressPhone = normalizePhoneInput(body.address.phone);
  if (!addressPhone) {
    throw httpError(400, "Enter a valid delivery phone number", "INVALID_PHONE");
  }

  if (body.address.country === "IN") {
    const pin = body.address.postalCode.replace(/\D/g, "");
    if (pin.length !== 6) {
      throw httpError(400, "Enter a valid 6-digit PIN code", "INVALID_POSTAL");
    }
  }

  const clash = await prisma.user.findFirst({
    where: { phone, NOT: { id: userId }, deletedAt: null }
  });
  if (clash) {
    throw httpError(
      409,
      "This mobile number is already linked to another account",
      "PHONE_EXISTS"
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: body.name.trim(),
      phone
    }
  });

  await upsertPrimaryAddress(userId, {
    ...body.address,
    phone: addressPhone,
    postalCode:
      body.address.country === "IN"
        ? body.address.postalCode.replace(/\D/g, "")
        : body.address.postalCode.trim()
  });

  return publicUser(user);
}

export async function changePassword(userId: string, body: ChangePasswordBody) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw httpError(404, "User not found", "USER_NOT_FOUND");
  }
  const whitelist = await prisma.complaintWhitelist.findFirst({
    where: { email: user.email.toLowerCase(), isActive: true },
    select: { passwordHash: true }
  });
  const currentHash = user.passwordHash ?? whitelist?.passwordHash ?? null;
  if (!currentHash) {
    throw httpError(400, "Password not set for this account", "PASSWORD_NOT_SET");
  }
  const ok = await verifyPassword(body.currentPassword, currentHash);
  if (!ok) {
    throw httpError(401, "Current password is incorrect", "INVALID_PASSWORD");
  }
  const passwordHash = await hashPassword(body.newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });
  await syncComplaintPassword(user.email, passwordHash);
}

export async function setPassword(userId: string, body: { newPassword: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw httpError(404, "User not found", "USER_NOT_FOUND");
  }
  const whitelist = await prisma.complaintWhitelist.findFirst({
    where: { email: user.email.toLowerCase(), isActive: true },
    select: { passwordHash: true }
  });
  if (user.passwordHash || whitelist?.passwordHash) {
    throw httpError(400, "Password already set. Use change password instead.", "PASSWORD_ALREADY_SET");
  }
  const passwordHash = await hashPassword(body.newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });
  await syncComplaintPassword(user.email, passwordHash);
}

type GoogleLikeProfile = {
  id: string;
  emails?: { value: string }[];
  displayName?: string;
};

export async function upsertGoogleUser(profile: GoogleLikeProfile) {
  const email = profile.emails?.[0]?.value?.trim().toLowerCase();
  if (!email) {
    throw httpError(400, "Google account returned no verified email", "GOOGLE_EMAIL_MISSING");
  }

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ googleId: profile.id }, { email }]
    }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        googleId: profile.id,
        name: profile.displayName ?? null,
        isVerified: true
      }
    });
    const effective = await applyAdminBootstrapIfNeeded(user);
    return publicUser(effective);
  }

  if (user.deletedAt) {
    throw httpError(403, "Account is disabled", "ACCOUNT_DISABLED");
  }

  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      googleId: profile.id,
      isVerified: true,
      ...(profile.displayName ? { name: profile.displayName } : {})
    }
  });

  const effective = await applyAdminBootstrapIfNeeded(user);
  return publicUser(effective);
}

export async function updateNotificationPreferences(
  userId: string,
  body: {
    emailNotificationsEnabled?: boolean;
    pushNotificationsEnabled?: boolean;
  }
) {
  const data: {
    emailNotificationsEnabled?: boolean;
    pushNotificationsEnabled?: boolean;
    fcmToken?: null;
  } = {};

  if (body.emailNotificationsEnabled !== undefined) {
    data.emailNotificationsEnabled = body.emailNotificationsEnabled;
  }
  if (body.pushNotificationsEnabled !== undefined) {
    data.pushNotificationsEnabled = body.pushNotificationsEnabled;
    if (!body.pushNotificationsEnabled) {
      data.fcmToken = null;
    }
  }

  if (Object.keys(data).length === 0) {
    throw httpError(400, "No preferences to update", "BAD_REQUEST");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data
  });

  return publicUser(user);
}
