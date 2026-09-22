import type { ComplaintAppRole, ComplaintWhitelist, User, Role } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { hashPassword, verifyPassword } from "../../utils/hash";
import { CANONICAL_STORE_ADMINS } from "./canonical-store-admins";

export { CANONICAL_STORE_ADMINS } from "./canonical-store-admins";

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
      "No account found for this email. Contact admin for access.",
      "ACCOUNT_NOT_FOUND"
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

function nextAdminRole(current: Role | undefined): Role {
  if (current === "SUPER_ADMIN") return "SUPER_ADMIN";
  return "ADMIN";
}

/**
 * Create or update a store ADMIN user and Tasks/Chats whitelist row.
 * Sets the team default password only when missing, unless resetPassword is true.
 */
export async function provisionStoreAdmin(opts: {
  email: string;
  name?: string | null;
  resetPassword?: boolean;
}): Promise<{ email: string; userId: string; created: boolean; promoted: boolean }> {
  const email = opts.email.toLowerCase().trim();
  const name = opts.name?.trim() || email.split("@")[0] || null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.deletedAt) {
    throw httpError(403, "Account is disabled", "ACCOUNT_DISABLED");
  }

  const created = !existing;
  const promoted = Boolean(existing && existing.role === "CUSTOMER");
  const needsPassword =
    Boolean(opts.resetPassword) || !existing?.passwordHash;

  const passwordHash = needsPassword
    ? await hashComplaintDefaultPassword()
    : existing?.passwordHash ?? (await hashComplaintDefaultPassword());

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: nextAdminRole(existing.role),
          isVerified: true,
          ...(name && !existing.name ? { name } : {}),
          ...(needsPassword ? { passwordHash } : {})
        }
      })
    : await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          isVerified: true,
          role: "ADMIN"
        }
      });

  const syncedHash = user.passwordHash ?? passwordHash;
  await prisma.complaintWhitelist.upsert({
    where: { email },
    create: {
      email,
      name: user.name,
      role: "ADMIN",
      isActive: true,
      passwordHash: syncedHash
    },
    update: {
      isActive: true,
      role: "ADMIN",
      passwordHash: syncedHash,
      ...(user.name ? { name: user.name } : {})
    }
  });

  logger.info("store_admin_provisioned", {
    email,
    created,
    promoted,
    resetPassword: Boolean(opts.resetPassword)
  });

  return { email, userId: user.id, created, promoted };
}

/** Idempotent boot hook. Only overwrites a password when the canonical row sets resetPassword. */
export async function ensureCanonicalStoreAdmins(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  if (process.env.NODE_ENV === "test") return;

  for (const admin of CANONICAL_STORE_ADMINS) {
    try {
      await provisionStoreAdmin({
        email: admin.email,
        name: admin.name,
        resetPassword: Boolean(admin.resetPassword)
      });
    } catch (err) {
      logger.error("canonical_store_admin_provision_failed", {
        email: admin.email,
        err
      });
    }
  }
}
