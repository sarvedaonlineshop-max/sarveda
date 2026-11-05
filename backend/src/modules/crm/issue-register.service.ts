import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { pushStaff, RETURNS_EMAILS, LOGISTICS_EMAILS } from "./staff-notify";

type IssueInput = {
  kind: "NEGATIVE_FEEDBACK" | "PRODUCT_COMPLAINT" | "RETURN" | "DELIVERY" | "DEFECT";
  sourceKey: string;
  orderId?: string | null;
  orderNumber?: string | null;
  enquiryThreadId?: string | null;
  sku?: string | null;
  productName?: string | null;
  supplier?: string | null;
  ownerEmail?: string | null;
  summary: string;
};

export async function ensureIssue(input: IssueInput): Promise<{ created: boolean }> {
  const existing = await prisma.crmIssue.findUnique({ where: { sourceKey: input.sourceKey }, select: { id: true } });
  if (existing) return { created: false };
  await prisma.crmIssue.create({
    data: {
      kind: input.kind,
      sourceKey: input.sourceKey,
      orderId: input.orderId ?? null,
      orderNumber: input.orderNumber ?? null,
      enquiryThreadId: input.enquiryThreadId ?? null,
      sku: input.sku ?? null,
      productName: input.productName ?? null,
      supplier: input.supplier ?? null,
      ownerEmail: input.ownerEmail ?? null,
      summary: input.summary.slice(0, 500)
    }
  });
  return { created: true };
}

export async function noteReturnRequested(input: {
  orderNumber: string;
  reasonLabel: string;
  type: string;
}): Promise<void> {
  try {
    const request = await prisma.orderServiceRequest.findFirst({
      where: { orderNumber: input.orderNumber, type: { in: ["REFUND_AFTER_DELIVERY", "CANCEL_BEFORE_DELIVERY"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderId: true,
        orderNumber: true,
        caseNumber: true,
        reasonLabel: true,
        items: { take: 1, select: { skuSnapshot: true, nameSnapshot: true } }
      }
    });
    if (!request) return;
    const thread = await prisma.enquiryThread.findFirst({
      where: { orderNumber: request.orderNumber },
      select: { id: true, crmOwner: { select: { email: true } } }
    });
    const { created } = await ensureIssue({
      kind: "RETURN",
      sourceKey: `return:${request.id}`,
      orderId: request.orderId,
      orderNumber: request.orderNumber,
      enquiryThreadId: thread?.id ?? null,
      sku: request.items[0]?.skuSnapshot ?? null,
      productName: request.items[0]?.nameSnapshot ?? null,
      ownerEmail: "sowmya@sarveda.com",
      summary: `${request.caseNumber}: ${request.reasonLabel || input.reasonLabel}`
    });
    if (!created) return;
    await pushStaff(
      RETURNS_EMAILS,
      "Return / refund",
      `${request.caseNumber} on ${request.orderNumber}. Sowmya reviews, Shiva handles pickup.`,
      { type: "order", orderNumber: request.orderNumber, link: `/admin/returns/${request.caseNumber}` }
    );
  } catch (err) {
    logger.warn("issue_return_register_failed", { orderNumber: input.orderNumber, err });
  }
}

export async function noteDeliveryProblem(input: {
  orderId: string;
  orderNumber: string;
  shipmentId?: string | null;
  summary: string;
}): Promise<void> {
  try {
    const thread = await prisma.enquiryThread.findFirst({
      where: { orderNumber: input.orderNumber },
      select: { id: true }
    });
    const key = input.shipmentId ? `delivery:${input.shipmentId}` : `delivery:${input.orderId}:${input.summary.slice(0, 40)}`;
    const { created } = await ensureIssue({
      kind: "DELIVERY",
      sourceKey: key,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      enquiryThreadId: thread?.id ?? null,
      ownerEmail: "shiva@sarveda.com",
      summary: input.summary
    });
    if (!created) return;
    await pushStaff(LOGISTICS_EMAILS, "Delivery problem", `${input.orderNumber}: ${input.summary}`, {
      type: "order",
      orderNumber: input.orderNumber,
      link: "/admin/shipments"
    });
  } catch (err) {
    logger.warn("issue_delivery_register_failed", { orderId: input.orderId, err });
  }
}

export async function updateIssue(
  id: string,
  input: { status?: "OPEN" | "IN_PROGRESS" | "RESOLVED"; correctiveAction?: string | null }
) {
  return prisma.crmIssue.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.correctiveAction !== undefined ? { correctiveAction: input.correctiveAction } : {})
    }
  });
}
