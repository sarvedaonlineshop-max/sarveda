import type { NextFunction, Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";

import { prisma } from "../config/db";
import { logger } from "../config/logger";

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|otp|cvv|card|api[_-]?key/i;

export type AdminActivityInput = {
  actorUserId: string;
  actorEmail: string;
  actorName?: string | null;
  action: string;
  resource: string;
  summary: string;
  method?: string | null;
  path?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

function clientMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const xf = req.headers["x-forwarded-for"];
  const ipFromXf = typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined;
  const ip = ipFromXf || req.ip || req.socket.remoteAddress || null;
  const ua = req.headers["user-agent"];
  return { ip, userAgent: typeof ua === "string" ? ua.slice(0, 512) : null };
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[…]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function sanitizeMetadata(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const cleaned = sanitizeValue(body);
  if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) return null;
  return cleaned as Record<string, unknown>;
}

export async function writeAdminActivity(input: AdminActivityInput): Promise<void> {
  try {
    await prisma.adminActivityLog.create({
      data: {
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail.toLowerCase(),
        actorName: input.actorName ?? null,
        action: input.action,
        resource: input.resource,
        summary: input.summary.slice(0, 500),
        method: input.method ?? null,
        path: input.path ? input.path.slice(0, 500) : null,
        entityId: input.entityId ?? null,
        metadata:
          input.metadata != null
            ? (input.metadata as Prisma.InputJsonValue)
            : undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  } catch (err) {
    logger.warn("admin_activity_write_failed", {
      error: err instanceof Error ? err.message : String(err),
      path: input.path,
      action: input.action
    });
  }
}

function inferResource(path: string): string {
  const p = path.toLowerCase();
  if (p.includes("/products")) return "products";
  if (p.includes("/inventory")) return "inventory";
  if (p.includes("/orders")) return "orders";
  if (p.includes("/pickup-locations")) return "pickup_locations";
  if (p.includes("/coupons")) return "coupons";
  if (p.includes("/content/")) return "content";
  if (p.includes("/enrollments")) return "enrollments";
  if (p.includes("/enquiries") || p.includes("/chats")) return "chats";
  if (p.includes("/media") || p.includes("/upload")) return "media";
  if (p.includes("/create-shipment") || p.includes("/shipping") || p.includes("/waybill") || p.includes("/manual-awb") || p.includes("/reverse-shipment"))
    return "shipping";
  if (p.includes("/reviews")) return "reviews";
  if (p.includes("/complaints")) return "complaints";
  if (p.includes("/zoho")) return "zoho";
  if (p.includes("/customers")) return "customers";
  if (p.includes("/reports")) return "reports";
  if (p.includes("/seo-suggest")) return "seo";
  if (p.includes("/catalog")) return "catalog";
  return "admin";
}

function inferAction(method: string, path: string): string {
  const m = method.toUpperCase();
  const p = path.toLowerCase();
  if (p.includes("/refund")) return "REFUND";
  if (p.includes("/cancel")) return "CANCEL";
  if (p.includes("/approve")) return "APPROVE";
  if (p.includes("/reject")) return "REJECT";
  if (p.includes("/create-shipment") || p.includes("/manual-awb") || p.includes("/reverse-shipment"))
    return "CREATE";
  if (m === "POST") return "CREATE";
  if (m === "PUT" || m === "PATCH") return "UPDATE";
  if (m === "DELETE") return "DELETE";
  return "OTHER";
}

function extractEntityId(path: string): string | null {
  const uuid =
    path.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    )?.[0] ?? null;
  if (uuid) return uuid;
  const orderish = path.match(/\/orders\/([^/?]+)/i)?.[1];
  if (orderish && orderish !== "export" && orderish !== "service-requests") return orderish;
  return null;
}

function humanSummary(method: string, path: string, action: string, resource: string): string {
  const verb =
    action === "CREATE"
      ? "Created / submitted"
      : action === "UPDATE"
        ? "Updated"
        : action === "DELETE"
          ? "Deleted"
          : action === "REFUND"
            ? "Refunded"
            : action === "CANCEL"
              ? "Cancelled"
              : action === "APPROVE"
                ? "Approved"
                : action === "REJECT"
                  ? "Rejected"
                  : `${method}`;
  const label = resource.replace(/_/g, " ");
  const id = extractEntityId(path);
  return id ? `${verb} ${label} (${id})` : `${verb} ${label}`;
}

const SKIP_PATH_RE =
  /\/me\/sessions$|\/reports\/export$|\/notifications$|\/activity(\/|$)|\/dashboard$|\/orders\/export\/pdf$/i;

/**
 * Logs successful mutating admin requests (POST/PUT/PATCH/DELETE).
 * Attach after requireAdmin (or any middleware that sets req.authUser).
 */
export function logAdminMutations(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  const fullPath = `${req.baseUrl || ""}${req.path || ""}` || req.originalUrl.split("?")[0];
  if (SKIP_PATH_RE.test(fullPath) || SKIP_PATH_RE.test(req.originalUrl)) {
    next();
    return;
  }

  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const auth = req.authUser;
    if (!auth?.id || !auth.email) return;
    if (auth.role !== "ADMIN" && auth.role !== "SUPER_ADMIN") return;

    const meta = clientMeta(req);
    const resource = inferResource(fullPath);
    const action = inferAction(method, fullPath);
    const entityId = extractEntityId(fullPath);
    const bodyMeta = sanitizeMetadata(req.body);

    void writeAdminActivity({
      actorUserId: auth.id,
      actorEmail: auth.email,
      actorName: auth.name ?? null,
      action,
      resource,
      summary: humanSummary(method, fullPath, action, resource),
      method,
      path: fullPath.slice(0, 500),
      entityId,
      metadata: bodyMeta
        ? {
            ...bodyMeta,
            statusCode: res.statusCode
          }
        : { statusCode: res.statusCode },
      ip: meta.ip,
      userAgent: meta.userAgent
    });
  });

  next();
}

export function isSuperAdminRole(role: string | Role | undefined | null): boolean {
  return role === "SUPER_ADMIN";
}

/** Emails that must be SUPER_ADMIN (default: partha@sarveda.com). */
export function superAdminEmailSet(): Set<string> {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "partha@sarveda.com";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.authUser?.role;
  const email = req.authUser?.email?.toLowerCase();
  if (role === "SUPER_ADMIN" || (email && superAdminEmailSet().has(email))) {
    next();
    return;
  }
  res.status(403).json({
    success: false,
    error: "Super admin access required",
    code: "FORBIDDEN"
  });
}

export async function listAdminActivity(opts: {
  actorUserId?: string;
  resource?: string;
  action?: string;
  q?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (opts.actorUserId) where.actorUserId = opts.actorUserId;
  if (opts.resource) where.resource = opts.resource;
  if (opts.action) where.action = opts.action;
  if (opts.q?.trim()) {
    const q = opts.q.trim();
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { actorEmail: { contains: q, mode: "insensitive" } },
      { actorName: { contains: q, mode: "insensitive" } },
      { path: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } }
    ];
  }

  const skip = (opts.page - 1) * opts.limit;
  const [total, items] = await Promise.all([
    prisma.adminActivityLog.count({ where }),
    prisma.adminActivityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: opts.limit,
      select: {
        id: true,
        actorUserId: true,
        actorEmail: true,
        actorName: true,
        action: true,
        resource: true,
        summary: true,
        method: true,
        path: true,
        entityId: true,
        metadata: true,
        ip: true,
        createdAt: true
      }
    })
  ]);

  return {
    items: items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString()
    })),
    pagination: {
      page: opts.page,
      limit: opts.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / opts.limit))
    }
  };
}

export async function adminActivityDashboard(days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [total, byAction, byResource, byActor, recent] = await Promise.all([
    prisma.adminActivityLog.count({ where: { createdAt: { gte: since } } }),
    prisma.adminActivityLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } }
    }),
    prisma.adminActivityLog.groupBy({
      by: ["resource"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { resource: "desc" } }
    }),
    prisma.adminActivityLog.groupBy({
      by: ["actorUserId", "actorEmail", "actorName"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { actorUserId: "desc" } }
    }),
    prisma.adminActivityLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        actorEmail: true,
        actorName: true,
        action: true,
        resource: true,
        summary: true,
        createdAt: true
      }
    })
  ]);

  const admins = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: { in: ["ADMIN", "SUPER_ADMIN"] }
    },
    select: { id: true, email: true, name: true, role: true },
    orderBy: { email: "asc" }
  });

  return {
    days,
    total,
    byAction: byAction.map((r) => ({ action: r.action, count: r._count._all })),
    byResource: byResource.map((r) => ({ resource: r.resource, count: r._count._all })),
    byActor: byActor.map((r) => ({
      userId: r.actorUserId,
      email: r.actorEmail,
      name: r.actorName,
      count: r._count._all
    })),
    recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    admins
  };
}
