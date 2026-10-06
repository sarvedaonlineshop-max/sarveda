import type { Prisma, User } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { CANONICAL_STORE_ADMINS } from "../complaints/canonical-store-admins";
import { nextCrmNumberInTx } from "./crm-number";
import { findOpenLeadByContact } from "./lead.service";

const PAID_STATUSES = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "REFUNDED"] as const;
const SIGNUP_FROM = new Date("2026-09-14T18:19:00.000Z");
const SPAM_BURST_FROM = new Date("2026-09-15T17:24:00.000Z");
const SPAM_BURST_TO = new Date("2026-09-15T17:25:00.000Z");

function staffEmailSet(): Set<string> {
  const raw = `${process.env.ADMIN_BOOTSTRAP_EMAILS ?? ""},${process.env.SUPER_ADMIN_EMAILS ?? "partha@sarveda.com"}`;
  const emails = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const admin of CANONICAL_STORE_ADMINS) emails.push(admin.email.toLowerCase());
  return new Set(emails);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function hasPaidOrder(email: string): Promise<boolean> {
  const row = await prisma.order.findFirst({
    where: {
      deletedAt: null,
      email: { equals: email, mode: "insensitive" },
      OR: [
        { status: { in: [...PAID_STATUSES] } },
        { paymentStatus: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] } }
      ]
    },
    select: { id: true }
  });
  return Boolean(row);
}

async function leadExistsForUser(userId: string, email: string): Promise<boolean> {
  const byUser = await prisma.crmLead.findFirst({
    where: { customFields: { path: ["userId"], equals: userId } },
    select: { id: true }
  });
  if (byUser) return true;
  const byEmail = await prisma.crmLead.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true }
  });
  return Boolean(byEmail);
}

/** New website signup with no purchase. Never throws. Does not send email or WhatsApp. */
export function captureSignupLead(user: Pick<User, "id" | "email" | "name" | "phone" | "role">): void {
  void captureSignupLeadNow(user).catch((err) => {
    logger.error("crm_signup_lead_failed", {
      userId: user.id,
      err: err instanceof Error ? err.message : String(err)
    });
  });
}

async function captureSignupLeadNow(user: Pick<User, "id" | "email" | "name" | "phone" | "role">): Promise<"created" | "skipped"> {
  const email = user.email.trim().toLowerCase();
  if (!email || user.role !== "CUSTOMER") return "skipped";
  if (staffEmailSet().has(email)) return "skipped";
  if (await leadExistsForUser(user.id, email)) return "skipped";
  if (await hasPaidOrder(email)) return "skipped";

  await prisma.$transaction(async (tx) => {
    const leadNumber = await nextCrmNumberInTx(tx, "LEAD");
    const lead = await tx.crmLead.create({
      data: {
        leadNumber,
        name: user.name?.trim() || email,
        email,
        phone: user.phone,
        source: "WEBSITE",
        status: "NEW",
        interestSummary: "Signed up on the website and has not bought yet.",
        customFields: { auto: "signup-unpaid", userId: user.id }
      }
    });
    await tx.crmActivity.create({
      data: {
        type: "SYSTEM",
        subject: "Lead created",
        body: "Website signup with no purchase yet.",
        leadId: lead.id
      }
    });
  });
  logger.info("crm_signup_lead_created", { userId: user.id });
  return "created";
}

/** Unpaid checkout that was cancelled. Never throws. Does not send email or WhatsApp. */
export function captureAbandonedOrderLead(orderId: string): void {
  void captureAbandonedOrderLeadNow(orderId).catch((err) => {
    logger.error("crm_abandoned_lead_failed", {
      orderId,
      err: err instanceof Error ? err.message : String(err)
    });
  });
}

async function captureAbandonedOrderLeadNow(orderId: string): Promise<"created" | "updated" | "skipped"> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      payments: { select: { status: true, provider: true } },
      items: { take: 6, select: { nameSnapshot: true, qtyOrdered: true } },
      addresses: { where: { type: "SHIPPING" }, take: 1, select: { fullName: true } }
    }
  });
  if (!order || order.wooCommerceId != null) return "skipped";
  if (order.payments.some((p) => p.provider === "COD" || p.status === "CAPTURED")) return "skipped";
  if (order.status !== "CANCELLED" && order.status !== "PENDING_PAYMENT") return "skipped";

  const already = await prisma.crmLead.findFirst({
    where: { customFields: { path: ["orderId"], equals: order.id } },
    select: { id: true }
  });
  if (already) return "skipped";

  const itemText = order.items.map((i) => `${i.nameSnapshot} x${i.qtyOrdered}`).join(", ");
  const summary = `Abandoned order ${order.orderNumber}${itemText ? ` · ${itemText}` : ""}`;
  const name = order.addresses[0]?.fullName?.trim() || order.email;
  const open = await findOpenLeadByContact(order.email, order.phone);

  if (open) {
    const noted = await prisma.crmActivity.findFirst({
      where: { leadId: open.id, body: { contains: order.orderNumber } },
      select: { id: true }
    });
    if (noted) return "skipped";
    const fields = asRecord(open.customFields);
    await prisma.crmLead.update({
      where: { id: open.id },
      data: {
        customFields: {
          ...fields,
          orderId: order.id,
          orderNumber: order.orderNumber,
          auto: fields.auto ?? "abandoned-order"
        } as Prisma.InputJsonValue,
        interestSummary: open.interestSummary?.includes(order.orderNumber)
          ? open.interestSummary
          : [open.interestSummary, summary].filter(Boolean).join("\n"),
        estimatedValueInPaise: open.estimatedValueInPaise ?? order.grandTotalInPaise,
        phone: open.phone || order.phone
      }
    });
    await prisma.crmActivity.create({
      data: {
        type: "SYSTEM",
        subject: "Abandoned order",
        body: summary,
        leadId: open.id,
        orderId: order.id
      }
    });
    logger.info("crm_abandoned_lead_updated", { orderId: order.id, leadId: open.id });
    return "updated";
  }

  await prisma.$transaction(async (tx) => {
    const leadNumber = await nextCrmNumberInTx(tx, "LEAD");
    const lead = await tx.crmLead.create({
      data: {
        leadNumber,
        name,
        email: order.email.trim().toLowerCase(),
        phone: order.phone,
        source: "WEBSITE",
        status: "NEW",
        currency: order.currency || "INR",
        estimatedValueInPaise: order.grandTotalInPaise,
        interestSummary: summary,
        customFields: { auto: "abandoned-order", orderId: order.id, orderNumber: order.orderNumber }
      }
    });
    await tx.crmActivity.create({
      data: {
        type: "SYSTEM",
        subject: "Abandoned order",
        body: summary,
        leadId: lead.id,
        orderId: order.id
      }
    });
  });
  logger.info("crm_abandoned_lead_created", { orderId: order.id });
  return "created";
}

/**
 * One bounded pass for people already on the site. Safe to run again.
 * Skips the known signup burst and anyone who already has a lead or a paid order.
 */
export async function backfillAutoLeads(): Promise<{
  signupCreated: number;
  signupSkipped: number;
  abandonedCreated: number;
  abandonedUpdated: number;
  abandonedSkipped: number;
}> {
  const result = {
    signupCreated: 0,
    signupSkipped: 0,
    abandonedCreated: 0,
    abandonedUpdated: 0,
    abandonedSkipped: 0
  };

  const users = await prisma.user.findMany({
    where: {
      role: "CUSTOMER",
      deletedAt: null,
      wooCommerceId: null,
      createdAt: { gte: SIGNUP_FROM },
      NOT: { createdAt: { gte: SPAM_BURST_FROM, lt: SPAM_BURST_TO } }
    },
    select: { id: true, email: true, name: true, phone: true, role: true },
    orderBy: { createdAt: "asc" },
    take: 800
  });

  for (const user of users) {
    const outcome = await captureSignupLeadNow(user);
    if (outcome === "created") result.signupCreated += 1;
    else result.signupSkipped += 1;
  }

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      wooCommerceId: null,
      status: "CANCELLED",
      paymentStatus: "FAILED",
      createdAt: { gte: SIGNUP_FROM },
      payments: { none: { OR: [{ status: "CAPTURED" }, { provider: "COD" }] } }
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 400
  });

  for (const order of orders) {
    const outcome = await captureAbandonedOrderLeadNow(order.id);
    if (outcome === "created") result.abandonedCreated += 1;
    else if (outcome === "updated") result.abandonedUpdated += 1;
    else result.abandonedSkipped += 1;
  }

  return result;
}
