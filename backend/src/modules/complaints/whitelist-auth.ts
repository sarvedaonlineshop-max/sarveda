import type { ComplaintAppRole, ComplaintWhitelist, User } from "@prisma/client";

import { prisma } from "../../config/db";
import { hashPassword, verifyPassword } from "../../utils/hash";

export const COMPLAINT_DEFAULT_PASSWORD = "sarveda123";

function httpError(status: number, message: string, code: string): Error {
  const e = new Error(message) as Error & { statusCode: number; code: string };
  e.statusCode = status;
  e.code = code;
  return e;
}

export async function hashComplaintDefaultPassword(): Promise<string> {
  return hashPassword(COMPLAINT_DEFAULT_PASSWORD);
}

/** Ensure a storefront User row exists for JWT sessions (complaints-only users stay CUSTOMER). */
export async function ensureComplaintUser(
  email: string,
  name?: string | null,
  passwordHash?: string | null
): Promise<User> {
  const normalized = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    if (existing.deletedAt) {
      throw httpError(403, "Account is disabled", "ACCOUNT_DISABLED");
    }
    const updates: { name?: string; passwordHash?: string; isVerified?: boolean } = {};
    if (name?.trim() && !existing.name) updates.name = name.trim();
    if (passwordHash && !existing.passwordHash) updates.passwordHash = passwordHash;
    if (!existing.isVerified) updates.isVerified = true;
    if (Object.keys(updates).length === 0) return existing;
    return prisma.user.update({ where: { id: existing.id }, data: updates });
  }

  return prisma.user.create({
    data: {
      email: normalized,
      name: name?.trim() || null,
      passwordHash: passwordHash ?? null,
      isVerified: true,
      role: "CUSTOMER"
    }
  });
}

export async function syncComplaintPassword(email: string, passwordHash: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  await prisma.complaintWhitelist.updateMany({
    where: { email: normalized, isActive: true },
    data: { passwordHash }
  });
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (user && !user.deletedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });
  }
}

export type ComplaintLoginUser = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  hasPassword: boolean;
  complaintRole: ComplaintAppRole;
};

export async function loginComplaintWithPassword(
  email: string,
  password: string
): Promise<{ user: ComplaintLoginUser; whitelist: ComplaintWhitelist }> {
  const normalized = email.toLowerCase().trim();
  const whitelist = await prisma.complaintWhitelist.findFirst({
    where: { email: normalized, isActive: true }
  });
  if (!whitelist) {
    throw httpError(
      403,
      "This email is not authorised for Sarveda Tasks. Contact admin for access.",
      "FORBIDDEN"
    );
  }
  if (!whitelist.passwordHash) {
    throw httpError(
      401,
      "Password not set for this account. Use OTP login or contact admin.",
      "PASSWORD_NOT_SET"
    );
  }

  const ok = await verifyPassword(password, whitelist.passwordHash);
  if (!ok) {
    throw httpError(401, "Incorrect password. Try again or use OTP login.", "INVALID_PASSWORD");
  }

  const dbUser = await ensureComplaintUser(
    whitelist.email,
    whitelist.name,
    whitelist.passwordHash
  );

  return {
    whitelist,
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name ?? whitelist.name,
      phone: dbUser.phone,
      hasPassword: true,
      complaintRole: whitelist.role
    }
  };
}

export async function provisionWhitelistCredentials(
  entry: ComplaintWhitelist,
  options?: { resetPassword?: boolean }
): Promise<ComplaintWhitelist> {
  let passwordHash = entry.passwordHash;
  if (!passwordHash || options?.resetPassword) {
    passwordHash = await hashComplaintDefaultPassword();
  }

  const updated = await prisma.complaintWhitelist.update({
    where: { id: entry.id },
    data: {
      passwordHash,
      role: entry.role ?? "ADMIN"
    }
  });

  await ensureComplaintUser(updated.email, updated.name, passwordHash);
  return updated;
}
