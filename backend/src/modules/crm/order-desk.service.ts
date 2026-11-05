import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { replyToEnquiryThread } from "../enquiries/enquiries.service";
import { WA_SESSION_WINDOW_MS } from "../whatsapp/whatsapp-inbox.service";
import { deriveReturnCaseStage, RETURN_CASE_STAGE_LABELS } from "../orders/return-case-stage";
import { crmNotFound, CrmError } from "./crm-errors";
import { ensureIssue, updateIssue } from "./issue-register.service";
import { collectionNote, deliveryStep, feedbackAfterResponse, feedbackMessage, trackingTimeline } from "./order-desk";
import { LOGISTICS_EMAILS, pushStaff } from "./staff-notify";

type Actor = { id: string; email: string; name: string | null };

const CONFIRMED = new Set(["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"]);

async function orderForThread(threadId: string) {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      source: true,
      lastCustomerMessageAt: true,
      crmOwner: { select: { email: true, name: true } }
    }
  });
  if (!thread) throw crmNotFound("Chat");
  if (!thread.orderNumber) return { thread, order: null };
  const order = await prisma.order.findFirst({
    where: { orderNumber: thread.orderNumber, deletedAt: null },
    include: {
      items: { select: { nameSnapshot: true, skuSnapshot: true, qtyOrdered: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 4, select: { provider: true, status: true } },
      shipments: { orderBy: { createdAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "asc" }, select: { toStatus: true, createdAt: true } }
    }
  });
  return { thread, order };
}

async function ensureFeedback(orderId: string, threadId: string, deliveredAt: Date | null) {
  if (!deliveredAt) return null;
  const existing = await prisma.crmDeliveryFeedback.findUnique({ where: { orderId } });
  if (existing) return existing;
  return prisma.crmDeliveryFeedback.create({
    data: {
      orderId,
      enquiryThreadId: threadId,
      status: "SCHEDULED",
      scheduledFor: new Date(deliveredAt.getTime() + 2 * 24 * 60 * 60 * 1000)
    }
  });
}

export async function getOrderDesk(threadId: string) {
  const { thread, order } = await orderForThread(threadId);
  if (!order) {
    return { order: null, returnCase: null, feedback: null, issues: [] };
  }
  const forward = order.shipments.find((row) => row.status !== "RTO") ?? order.shipments[0] ?? null;
  const rto = order.shipments.find((row) => row.status === "RTO" || row.rtoAt != null) ?? null;
  const deliveredAt = forward?.status === "DELIVERED" ? forward.deliveredAt ?? forward.updatedAt : order.status === "DELIVERED" ? order.updatedAt : null;
  const feedback = await ensureFeedback(order.id, thread.id, deliveredAt);
  const cod = order.payments.some((payment) => payment.provider === "COD");
  const pay = collectionNote({
    cod,
    confirmed: CONFIRMED.has(order.status),
    currency: order.currency,
    totalMinor: order.grandTotalInPaise
  });
  const request = await prisma.orderServiceRequest.findFirst({
    where: { orderId: order.id, type: { in: ["REFUND_AFTER_DELIVERY", "CANCEL_BEFORE_DELIVERY"] } },
    orderBy: { createdAt: "desc" },
    include: { items: { take: 1, select: { skuSnapshot: true, nameSnapshot: true } } }
  });
  if (request && !request.responsibleUserEmail) {
    await prisma.orderServiceRequest
      .update({
        where: { id: request.id },
        data: { responsibleUserEmail: "sowmya@sarveda.com", responsibleTeam: "CUSTOMER_CARE" }
      })
      .catch((err) => logger.warn("return_assign_failed", { caseNumber: request.caseNumber, err }));
  }
  if (request) {
    await ensureIssue({
      kind: "RETURN",
      sourceKey: `return:${request.id}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      enquiryThreadId: thread.id,
      sku: request.items[0]?.skuSnapshot ?? null,
      productName: request.items[0]?.nameSnapshot ?? null,
      ownerEmail: "sowmya@sarveda.com",
      summary: `${request.caseNumber}: ${request.reasonLabel || "Return / refund"}`
    });
  }
  if (rto) {
    await ensureIssue({
      kind: "DELIVERY",
      sourceKey: `delivery:${rto.id}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      enquiryThreadId: thread.id,
      ownerEmail: "shiva@sarveda.com",
      summary: `RTO on ${order.orderNumber}${rto.awb ? ` · ${rto.awb}` : ""}`
    });
  }
  const issues = await prisma.crmIssue.findMany({
    where: { OR: [{ orderId: order.id }, { enquiryThreadId: thread.id }] },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const stage = request ? deriveReturnCaseStage(request) : null;
  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      currency: order.currency,
      grandTotalInPaise: order.grandTotalInPaise,
      items: order.items.map((item) => ({
        name: item.nameSnapshot,
        sku: item.skuSnapshot,
        qty: item.qtyOrdered
      })),
      shippingMethod: order.preferredCourier || "Standard",
      shippingZone: order.shippingZone,
      courier: forward?.courier ?? null,
      awb: forward?.awb ?? null,
      trackingUrl: forward?.trackingUrl ?? null,
      step: deliveryStep(order.status, forward && forward.status !== "RTO" ? forward.status : null),
      ...trackingTimeline({
        orderStatus: order.status,
        placedAt: order.placedAt,
        history: order.statusHistory,
        shipment: forward
          ? {
              status: forward.status,
              createdAt: forward.createdAt,
              deliveredAt: forward.deliveredAt,
              courier: forward.courier
            }
          : null
      }),
      deliveredAt,
      rto: Boolean(rto),
      rtoAt: rto?.rtoAt ?? null,
      shippingError: order.shippingLastError,
      dispatchApproved: pay.dispatchApproved,
      collection: pay.instructions
    },
    returnCase: request
      ? {
          caseNumber: request.caseNumber,
          stageLabel: stage ? RETURN_CASE_STAGE_LABELS[stage] : "Requested",
          reason: request.reasonLabel,
          comment: request.message,
          assignee: "Sowmya owns the refund. Shiva owns the pickup."
        }
      : null,
    feedback: feedback
      ? {
          id: feedback.id,
          status: feedback.status,
          scheduledFor: feedback.scheduledFor,
          sentAt: feedback.sentAt,
          rating: feedback.rating,
          response: feedback.response,
          consent: feedback.consent
        }
      : null,
    issues
  };
}

export async function sendDeliveryFeedback(threadId: string, actor: Actor) {
  const desk = await getOrderDesk(threadId);
  if (!desk.feedback) throw new CrmError("Feedback is scheduled after delivery is confirmed", "NO_FEEDBACK", 400);
  if (!desk.feedback.consent) throw new CrmError("This customer has not agreed to a feedback message", "NO_CONSENT", 400);
  const { thread, order } = await orderForThread(threadId);
  if (!order || !thread) throw crmNotFound("Order");
  if (thread.source === "WHATSAPP") {
    const last = thread.lastCustomerMessageAt;
    if (!last || Date.now() - last.getTime() > WA_SESSION_WINDOW_MS) {
      throw new CrmError(
        "The WhatsApp window is closed. Feedback stays scheduled until it can go out on an approved template.",
        "WINDOW_CLOSED",
        400
      );
    }
  }
  const body = feedbackMessage({ name: thread.customerName, orderNumber: order.orderNumber });
  await replyToEnquiryThread(threadId, actor, body);
  await prisma.crmDeliveryFeedback.update({
    where: { id: desk.feedback.id },
    data: { status: "SENT", sentAt: new Date() }
  });
  return getOrderDesk(threadId);
}

export async function recordDeliveryFeedback(
  threadId: string,
  actor: Actor,
  input: { rating: number; response?: string | null }
) {
  const { thread, order } = await orderForThread(threadId);
  if (!order) throw new CrmError("No order on this chat", "NO_ORDER", 400);
  const feedback = await prisma.crmDeliveryFeedback.findUnique({ where: { orderId: order.id } });
  if (!feedback) throw new CrmError("Feedback is not scheduled yet", "NO_FEEDBACK", 400);
  const status = feedbackAfterResponse(input.rating);
  await prisma.crmDeliveryFeedback.update({
    where: { id: feedback.id },
    data: { rating: input.rating, response: input.response || null, status }
  });
  const owner = thread.crmOwner?.email || LOGISTICS_EMAILS[0];
  if (status === "NEEDS_ATTENTION") {
    await ensureIssue({
      kind: "NEGATIVE_FEEDBACK",
      sourceKey: `feedback:${feedback.id}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      enquiryThreadId: thread.id,
      sku: order.items[0]?.skuSnapshot ?? null,
      productName: order.items[0]?.nameSnapshot ?? null,
      ownerEmail: owner,
      summary: `Rating ${input.rating} on ${order.orderNumber}. ${input.response || ""}`.trim()
    });
    await openFeedbackTask(actor, owner, order.orderNumber, input.rating, input.response || "");
  }
  await pushStaff([owner, ...LOGISTICS_EMAILS], "Delivery feedback", `${order.orderNumber} rated ${input.rating}`, {
    type: "chat",
    chatId: threadId,
    link: `/admin/chats/${threadId}`
  });
  return getOrderDesk(threadId);
}

async function openFeedbackTask(actor: Actor, assigneeEmail: string, orderNumber: string, rating: number, response: string) {
  try {
    const title = `Negative feedback · ${orderNumber}`;
    const complaint = await prisma.complaint.create({
      data: {
        raisedByEmail: actor.email.toLowerCase(),
        raisedByName: actor.name,
        assignedByEmail: actor.email.toLowerCase(),
        assignedByName: actor.name,
        title,
        description: `Rating ${rating}. ${response}`.slice(0, 2000),
        priority: "HIGH",
        status: "OPEN",
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
    await prisma.taskAssignee.create({
      data: {
        taskId: complaint.id,
        assigneeEmail: assigneeEmail.toLowerCase(),
        assigneeName: assigneeEmail.split("@")[0]
      }
    });
    await prisma.taskNotification.create({
      data: {
        recipientEmail: assigneeEmail.toLowerCase(),
        taskId: complaint.id,
        taskTitle: title,
        type: "ASSIGNED",
        message: `Negative feedback on ${orderNumber} needs attention.`
      }
    });
  } catch (err) {
    logger.warn("feedback_task_failed", { orderNumber, err });
  }
}

export async function resolveDeliveryFeedback(threadId: string) {
  const { order } = await orderForThread(threadId);
  if (!order) throw new CrmError("No order on this chat", "NO_ORDER", 400);
  const feedback = await prisma.crmDeliveryFeedback.findUnique({ where: { orderId: order.id } });
  if (!feedback) throw new CrmError("Feedback is not scheduled yet", "NO_FEEDBACK", 400);
  await prisma.crmDeliveryFeedback.update({ where: { id: feedback.id }, data: { status: "RESOLVED" } });
  const issue = await prisma.crmIssue.findUnique({ where: { sourceKey: `feedback:${feedback.id}` } });
  if (issue) await updateIssue(issue.id, { status: "RESOLVED" });
  return getOrderDesk(threadId);
}

export async function setFeedbackConsent(threadId: string, consent: boolean) {
  const { order } = await orderForThread(threadId);
  if (!order) throw new CrmError("No order on this chat", "NO_ORDER", 400);
  const feedback = await prisma.crmDeliveryFeedback.findUnique({ where: { orderId: order.id } });
  if (!feedback) throw new CrmError("Feedback is not scheduled yet", "NO_FEEDBACK", 400);
  await prisma.crmDeliveryFeedback.update({ where: { id: feedback.id }, data: { consent } });
  return getOrderDesk(threadId);
}

export async function updateOrderIssue(
  threadId: string,
  issueId: string,
  input: { status?: "OPEN" | "IN_PROGRESS" | "RESOLVED"; correctiveAction?: string | null }
) {
  const { thread, order } = await orderForThread(threadId);
  const issue = await prisma.crmIssue.findUnique({ where: { id: issueId } });
  const onThisChat =
    issue &&
    (issue.enquiryThreadId === thread.id || (order && issue.orderId === order.id) || issue.orderNumber === thread.orderNumber);
  if (!onThisChat) throw crmNotFound("Issue");
  await updateIssue(issueId, input);
  return getOrderDesk(threadId);
}

export async function notifyOrderConfirmed(orderId: string): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { orderNumber: true, grandTotalInPaise: true }
  });
  if (!order) return;
  const rupees = (order.grandTotalInPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  await pushStaff(LOGISTICS_EMAILS, "Order confirmed", `${order.orderNumber} · ₹${rupees}. Ready for packing and dispatch.`, {
    type: "order",
    orderNumber: order.orderNumber,
    link: "/admin/shipments"
  });
}
