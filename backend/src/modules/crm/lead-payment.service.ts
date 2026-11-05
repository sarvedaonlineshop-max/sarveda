import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { sendPushToAdminUser } from "../../config/firebase";
import { logger } from "../../config/logger";
import { isAccountingEmailAllowed } from "../accounting/accounting-access";
import { replyToEnquiryThread } from "../enquiries/enquiries.service";
import { createRazorpayPaymentLink } from "../payments/razorpay";
import { CrmError, crmForbidden, crmNotFound } from "./crm-errors";
import { dueAtFromDate, leadPaymentStatus, receivedMinor, type LeadPaymentMethod } from "./lead-payment";

type Actor = { id: string; email: string; name: string | null };

const RECORD_CHANNELS = ["BANK_UPI", "COD_COLLECTION", "COD_SETTLEMENT"] as const;

function moneyLabel(minor: number, currency: string): string {
  const major = (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === "USD") return `$${major}`;
  if (currency === "AED") return `AED ${major}`;
  return `₹${major}`;
}

function assertFinance(actor: Actor) {
  if (!isAccountingEmailAllowed(actor.email)) {
    throw crmForbidden("Only Finance can do this");
  }
}

async function latestQuote(threadId: string) {
  return prisma.quotation.findFirst({
    where: { enquiryThreadId: threadId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      quoteNumber: true,
      currency: true,
      grandTotalInPaise: true,
      customerName: true,
      email: true,
      phone: true
    }
  });
}

async function orderForThread(orderNumber: string | null) {
  if (!orderNumber) return null;
  return prisma.order.findFirst({
    where: { orderNumber, deletedAt: null },
    select: { id: true, orderNumber: true }
  });
}

async function syncGatewayReceipts(leadPaymentId: string, orderId: string | null, currency: string) {
  if (!orderId) return false;
  const payments = await prisma.payment.findMany({
    where: {
      orderId,
      status: "CAPTURED",
      currency,
      provider: { in: ["RAZORPAY", "STRIPE", "PAYPAL"] }
    },
    select: { id: true, amountInPaise: true, providerPaymentId: true }
  });
  let created = false;
  for (const payment of payments) {
    const existing = await prisma.crmLeadPaymentReceipt.findUnique({
      where: { orderPaymentId: payment.id },
      select: { id: true, amountInPaise: true }
    });
    if (existing) {
      if (existing.amountInPaise !== payment.amountInPaise) {
        await prisma.crmLeadPaymentReceipt.update({
          where: { id: existing.id },
          data: { amountInPaise: payment.amountInPaise }
        });
      }
      continue;
    }
    await prisma.crmLeadPaymentReceipt.create({
      data: {
        leadPaymentId,
        amountInPaise: payment.amountInPaise,
        channel: "GATEWAY",
        status: "VERIFIED",
        reference: payment.providerPaymentId,
        note: "Confirmed by the payment gateway",
        recordedByEmail: "gateway",
        verifiedByEmail: "gateway",
        verifiedAt: new Date(),
        orderPaymentId: payment.id
      }
    });
    created = true;
  }
  return created;
}

async function maybeRemind(threadId: string, actor: Actor, quoteNumber: string, balance: number, currency: string) {
  if (balance <= 0) return;
  const existing = await prisma.enquiryFollowUp.findFirst({
    where: { threadId, status: "OPEN", notes: { startsWith: "Balance reminder" } },
    select: { id: true }
  });
  if (existing) return;
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { crmOwnerUserId: true, customerName: true }
  });
  const assignee = thread?.crmOwnerUserId || actor.id;
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  try {
    const row = await prisma.enquiryFollowUp.create({
      data: {
        threadId,
        notes: `Balance reminder: ${moneyLabel(balance, currency)} still pending on ${quoteNumber}.`,
        dueAt,
        assignedAdminId: assignee,
        createdByAdminId: actor.id,
        status: "OPEN"
      }
    });
    await sendPushToAdminUser(assignee, "Balance reminder", `${thread?.customerName || "Customer"} · ${moneyLabel(balance, currency)} still pending`, {
      type: "chat",
      chatId: threadId,
      followUpId: row.id,
      link: `/admin/chats/${threadId}`
    }).catch((err: unknown) => {
      logger.warn("lead_payment_reminder_push_failed", {
        threadId,
        error: err instanceof Error ? err.message : String(err)
      });
    });
  } catch (err) {
    logger.warn("lead_payment_reminder_failed", { threadId, err });
  }
}

function present(
  row: {
    id: string;
    enquiryThreadId: string;
    quotationId: string | null;
    orderId: string | null;
    method: string;
    currency: string;
    totalInPaise: number;
    dueAt: Date | null;
    paymentLinkUrl: string | null;
    receipts: Array<{
      id: string;
      amountInPaise: number;
      channel: string;
      status: string;
      reference: string | null;
      note: string | null;
      recordedByEmail: string | null;
      verifiedByEmail: string | null;
      verifiedAt: Date | null;
      createdAt: Date;
    }>;
  },
  quoteNumber: string | null,
  orderNumber: string | null,
  finance: boolean
) {
  const receivedInPaise = receivedMinor(row.receipts);
  const balanceInPaise = Math.max(0, row.totalInPaise - receivedInPaise);
  return {
    id: row.id,
    enquiryThreadId: row.enquiryThreadId,
    quotationId: row.quotationId,
    quoteNumber,
    orderId: row.orderId,
    orderNumber,
    method: row.method,
    currency: row.currency,
    totalInPaise: row.totalInPaise,
    receivedInPaise,
    balanceInPaise,
    status: leadPaymentStatus({ total: row.totalInPaise, received: receivedInPaise, dueAt: row.dueAt }),
    dueAt: row.dueAt,
    paymentLinkUrl: row.paymentLinkUrl,
    finance,
    receipts: row.receipts.map((receipt) => ({
      ...receipt,
      countsAsReceived: receipt.status === "VERIFIED" && ["GATEWAY", "BANK_UPI", "COD_SETTLEMENT"].includes(receipt.channel)
    }))
  };
}

async function loadView(threadId: string, actor: Actor) {
  const quote = await latestQuote(threadId);
  if (!quote) return null;
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { id: true, orderNumber: true }
  });
  if (!thread) throw crmNotFound("Chat");
  const order = await orderForThread(thread.orderNumber);
  const existing = await prisma.crmLeadPayment.findUnique({ where: { enquiryThreadId: threadId } });
  let saved = existing
    ? await prisma.crmLeadPayment.update({
        where: { id: existing.id },
        data: {
          quotationId: quote.id,
          currency: quote.currency,
          totalInPaise: quote.grandTotalInPaise,
          orderId: order?.id ?? existing.orderId
        }
      })
    : null;
  if (!saved) {
    try {
      saved = await prisma.crmLeadPayment.create({
        data: {
          enquiryThreadId: threadId,
          quotationId: quote.id,
          orderId: order?.id ?? null,
          currency: quote.currency,
          totalInPaise: quote.grandTotalInPaise
        }
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
      saved = await prisma.crmLeadPayment.findUniqueOrThrow({ where: { enquiryThreadId: threadId } });
    }
  }
  const synced = await syncGatewayReceipts(saved.id, saved.orderId, quote.currency);
  const row = await prisma.crmLeadPayment.findUniqueOrThrow({
    where: { id: saved.id },
    include: { receipts: { orderBy: { createdAt: "desc" } } }
  });
  const view = present(row, quote.quoteNumber, order?.orderNumber ?? thread.orderNumber, isAccountingEmailAllowed(actor.email));
  if (synced && view.receivedInPaise > 0 && view.balanceInPaise > 0) {
    await maybeRemind(threadId, actor, quote.quoteNumber, view.balanceInPaise, view.currency);
  }
  return view;
}

export async function getLeadPayment(threadId: string, actor: Actor) {
  return loadView(threadId, actor);
}

export async function updateLeadPayment(
  threadId: string,
  actor: Actor,
  input: { method: LeadPaymentMethod; dueDate: string | null }
) {
  const current = await loadView(threadId, actor);
  if (!current) throw new CrmError("Create a quotation before recording payment", "NO_QUOTE", 400);
  await prisma.crmLeadPayment.update({
    where: { id: current.id },
    data: { method: input.method, dueAt: dueAtFromDate(input.dueDate) }
  });
  return loadView(threadId, actor);
}

export async function recordLeadReceipt(
  threadId: string,
  actor: Actor,
  input: { amountInPaise: number; channel: (typeof RECORD_CHANNELS)[number]; reference?: string | null; note?: string | null }
) {
  if (!RECORD_CHANNELS.includes(input.channel)) {
    throw new CrmError("Choose bank, COD collection, or COD settlement", "VALIDATION_ERROR", 400);
  }
  if (input.channel === "COD_SETTLEMENT") assertFinance(actor);
  const current = await loadView(threadId, actor);
  if (!current) throw new CrmError("Create a quotation before recording payment", "NO_QUOTE", 400);
  if (input.amountInPaise <= 0) throw new CrmError("Enter an amount", "VALIDATION_ERROR", 400);
  const counts = input.channel !== "COD_COLLECTION";
  if (counts && input.amountInPaise > current.balanceInPaise) {
    throw new CrmError("That amount is more than the balance", "VALIDATION_ERROR", 400);
  }
  const status = input.channel === "BANK_UPI" ? "PENDING" : input.channel === "COD_COLLECTION" ? "COLLECTED" : "VERIFIED";
  await prisma.crmLeadPaymentReceipt.create({
    data: {
      leadPaymentId: current.id,
      amountInPaise: input.amountInPaise,
      channel: input.channel,
      status,
      reference: input.reference || null,
      note: input.note || null,
      recordedByEmail: actor.email,
      verifiedByEmail: status === "VERIFIED" ? actor.email : null,
      verifiedAt: status === "VERIFIED" ? new Date() : null
    }
  });
  const next = await loadView(threadId, actor);
  if (status === "VERIFIED" && next && next.receivedInPaise > 0 && next.balanceInPaise > 0 && next.quoteNumber) {
    await maybeRemind(threadId, actor, next.quoteNumber, next.balanceInPaise, next.currency);
  }
  return next;
}

export async function verifyLeadReceipt(threadId: string, receiptId: string, actor: Actor) {
  assertFinance(actor);
  const current = await loadView(threadId, actor);
  if (!current) throw crmNotFound("Payment");
  const receipt = current.receipts.find((row) => row.id === receiptId);
  if (!receipt || receipt.channel !== "BANK_UPI" || receipt.status !== "PENDING") {
    throw new CrmError("This payment is not waiting for finance", "VALIDATION_ERROR", 400);
  }
  await prisma.crmLeadPaymentReceipt.update({
    where: { id: receiptId },
    data: { status: "VERIFIED", verifiedByEmail: actor.email, verifiedAt: new Date() }
  });
  const next = await loadView(threadId, actor);
  if (next && next.receivedInPaise > 0 && next.balanceInPaise > 0 && next.quoteNumber) {
    await maybeRemind(threadId, actor, next.quoteNumber, next.balanceInPaise, next.currency);
  }
  return next;
}

export async function rejectLeadReceipt(threadId: string, receiptId: string, actor: Actor) {
  assertFinance(actor);
  const current = await loadView(threadId, actor);
  if (!current) throw crmNotFound("Payment");
  const receipt = current.receipts.find((row) => row.id === receiptId);
  if (!receipt || receipt.status !== "PENDING") {
    throw new CrmError("This payment is not waiting for finance", "VALIDATION_ERROR", 400);
  }
  await prisma.crmLeadPaymentReceipt.update({
    where: { id: receiptId },
    data: { status: "REJECTED", verifiedByEmail: actor.email, verifiedAt: new Date() }
  });
  return loadView(threadId, actor);
}

export async function shareLeadPaymentLink(threadId: string, actor: Actor) {
  assertFinance(actor);
  const current = await loadView(threadId, actor);
  if (!current) throw new CrmError("Create a quotation before sharing a payment link", "NO_QUOTE", 400);
  if (current.balanceInPaise <= 0) throw new CrmError("Nothing is left to collect", "VALIDATION_ERROR", 400);
  if (current.currency !== "INR") {
    throw new CrmError("Payment links are for INR. Share the bank details for this currency.", "VALIDATION_ERROR", 400);
  }
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { customerName: true, customerEmail: true, customerPhone: true, waPhone: true }
  });
  if (!thread) throw crmNotFound("Chat");
  const link = await createRazorpayPaymentLink({
    amountInPaise: current.balanceInPaise,
    description: `Quotation ${current.quoteNumber ?? ""}`.trim(),
    customer: {
      name: thread.customerName,
      email: thread.customerEmail,
      phone: thread.waPhone || thread.customerPhone
    },
    notes: {
      enquiryThreadId: threadId,
      quotationId: current.quotationId ?? "",
      leadPaymentId: current.id
    }
  });
  await prisma.crmLeadPayment.update({
    where: { id: current.id },
    data: { paymentLinkUrl: link.url }
  });
  await replyToEnquiryThread(
    threadId,
    actor,
    `Payment link for ${current.quoteNumber}\nAmount due: ${moneyLabel(current.balanceInPaise, current.currency)}\n${link.url}`
  );
  return loadView(threadId, actor);
}
