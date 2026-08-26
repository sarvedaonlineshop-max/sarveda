import { randomBytes } from "crypto";

import { prisma } from "../../config/db";
import { hashPassword } from "../../utils/hash";
import { buildShopEmail, sendMail } from "../notifications/email";
import { syncComplaintPassword } from "../complaints/whitelist-auth";

import { getPrimaryFrontendBase } from "./redirect";

const RESET_EXPIRY_MINUTES = 30;

function httpError(status: number, message: string, code: string): Error {
  const e = new Error(message) as Error & { statusCode: number; code: string };
  e.statusCode = status;
  e.code = code;
  return e;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, deletedAt: true }
  });

  if (!user || user.deletedAt) {
    throw httpError(
      404,
      "No account found for this email. Contact admin for access.",
      "ACCOUNT_NOT_FOUND"
    );
  }

  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id }
  });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt }
  });

  const resetUrl = `${getPrimaryFrontendBase()}/reset-password?token=${token}`;
  const name = user.name?.trim() || "Customer";
  const html = buildShopEmail(
    "",
    [
      `Click the button below to reset your Sarveda password. This link expires in ${RESET_EXPIRY_MINUTES} minutes.`,
      "If you did not request this, you can ignore this email — your password will not change."
    ],
    {
      banner: "Password reset",
      showTick: false,
      greeting: `Dear ${name},`,
      intro: "Warm greetings from Sarveda.",
      ctas: [{ href: resetUrl, label: "Reset Password" }]
    }
  );
  const text = `Dear ${name},\n\nReset your Sarveda password (expires in ${RESET_EXPIRY_MINUTES} minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.`;

  await sendMail(user.email, "Reset your Sarveda password", html, text);
}

/**
 * Verify a login OTP and issue a short-lived password-reset token
 * (does not sign the user in).
 */
export async function verifyOtpForPasswordReset(
  target: string,
  code: string
): Promise<{ resetToken: string }> {
  const normalized = target.trim().toLowerCase();
  const row = await prisma.otpCode.findFirst({
    where: {
      target: normalized,
      code,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!row) {
    throw httpError(400, "Invalid or expired code", "INVALID_OTP");
  }

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, deletedAt: true }
  });

  if (!user || user.deletedAt) {
    throw httpError(
      404,
      "No account found for this email. Contact admin for access.",
      "ACCOUNT_NOT_FOUND"
    );
  }

  await prisma.otpCode.update({
    where: { id: row.id },
    data: { usedAt: new Date() }
  });

  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id }
  });

  const resetToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: resetToken, expiresAt }
  });

  return { resetToken };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error("Password must be at least 8 characters"), {
      statusCode: 400,
      code: "PASSWORD_TOO_SHORT"
    });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true }
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    throw Object.assign(
      new Error("This reset session has expired or is invalid. Please request a new OTP."),
      { statusCode: 400, code: "TOKEN_INVALID" }
    );
  }

  if (resetToken.user.deletedAt) {
    throw Object.assign(
      new Error("This reset session has expired or is invalid. Please request a new OTP."),
      { statusCode: 400, code: "TOKEN_INVALID" }
    );
  }

  const hash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hash }
    }),
    prisma.passwordResetToken.delete({
      where: { token }
    })
  ]);

  await syncComplaintPassword(resetToken.user.email, hash);
}
