import { randomBytes } from "crypto";

import { prisma } from "../../config/db";
import { hashPassword } from "../../utils/hash";
import { buildShopEmail, sendMail } from "../notifications/email";

import { getPrimaryFrontendBase } from "./redirect";

const RESET_EXPIRY_MINUTES = 30;

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true }
  });

  if (!user) {
    throw Object.assign(
      new Error(
        "No account found with this email address. " +
          "Please check and try again, or register a new account."
      ),
      { statusCode: 404, code: "EMAIL_NOT_FOUND" }
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
  const greeting = user.name ?? "there";
  const html = buildShopEmail(
    "Reset your password",
    [
      `Hi ${greeting},`,
      `Click the button below to reset your Sarveda password. This link expires in ${RESET_EXPIRY_MINUTES} minutes.`,
      "If you did not request this, you can ignore this email — your password will not change."
    ],
    {
      banner: "Password reset",
      ctas: [{ href: resetUrl, label: "Reset Password" }]
    }
  );
  const text = `Hi ${greeting},\n\nReset your Sarveda password (expires in ${RESET_EXPIRY_MINUTES} minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.`;

  await sendMail(user.email, "Reset your Sarveda password", html, text);
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
      new Error("This reset link has expired or is invalid. Please request a new one."),
      { statusCode: 400, code: "TOKEN_INVALID" }
    );
  }

  if (resetToken.user.deletedAt) {
    throw Object.assign(
      new Error("This reset link has expired or is invalid. Please request a new one."),
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
}
