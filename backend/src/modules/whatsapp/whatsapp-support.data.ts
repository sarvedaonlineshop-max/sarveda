/**
 * Shared order lookups for WhatsApp support (button bot + Meta Flow).
 *
 * Orders are matched against the customer's WhatsApp number only — a customer
 * must never be able to see an order that isn't linked to their own number.
 */
import { prisma } from "../../config/db";

/** WhatsApp gives us E.164; orders may store the number in looser formats. */
function phoneCandidates(e164: string): string[] {
  const digits = e164.replace(/\D/g, "");
  const candidates = new Set([e164, digits, `+${digits}`]);
  if (digits.startsWith("91") && digits.length === 12) {
    candidates.add(digits.slice(2));
  }
  return [...candidates];
}

export function orderOwnershipWhere(phone: string) {
  const candidates = phoneCandidates(phone);
  return {
    OR: [
      { phone: { in: candidates } },
      { addresses: { some: { phone: { in: candidates } } } },
      { customer: { phone: { in: candidates } } }
    ]
  };
}

export function formatMoney(minor: number, currency: string): string {
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

export function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type OrderSummary = {
  id: string;
  title: string;
  description: string;
};

export async function listOrders(phone: string): Promise<OrderSummary[]> {
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

export async function findOwnedOrder(phone: string, orderId: string) {
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
      },
      shipments: {
        select: { courier: true, awb: true, trackingUrl: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
}

export type OwnedOrder = NonNullable<Awaited<ReturnType<typeof findOwnedOrder>>>;
