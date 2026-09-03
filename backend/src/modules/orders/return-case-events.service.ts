import type { OrderServiceRequestEventType, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CaseEventActor = {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
};

export async function appendCaseEvent(
  opts: {
    requestId: string;
    eventType: OrderServiceRequestEventType;
    message?: string | null;
    payloadJson?: Prisma.InputJsonValue;
    actor?: CaseEventActor;
  },
  db: DbClient = prisma
): Promise<void> {
  await db.orderServiceRequestEvent.create({
    data: {
      requestId: opts.requestId,
      eventType: opts.eventType,
      message: opts.message?.trim() || null,
      payloadJson: opts.payloadJson ?? undefined,
      actorUserId: opts.actor?.userId ?? null,
      actorEmail: opts.actor?.email ?? null,
      actorRole: opts.actor?.role ?? null
    }
  });
}

export async function listCaseEvents(requestId: string) {
  return prisma.orderServiceRequestEvent.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" }
  });
}

/** Customer-safe event types — never leak internal accountability events. */
const CUSTOMER_VISIBLE_EVENTS = new Set<OrderServiceRequestEventType>([
  "CASE_CREATED",
  "EVIDENCE_ADDED",
  "MORE_INFO_REQUESTED",
  "MORE_INFO_PROVIDED",
  "APPROVED",
  "REJECTED",
  "PICKUP_REQUESTED",
  "CUSTOMER_SELF_SHIP_SUBMITTED",
  "ITEM_RECEIVED",
  "QC_PERFORMED",
  "REFUND_APPROVED",
  "REFUND_INITIATED",
  "REFUND_COMPLETED",
  "REPLACEMENT_INITIATED",
  "REPLACEMENT_SHIPPED",
  "REPLACEMENT_DELIVERED",
  "MISSING_PART_SHIPPED",
  "CASE_CLOSED",
  "STATUS_CHANGED"
]);

export function serializeCaseEventForCustomer(row: {
  id: string;
  eventType: OrderServiceRequestEventType;
  message: string | null;
  createdAt: Date;
}) {
  if (!CUSTOMER_VISIBLE_EVENTS.has(row.eventType)) return null;
  return {
    id: row.id,
    eventType: row.eventType,
    message: row.message,
    createdAt: row.createdAt
  };
}
