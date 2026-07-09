import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { getOrCreateZohoContact } from "./zoho-contacts";
import { zohoGet, zohoPost } from "./zoho-client";

type JsonRecord = Record<string, unknown>;
type ZohoInvoiceLine = {
  line_item_id?: string | number;
  item_id?: string | number;
  name?: string;
  description?: string;
  quantity?: number;
  rate?: number;
  tax_id?: string | number;
  product_type?: string;
  hsn_or_sac?: string | number;
  code?: string;
};
type ZohoInvoiceRecord = {
  customer_id?: string | null;
  line_items?: ZohoInvoiceLine[];
  shipping_charge?: number;
};
type ZohoChartAccount = {
  account_id: string;
  account_name: string;
};

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

async function getZohoInvoiceCustomerId(invoiceId: string): Promise<string | null> {
  try {
    const res = await zohoGet<{ invoice?: { customer_id?: string | null } }>(`/invoices/${invoiceId}`);
    const customerId = res.invoice?.customer_id?.trim();
    return customerId || null;
  } catch (err) {
    logger.warn("zoho_invoice_customer_lookup_failed", {
      invoiceId,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

async function getZohoInvoice(invoiceId: string): Promise<ZohoInvoiceRecord | null> {
  try {
    const res = await zohoGet<{ invoice?: ZohoInvoiceRecord }>(`/invoices/${invoiceId}`);
    return res.invoice ?? null;
  } catch (err) {
    logger.warn("zoho_invoice_lookup_failed", {
      invoiceId,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

async function findZohoAccountIdByName(accountName: string): Promise<string | null> {
  try {
    const res = await zohoGet<{ chartofaccounts?: ZohoChartAccount[] }>("/chartofaccounts");
    const exact = (res.chartofaccounts ?? []).find(
      (row) => row.account_name.trim().toLowerCase() === accountName.trim().toLowerCase()
    );
    return exact?.account_id ?? null;
  } catch (err) {
    logger.warn("zoho_account_lookup_failed", {
      accountName,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
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

  // Use the exact customer attached to the Zoho invoice. Re-resolving by email
  // can hit a different duplicate contact, and Zoho rejects that payment with
  // error 24011 ("selected customer for this invoice is incorrect").
  const customerId =
    (await getZohoInvoiceCustomerId(order.zohoInvoiceId)) ?? (await getZohoContactIdForOrder(orderId));
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

function refundModeForProvider(provider: string): string {
  if (provider === "COD") return "cash";
  return "banktransfer";
}

/**
 * Create a Zoho credit note + refund record for a captured online payment that
 * was refunded on Sarveda. This keeps Zoho finance docs aligned with gateway
 * reality, without affecting the already-correct stock sync path.
 */
export async function createZohoRefundDocumentsForOrder(orderId: string, reason: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" } } }
  });
  if (!order?.zohoInvoiceId) return;

  const payment = order.payments.find((p) => p.provider !== "COD");
  if (!payment) return;

  const raw = (payment.rawPayload as JsonRecord | null) ?? {};
  if (typeof raw.zohoCreditNoteRefundId === "string" && raw.zohoCreditNoteRefundId.trim()) {
    return;
  }

  const invoice = await getZohoInvoice(order.zohoInvoiceId);
  if (!invoice?.customer_id) {
    logger.warn("zoho_credit_note_skipped_missing_invoice_customer", {
      orderId,
      zohoInvoiceId: order.zohoInvoiceId
    });
    return;
  }

  const invoiceLines = invoice.line_items ?? [];
  const lineItems = invoiceLines
    .filter((line) => line.quantity && line.rate != null)
    .map((line) => {
      const row: Record<string, unknown> = {
        item_id: line.item_id ? String(line.item_id) : undefined,
        name: line.name || "Refund item",
        quantity: line.quantity,
        rate: line.rate
      };
      return row;
    });

  if (lineItems.length === 0) {
    logger.warn("zoho_credit_note_skipped_no_invoice_lines", {
      orderId,
      zohoInvoiceId: order.zohoInvoiceId
    });
    return;
  }

  const shippingCharge = Number(invoice.shipping_charge ?? 0);
  if (shippingCharge > 0) {
    const shippingAccountId = await findZohoAccountIdByName("Shipping Charge");
    if (shippingAccountId) {
      lineItems.push({
        account_id: shippingAccountId,
        name: "Shipping refund",
        description: `Shipping refund for ${order.orderNumber}`,
        quantity: 1,
        rate: shippingCharge
      });
    } else {
      logger.warn("zoho_credit_note_shipping_account_missing", {
        orderId,
        zohoInvoiceId: order.zohoInvoiceId,
        shippingCharge
      });
    }
  }

  const creditNoteDate = new Date().toISOString().slice(0, 10);
  const creditNote = await zohoPost<{
    creditnote?: { creditnote_id?: string; creditnote_number?: string };
  }>("/creditnotes", {
    customer_id: invoice.customer_id,
    date: creditNoteDate,
    reference_number: order.orderNumber,
    notes: reason,
    line_items: lineItems,
    is_inclusive_tax: true
  });

  const creditNoteId = creditNote.creditnote?.creditnote_id;
  if (!creditNoteId) {
    throw new Error("Zoho credit note id missing");
  }

  const refundAmount = order.grandTotalInPaise / 100;
  await zohoPost(`/creditnotes/${creditNoteId}/invoices`, {
    invoices: [
      {
        invoice_id: order.zohoInvoiceId,
        amount_applied: refundAmount
      }
    ]
  });

  const refundReference =
    order.payments.find((p) => p.status === "REFUNDED")?.providerPaymentId ||
    order.payments.find((p) => p.status === "CAPTURED")?.providerPaymentId ||
    order.orderNumber;
  const fromAccountId = process.env.ZOHO_REFUND_FROM_ACCOUNT_ID?.trim() || undefined;
  const refundResponse = await zohoPost<{
    creditnote_refund?: { creditnote_refund_id?: string };
  }>(`/creditnotes/${creditNoteId}/refunds`, {
    date: creditNoteDate,
    refund_mode: refundModeForProvider(payment.provider),
    reference_number: refundReference,
    amount: refundAmount,
    ...(fromAccountId ? { from_account_id: fromAccountId } : {}),
    description: `Website refund for ${order.orderNumber}`
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      rawPayload: mergeJson(payment.rawPayload, {
        zohoCreditNoteId: creditNoteId,
        zohoCreditNoteNumber: creditNote.creditnote?.creditnote_number ?? null,
        zohoCreditNoteRefundId: refundResponse.creditnote_refund?.creditnote_refund_id ?? null
      }) as Prisma.InputJsonValue
    }
  });

  logger.info("zoho_credit_note_refund_recorded", {
    orderId,
    paymentId: payment.id,
    zohoInvoiceId: order.zohoInvoiceId,
    zohoCreditNoteId: creditNoteId,
    zohoCreditNoteRefundId: refundResponse.creditnote_refund?.creditnote_refund_id ?? null
  });
}
