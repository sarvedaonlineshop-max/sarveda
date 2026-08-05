import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { verifySupportFlowToken } from "./whatsapp-flow.token";

const flowRequestSchema = z.object({
  version: z.string().max(20),
  action: z.string().max(40),
  screen: z.string().max(80).nullish(),
  data: z.record(z.unknown()).default({}),
  flow_token: z.string().max(4096).nullish()
});

const supportTopicSchema = z.enum([
  "order_issue",
  "payment_issue",
  "track_order",
  "live_agent",
  "exit"
]);

const issueTypeSchema = z.enum([
  "damaged",
  "wrong_item",
  "description_mismatch"
]);

const ratingSchema = z.enum(["1", "2", "3", "4", "5"]);

type FlowResponse = {
  version: "3.0";
  screen?: string;
  data: Record<string, unknown>;
};

const ISSUE_LABELS: Record<z.infer<typeof issueTypeSchema>, string> = {
  damaged: "Item broken or damaged",
  wrong_item: "Wrong item received",
  description_mismatch: "Item does not match the website description"
};

function response(screen: string, data: Record<string, unknown> = {}): FlowResponse {
  return { version: "3.0", screen, data };
}

function phoneCandidates(e164: string): string[] {
  const digits = e164.replace(/\D/g, "");
  const candidates = new Set([e164, digits, `+${digits}`]);
  if (digits.startsWith("91") && digits.length === 12) {
    candidates.add(digits.slice(2));
  }
  return [...candidates];
}

function orderOwnershipWhere(phone: string) {
  const candidates = phoneCandidates(phone);
  return {
    OR: [
      { phone: { in: candidates } },
      { addresses: { some: { phone: { in: candidates } } } },
      { customer: { phone: { in: candidates } } }
    ]
  };
}

function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function listOrders(phone: string) {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      ...orderOwnershipWhere(phone)
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      currency: true,
      grandTotalInPaise: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return orders.map((order) => ({
    id: order.id,
    title: order.orderNumber,
    description: `${statusLabel(order.status)} · ${formatMoney(
      order.grandTotalInPaise,
      order.currency
    )} · ${order.createdAt.toLocaleDateString("en-IN")}`
  }));
}

async function findOwnedOrder(phone: string, orderId: string) {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      deletedAt: null,
      ...orderOwnershipWhere(phone)
    },
    include: {
      items: {
        select: {
          nameSnapshot: true,
          skuSnapshot: true,
          qtyOrdered: true,
          lineTotalInPaise: true
        }
      },
      addresses: {
        where: { type: "SHIPPING" },
        select: { fullName: true },
        take: 1
      }
    }
  });
}

async function whatsappThread(phone: string, customerName: string) {
  const existing = await prisma.enquiryThread.findFirst({
    where: { source: "WHATSAPP", waPhone: phone },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true }
  });
  if (existing) return existing;

  return prisma.enquiryThread.create({
    data: {
      source: "WHATSAPP",
      customerName,
      customerEmail: `wa-${phone.replace(/\D/g, "")}@whatsapp.invalid`,
      customerPhone: phone,
      waPhone: phone,
      unreadByAdmin: true,
      lastCustomerMessageAt: new Date()
    },
    select: { id: true }
  });
}

async function recordOrderIssue(
  phone: string,
  order: Awaited<ReturnType<typeof findOwnedOrder>> & {},
  issueType: z.infer<typeof issueTypeSchema>
): Promise<void> {
  if (!order) return;
  const name = order.addresses[0]?.fullName || phone;
  const thread = await whatsappThread(phone, name);
  const issueLabel = ISSUE_LABELS[issueType];
  const customerBody = `Order issue submitted via WhatsApp Flow\nOrder: ${order.orderNumber}\nIssue: ${issueLabel}`;
  const apology =
    `We're sorry about the issue with ${order.orderNumber}. ` +
    "Your request has been shared with our support team.";

  await prisma.$transaction(async (tx) => {
    const duplicate = await tx.enquiryMessage.findFirst({
      where: {
        threadId: thread.id,
        authorType: "CUSTOMER",
        body: customerBody,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
      },
      select: { id: true }
    });
    if (!duplicate) {
      await tx.enquiryMessage.createMany({
        data: [
          {
            threadId: thread.id,
            authorType: "CUSTOMER",
            authorName: name,
            authorEmail: `wa-${phone.replace(/\D/g, "")}@whatsapp.invalid`,
            body: customerBody
          },
          {
            threadId: thread.id,
            authorType: "ADMIN",
            authorName: "Sarveda Assistant",
            authorEmail: "bot@sarveda.com",
            body: apology
          }
        ]
      });
    }
    await tx.enquiryThread.update({
      where: { id: thread.id },
      data: {
        subjectCategory: "ORDER",
        customSubject: issueLabel,
        orderNumber: order.orderNumber,
        contextTitle: `WhatsApp order issue · ${order.orderNumber}`,
        status: "OPEN",
        unreadByAdmin: true,
        lastMessageAt: new Date()
      }
    });
  });
}

async function recordFeedback(phone: string, orderId: string, rating: string): Promise<void> {
  const order = await findOwnedOrder(phone, orderId);
  if (!order) return;
  const thread = await prisma.enquiryThread.findFirst({
    where: { source: "WHATSAPP", waPhone: phone },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true }
  });
  if (!thread) return;

  const body = `WhatsApp support chat rating: ${rating}/5 · Order ${order.orderNumber}`;
  const duplicate = await prisma.enquiryMessage.findFirst({
    where: {
      threadId: thread.id,
      authorType: "CUSTOMER",
      body,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
    },
    select: { id: true }
  });
  if (duplicate) return;

  await prisma.$transaction([
    prisma.enquiryMessage.create({
      data: {
        threadId: thread.id,
        authorType: "CUSTOMER",
        authorName: order.addresses[0]?.fullName || phone,
        authorEmail: `wa-${phone.replace(/\D/g, "")}@whatsapp.invalid`,
        body
      }
    }),
    prisma.enquiryThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date(), unreadByAdmin: true }
    })
  ]);
}

function exitMessage(topic: z.infer<typeof supportTopicSchema>): string {
  switch (topic) {
    case "payment_issue":
      return "Payment support is being prepared. Please choose live agent from the main menu for immediate help.";
    case "track_order":
      return "Order tracking is being prepared. Please choose live agent from the main menu for immediate help.";
    case "live_agent":
      return "Our support team has been notified. You can close this form and continue in WhatsApp.";
    default:
      return "Thank you for contacting Sarveda.";
  }
}

export async function handleDecryptedFlowRequest(input: unknown): Promise<FlowResponse> {
  const parsed = flowRequestSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn("whatsapp_flow_invalid_payload", { issues: parsed.error.issues });
    return response("ERROR", { message: "We could not process this request. Please try again." });
  }

  const request = parsed.data;
  if (request.action.toLowerCase() === "ping") {
    return { version: "3.0", data: { status: "active" } };
  }

  const token = request.flow_token ? verifySupportFlowToken(request.flow_token) : null;
  if (!token) {
    logger.warn("whatsapp_flow_invalid_token");
    return response("ERROR", { message: "This support session expired. Send Hi again to restart." });
  }

  if (request.action === "INIT") {
    return response("SUPPORT_MENU");
  }

  const screen = request.screen || "";
  if (request.action === "BACK") {
    if (screen === "ORDER_DETAILS") {
      const orders = await listOrders(token.phone);
      return response("ORDER_LIST", { orders });
    }
    return response("SUPPORT_MENU");
  }

  if (request.action !== "data_exchange") {
    return response("ERROR", { message: "Unsupported action. Please send Hi to restart." });
  }

  if (screen === "SUPPORT_MENU") {
    const topic = supportTopicSchema.safeParse(request.data.support_topic);
    if (!topic.success) return response("SUPPORT_MENU");
    if (topic.data !== "order_issue") {
      return response("EXIT", { message: exitMessage(topic.data) });
    }

    const orders = await listOrders(token.phone);
    if (orders.length === 0) {
      return response("EXIT", {
        message:
          "We couldn't find an order linked to this WhatsApp number. Please choose live agent and share your order number."
      });
    }
    return response("ORDER_LIST", { orders });
  }

  if (screen === "ORDER_LIST") {
    const orderId = z.string().uuid().safeParse(request.data.order_id);
    if (!orderId.success) return response("ORDER_LIST", { orders: await listOrders(token.phone) });

    const order = await findOwnedOrder(token.phone, orderId.data);
    if (!order) {
      return response("EXIT", { message: "That order is not linked to this WhatsApp number." });
    }

    const items = order.items
      .map(
        (item, index) =>
          `${index + 1}. ${item.nameSnapshot} × ${item.qtyOrdered} — ${formatMoney(
            item.lineTotalInPaise,
            order.currency
          )}`
      )
      .join("\n");

    return response("ORDER_DETAILS", {
      order_id: order.id,
      order_heading: `${order.orderNumber} · ${statusLabel(order.status)}`,
      items_text: items.slice(0, 3000),
      subtotal_text: `Subtotal: ${formatMoney(order.subtotalInPaise, order.currency)}`,
      total_text: `Total: ${formatMoney(order.grandTotalInPaise, order.currency)}`
    });
  }

  if (screen === "ORDER_DETAILS") {
    const orderId = z.string().uuid().safeParse(request.data.order_id);
    const issueType = issueTypeSchema.safeParse(request.data.issue_type);
    if (!orderId.success || !issueType.success) {
      return response("ERROR", { message: "Select an issue type and try again." });
    }

    const order = await findOwnedOrder(token.phone, orderId.data);
    if (!order) {
      return response("EXIT", { message: "That order is not linked to this WhatsApp number." });
    }
    await recordOrderIssue(token.phone, order, issueType.data);
    return response("FEEDBACK", {
      order_id: order.id,
      apology_text:
        `We're very sorry about your ${ISSUE_LABELS[issueType.data].toLowerCase()} ` +
        `for order ${order.orderNumber}. Our support team will review it shortly.`
    });
  }

  if (screen === "FEEDBACK") {
    const orderId = z.string().uuid().safeParse(request.data.order_id);
    const rating = ratingSchema.safeParse(request.data.rating);
    if (!orderId.success || !rating.success) {
      return response("FEEDBACK", {
        order_id: request.data.order_id || "",
        apology_text: "Please rate your chat experience to continue."
      });
    }
    await recordFeedback(token.phone, orderId.data, rating.data);
    return response("THANK_YOU");
  }

  return response("ERROR", { message: "Unknown screen. Please send Hi to restart." });
}
