import { randomUUID } from "crypto";

import { prisma } from "./commerce";

export type SyntheticPaidOrderOpts = {
  provider?: "RAZORPAY" | "STRIPE" | "PAYPAL" | "COD";
  paymentStatus?: "CAPTURED" | "PENDING" | "REFUNDED" | "PARTIALLY_REFUNDED";
  status?: "PAID" | "PROCESSING" | "PENDING_PAYMENT" | "CANCELLED" | "REFUNDED";
  currency?: string;
  subtotalInPaise?: number;
  discountInPaise?: number;
  shippingInPaise?: number;
  shippingState?: string;
  shippingCountry?: string;
  placedAt?: Date;
  zohoInvoiceId?: string;
  lines?: Array<{
    variantId?: string;
    unitPriceInPaise: number;
    qtyOrdered: number;
    taxClass?: string;
    sku?: string;
    nameSnapshot?: string;
    productType?: "SIMPLE" | "VARIABLE" | "DIGITAL";
  }>;
};

let productCounter = 0;

async function ensureVariant(taxClass: string, unitPriceInPaise: number) {
  productCounter += 1;
  const suffix = `${Date.now()}-${productCounter}-${randomUUID().slice(0, 6)}`;
  const product = await prisma.product.create({
    data: {
      slug: `acct-prod-${suffix}`,
      name: `Accounting Test ${suffix}`,
      status: "ACTIVE",
      productType: "SIMPLE",
      taxClass
    }
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `ACCT-SKU-${suffix}`,
      mrpInPaise: unitPriceInPaise,
      saleInPaise: unitPriceInPaise,
      isDefault: true,
      status: "ACTIVE"
    }
  });
  return { productId: product.id, variantId: variant.id, sku: variant.sku };
}

export async function createSyntheticPaidOrder(opts: SyntheticPaidOrderOpts = {}) {
  const lines = opts.lines ?? [{ unitPriceInPaise: 118_000, qtyOrdered: 1, taxClass: "standard" }];
  const lineRows = [];
  let subtotal = 0;

  for (const line of lines) {
    const taxClass = line.taxClass ?? "standard";
    const variant = line.variantId
      ? {
          variantId: line.variantId,
          sku:
            line.sku ??
            (
              await prisma.productVariant.findUniqueOrThrow({
                where: { id: line.variantId },
                select: { sku: true }
              })
            ).sku
        }
      : await ensureVariant(taxClass, line.unitPriceInPaise);
    const lineTotal = line.unitPriceInPaise * line.qtyOrdered;
    subtotal += lineTotal;
    lineRows.push({
      variantId: variant.variantId,
      skuSnapshot: line.sku ?? variant.sku,
      nameSnapshot: line.nameSnapshot ?? `Item ${variant.sku}`,
      qtyOrdered: line.qtyOrdered,
      unitPriceInPaise: line.unitPriceInPaise,
      lineTotalInPaise: lineTotal
    });
  }

  const discount = opts.discountInPaise ?? 0;
  const shipping = opts.shippingInPaise ?? 0;
  const grandTotal = subtotal - discount + shipping;
  const provider = opts.provider ?? "RAZORPAY";
  const paymentStatus =
    opts.paymentStatus ?? (provider === "COD" ? "PENDING" : "CAPTURED");
  const orderStatus = opts.status ?? "PAID";

  const order = await prisma.order.create({
    data: {
      orderNumber: `SRV-ACCT-${randomUUID().slice(0, 8)}`,
      email: `acct-${randomUUID().slice(0, 6)}@test.local`,
      phone: "9999900000",
      status: orderStatus,
      paymentStatus: provider === "COD" ? "PENDING" : "CAPTURED",
      subtotalInPaise: subtotal,
      discountInPaise: discount,
      shippingInPaise: shipping,
      grandTotalInPaise: grandTotal,
      currency: opts.currency ?? "INR",
      placedAt: opts.placedAt ?? new Date("2026-08-22T10:00:00.000Z"),
      zohoInvoiceId: opts.zohoInvoiceId,
      items: { create: lineRows },
      addresses: {
        create: [
          {
            type: "SHIPPING",
            fullName: "Test Buyer",
            phone: "9999900000",
            line1: "1 Test Lane",
            city: opts.shippingState === "Maharashtra" ? "Mumbai" : "Bengaluru",
            state: opts.shippingState ?? "Karnataka",
            postalCode: "560001",
            country: opts.shippingCountry ?? "IN"
          }
        ]
      },
      payments: {
        create: {
          provider,
          amountInPaise: grandTotal,
          currency: opts.currency ?? "INR",
          status: paymentStatus,
          providerPaymentId:
            provider === "COD" ? undefined : `pay_test_${randomUUID().slice(0, 10)}`
        }
      }
    },
    include: { items: true, payments: true, addresses: true }
  });

  return order;
}

export async function createSyntheticFullRefund(
  order: {
    id: string;
    grandTotalInPaise: number;
    payments: Array<{ id: string }>;
  },
  opts?: {
    amountInPaise?: number;
    status?: string;
    providerRefundId?: string | null;
    reason?: string;
    skipPaymentUpdate?: boolean;
    createdAt?: Date;
  }
) {
  const paymentId = order.payments[0]?.id;
  if (!paymentId) throw new Error("Order has no payment");

  const amount = opts?.amountInPaise ?? order.grandTotalInPaise;
  const status = opts?.status ?? "processed";
  const providerRefundId =
    opts?.providerRefundId === null
      ? null
      : opts?.providerRefundId ?? `rfnd_test_${randomUUID().slice(0, 10)}`;

  const refund = await prisma.refund.create({
    data: {
      paymentId,
      amountInPaise: amount,
      status,
      providerRefundId: providerRefundId ?? undefined,
      reason: opts?.reason ?? "Test full refund",
      ...(opts?.createdAt ? { createdAt: opts.createdAt } : {})
    }
  });

  if (!opts?.skipPaymentUpdate) {
    const fully = amount >= order.grandTotalInPaise;
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: fully ? "REFUNDED" : "PARTIALLY_REFUNDED",
        refundedInPaise: amount
      }
    });
    if (fully) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED", paymentStatus: "REFUNDED" }
      });
    } else {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PARTIALLY_REFUNDED" }
      });
    }
  }

  return refund;
}

export async function createSyntheticPartialRefunds(
  order: {
    id: string;
    grandTotalInPaise: number;
    payments: Array<{ id: string }>;
  },
  amounts: number[]
) {
  const paymentId = order.payments[0]?.id;
  if (!paymentId) throw new Error("Order has no payment");

  const refunds = [];
  let total = 0;
  for (const amount of amounts) {
    total += amount;
    refunds.push(
      await prisma.refund.create({
        data: {
          paymentId,
          amountInPaise: amount,
          status: "processed",
          providerRefundId: `rfnd_part_${randomUUID().slice(0, 8)}`,
          reason: "Test partial refund"
        }
      })
    );
  }

  const fully = total >= order.grandTotalInPaise;
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: fully ? "REFUNDED" : "PARTIALLY_REFUNDED",
      refundedInPaise: total
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: fully
      ? { status: "REFUNDED", paymentStatus: "REFUNDED" }
      : { paymentStatus: "PARTIALLY_REFUNDED" }
  });

  return refunds;
}

export async function cleanupSyntheticPaidOrder(orderId: string) {
  const payments = await prisma.payment.findMany({
    where: { orderId },
    select: { id: true }
  });
  const paymentIds = payments.map((p) => p.id);
  const refundIds =
    paymentIds.length > 0
      ? (
          await prisma.refund.findMany({
            where: { paymentId: { in: paymentIds } },
            select: { id: true }
          })
        ).map((r) => r.id)
      : [];

  if (refundIds.length > 0) {
    await prisma.accountingDocumentLink.deleteMany({
      where: { documentType: "REFUND", documentId: { in: refundIds } }
    });
  }
  await prisma.accountingDocumentLink.deleteMany({
    where: { documentType: "ORDER", documentId: orderId }
  });
  await prisma.accountingPostingEvent.deleteMany({
    where: { sourceType: "ORDER", sourceId: orderId }
  });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
  if (paymentIds.length > 0) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
  }
  await prisma.payment.deleteMany({ where: { orderId } });
  await prisma.orderItem.deleteMany({ where: { orderId } });
  await prisma.orderAddress.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
}
