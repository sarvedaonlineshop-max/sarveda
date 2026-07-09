import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { getOrCreateZohoContact } from "./zoho-contacts";
import { zohoPost } from "./zoho-client";

type JsonRecord = Record<string, unknown>;

function paymentModeForProvider(provider: string): string {
  if (provider === "RAZORPAY") return "razorpay";
  if (provider === "STRIPE") return "stripe";
  if (provider === "PAYPAL") return "paypal";
  return "cash";
}

function mergeJson(base: unknown, extra: JsonRecord): JsonRecord {
  const current = base && typeof base === "object" && !Array.isArray(base) ? (base as JsonRecord) : {};
  return { ...current, ...extra };
}

async function getZohoContactIdForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { addresses: true, customer: true }
  });
  if (!order) return null;

  const shippingAddress = order.addresses.find((a) => a.type === "SHIPPING") ?? order.addresses[0];
  return getOrCreateZohoContact({
    name: shippingAddress?.fullName ?? order.customer?.name ?? "Customer",
    email: order.customer?.email ?? order.email,
    phone: shippingAddress?.phone ?? order.phone,
    address: shippingAddress
      ? {
          line1: shippingAddress.line1 ?? "",
          city: shippingAddress.city ?? "",
          state: shippingAddress.state ?? "",
          zip: shippingAddress.postalCode ?? "",
          country: shippingAddress.country ?? "IN"
        }
      : undefined
  });
}

/**
 * For online-paid website orders, Zoho needs a Customer Payment entry in addition
 * to the invoice. Without this, the invoice stays "Due Today" even though the
 * gateway captured money on Sarveda.
 */
export async function recordZohoPaymentForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" } } }
  });
  if (!order?.zohoInvoiceId) return;

  const payment = order.payments.find((p) => p.status === "CAPTURED");
  if (!payment) return;
  if (payment.provider === "COD") return;

  const raw = payment.rawPayload as JsonRecord | null;
  if (typeof raw?.zohoCustomerPaymentId === "string" && raw.zohoCustomerPaymentId.trim()) {
    return;
  }

  const customerId = await getZohoContactIdForOrder(orderId);
  if (!customerId) {
    logger.warn("zoho_payment_skipped_no_customer", { orderId, zohoInvoiceId: order.zohoInvoiceId });
    return;
  }

  const amount = order.grandTotalInPaise / 100;
  const paymentDate = (order.placedAt ?? order.updatedAt ?? order.createdAt).toISOString().slice(0, 10);
  const referenceNumber = payment.providerPaymentId || payment.providerOrderId || order.orderNumber;
  const result = await zohoPost<{
    payment?: { payment_id?: string; reference_number?: string };
  }>("/customerpayments", {
    customer_id: customerId,
    payment_mode: paymentModeForProvider(payment.provider),
    amount,
    date: paymentDate,
    reference_number: referenceNumber,
    description: `Website ${payment.provider} payment for ${order.orderNumber}`,
    invoices: [
      {
        invoice_id: order.zohoInvoiceId,
        amount_applied: amount,
        tax_amount_withheld: 0
      }
    ]
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      rawPayload: mergeJson(payment.rawPayload, {
        zohoCustomerPaymentId: result.payment?.payment_id ?? null,
        zohoCustomerPaymentReference: result.payment?.reference_number ?? referenceNumber
      }) as Prisma.InputJsonValue
    }
  });

  logger.info("zoho_customer_payment_recorded", {
    orderId,
    paymentId: payment.id,
    zohoInvoiceId: order.zohoInvoiceId,
    zohoCustomerPaymentId: result.payment?.payment_id ?? null
  });
}

/**
 * Cancelled COD/unpaid orders should not remain collectible dues in Zoho.
 * Void the Zoho invoice when no online payment was captured.
 */
export async function voidZohoInvoiceForCancelledOrder(orderId: string, reason: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" } } }
  });
  if (!order?.zohoInvoiceId) return;

  const hasCapturedPayment = order.payments.some((p) => p.status === "CAPTURED");
  if (hasCapturedPayment) return;

  try {
    await zohoPost(`/invoices/${order.zohoInvoiceId}/status/void`, {});
    logger.info("zoho_invoice_voided", {
      orderId,
      zohoInvoiceId: order.zohoInvoiceId,
      reason
    });
  } catch (err) {
    logger.error("zoho_invoice_void_failed", {
      orderId,
      zohoInvoiceId: order.zohoInvoiceId,
      reason,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
