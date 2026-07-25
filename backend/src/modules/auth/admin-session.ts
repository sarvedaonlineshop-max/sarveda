import type { Request } from "express";
import { Role } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { writeAdminActivity } from "../../middleware/adminActivity";

function isAdminRole(role: string | Role | undefined | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function clientMeta(req?: Request): { ip: string | null; userAgent: string | null } {
  if (!req) return { ip: null, userAgent: null };
  const xf = req.headers["x-forwarded-for"];
  const ipFromXf = typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined;
  const ip = ipFromXf || req.ip || req.socket.remoteAddress || null;
  const ua = req.headers["user-agent"];
  return { ip, userAgent: typeof ua === "string" ? ua.slice(0, 512) : null };
}

/** Record an admin login (password, OTP, or Google). No-op for customers. */
export async function recordAdminLogin(
  userId: string,
  role: string | Role,
  req?: Request
): Promise<void> {
  if (!isAdminRole(role)) return;
  try {
    const meta = clientMeta(req);
    await prisma.adminSession.create({
      data: {
        userId,
        ip: meta.ip,
        userAgent: meta.userAgent
      }
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true }
    });
    if (user) {
      await writeAdminActivity({
        actorUserId: userId,
        actorEmail: user.email,
        actorName: user.name,
        action: "LOGIN",
        resource: "auth",
        summary: `Logged in to admin (${user.email})`,
        method: "POST",
        path: "/api/auth/login",
        ip: meta.ip,
        userAgent: meta.userAgent
      });
    }
  } catch (err) {
    logger.warn("admin_session_login_record_failed", {
      userId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/** Close the latest open admin session on logout. */
export async function recordAdminLogout(userId: string, role?: string | Role | null): Promise<void> {
  if (role != null && !isAdminRole(role)) return;
  try {
    const open = await prisma.adminSession.findFirst({
      where: { userId, logoutAt: null },
      orderBy: { loginAt: "desc" }
    });
    if (open) {
      await prisma.adminSession.update({
        where: { id: open.id },
        data: { logoutAt: new Date() }
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, role: true }
    });
    if (user && isAdminRole(user.role)) {
      await writeAdminActivity({
        actorUserId: userId,
        actorEmail: user.email,
        actorName: user.name,
        action: "LOGOUT",
        resource: "auth",
        summary: `Logged out of admin (${user.email})`,
        method: "POST",
        path: "/api/auth/logout"
      });
    }
  } catch (err) {
    logger.warn("admin_session_logout_record_failed", {
      userId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

export async function listAdminSessions(userId: string, take = 40) {
  const rows = await prisma.adminSession.findMany({
    where: { userId },
    orderBy: { loginAt: "desc" },
    take: Math.min(Math.max(take, 1), 100)
  });
  return rows.map((r) => ({
    id: r.id,
    loginAt: r.loginAt.toISOString(),
    logoutAt: r.logoutAt?.toISOString() ?? null,
    ip: r.ip,
    userAgent: r.userAgent
  }));
}
