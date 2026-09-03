import type { OrderStatus, Payment, PaymentProvider, PaymentStatus } from "@prisma/client";

import { prisma } from "../../config/db";

import { OrderSnapshotNotFoundError } from "./accounting-errors";
import type { OrderPaidLineSnapshot, OrderPaidSnapshot } from "./order-paid-journal.types";

type PaymentPick = Pick<Payment, "provider" | "status" | "createdAt">;

function pickPrimaryPayment<T extends PaymentPick>(payments: T[]): T | null {
  if (payments.length === 0) return null;

  const cod = payments.find((p) => p.provider === "COD");
  if (cod) return cod;

  const captured = payments
    .filter((p) => p.status === "CAPTURED")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (captured[0]) return captured[0];

  return payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

function toLineSnapshot(
  item: {
    id: string;
    skuSnapshot: string;
    nameSnapshot: string;
    qtyOrdered: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
    variantId: string | null;
    variant: {
      productId: string;
      productRel: { taxClass: string | null; hsnCode: string | null };
    } | null;
    digitalOffer: { taxClass: string } | null;
  }
): OrderPaidLineSnapshot {
  return {
    orderItemId: item.id,
    productId: item.variant?.productId ?? null,
    variantId: item.variantId,
    skuSnapshot: item.skuSnapshot,
    nameSnapshot: item.nameSnapshot,
    qtyOrdered: item.qtyOrdered,
    unitPriceInPaise: item.unitPriceInPaise,
    lineTotalInPaise: item.lineTotalInPaise,
    taxClass: item.variant?.productRel.taxClass ?? item.digitalOffer?.taxClass ?? "gst-5",
    hsnCode: item.variant?.productRel.hsnCode ?? null
  };
}

const orderInclude = {
  items: {
    include: {
      variant: {
        include: { productRel: { select: { taxClass: true, hsnCode: true } } }
      },
      digitalOffer: { select: { taxClass: true } }
    }
  },
  addresses: true,
  payments: { orderBy: { createdAt: "desc" as const } }
} as const;

type LoadedOrder = Awaited<
  ReturnType<
    typeof prisma.order.findFirst<{ include: typeof orderInclude }>
  >
>;

function buildSnapshotFromOrder(order: NonNullable<LoadedOrder>): OrderPaidSnapshot {
  const shipping =
    order.addresses.find((a) => a.type === "SHIPPING") ?? order.addresses[0] ?? null;
  const payment = pickPrimaryPayment(order.payments);

  if (!payment) {
    throw new OrderSnapshotNotFoundError(order.id);
  }
  if (!order.placedAt) {
    throw new OrderSnapshotNotFoundError(`${order.orderNumber} (missing placedAt)`);
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    placedAt: order.placedAt,
    currency: order.currency,
    status: order.status,
    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise,
    shippingInPaise: order.shippingInPaise,
    grandTotalInPaise: order.grandTotalInPaise,
    shippingCountry: shipping?.country ?? "",
    shippingState: shipping?.state ?? "",
    payment: {
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amountInPaise: payment.amountInPaise
    },
    lines: order.items.map(toLineSnapshot),
    zohoInvoiceId: order.zohoInvoiceId,
    zohoInvoiceNo: order.zohoInvoiceNo,
    buyerGstin: null
  };
}

export async function loadOrderPaidSnapshotById(orderId: string): Promise<OrderPaidSnapshot> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: orderInclude
  });
  if (!order) {
    throw new OrderSnapshotNotFoundError(orderId);
  }
  return buildSnapshotFromOrder(order);
}

export async function loadOrderPaidSnapshotByOrderNumber(
  orderNumber: string
): Promise<OrderPaidSnapshot> {
  const order = await prisma.order.findFirst({
    where: { orderNumber: orderNumber.trim(), deletedAt: null },
    include: orderInclude
  });
  if (!order) {
    throw new OrderSnapshotNotFoundError(orderNumber);
  }
  return buildSnapshotFromOrder(order);
}

export async function loadOrderPaidSnapshot(identifier: {
  orderId?: string;
  orderNumber?: string;
}): Promise<OrderPaidSnapshot> {
  if (identifier.orderId?.trim()) {
    return loadOrderPaidSnapshotById(identifier.orderId.trim());
  }
  if (identifier.orderNumber?.trim()) {
    return loadOrderPaidSnapshotByOrderNumber(identifier.orderNumber.trim());
  }
  throw new OrderSnapshotNotFoundError("orderId or orderNumber required");
}

export type OrderDiscoveryCandidate = {
  orderId: string;
  orderNumber: string;
  placedAt: Date;
  status: string;
  provider: PaymentProvider;
  paymentStatus: PaymentStatus;
  grandTotalInPaise: number;
};

/** Read-only query for discovery worker — committed paid-pipeline orders in scope. */
export async function findOrderDiscoveryCandidates(opts: {
  orderId?: string;
  orderNumber?: string;
  since?: Date;
  until?: Date;
  limit: number;
}): Promise<OrderDiscoveryCandidate[]> {
  const paidStatuses: OrderStatus[] = [
    "PAID",
    "PROCESSING",
    "PACKED",
    "SHIPPED",
    "DELIVERED",
    "REFUNDED"
  ];

  const where = {
    deletedAt: null,
    placedAt: { not: null as null },
    status: { in: paidStatuses },
    ...(opts.orderId ? { id: opts.orderId } : {}),
    ...(opts.orderNumber ? { orderNumber: opts.orderNumber.trim() } : {}),
    ...(!opts.orderId && !opts.orderNumber && opts.since && opts.until
      ? { placedAt: { gte: opts.since, lt: opts.until } }
      : {})
  };

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      orderNumber: true,
      placedAt: true,
      status: true,
      grandTotalInPaise: true,
      payments: {
        select: { provider: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: [{ placedAt: "asc" }, { id: "asc" }],
    take: opts.limit
  });

  return orders
    .filter((o) => o.placedAt)
    .map((o) => {
      const payment = pickPrimaryPayment(o.payments);
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        placedAt: o.placedAt!,
        status: o.status,
        provider: payment?.provider ?? "RAZORPAY",
        paymentStatus: payment?.status ?? "PENDING",
        grandTotalInPaise: o.grandTotalInPaise
      };
    });
}
