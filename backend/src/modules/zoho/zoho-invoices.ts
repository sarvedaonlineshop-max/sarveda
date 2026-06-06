import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { gstRatePercent } from "../../utils/gst";

import { getOrCreateZohoContact } from "./zoho-contacts";
import { zohoPost } from "./zoho-client";
import { resolveZohoItemIdForSku } from "./zoho-items";

export async function createZohoInvoiceForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          variant: {
            include: { productRel: true }
          }
        }
      },
      addresses: true,
      customer: true
    }
  });

  if (!order) {
    logger.error("Order not found for Zoho sync", { orderId });
    return;
  }
  if (order.zohoInvoiceId) {
    logger.info("Zoho invoice already exists", { orderId, zohoInvoiceId: order.zohoInvoiceId });
    return;
  }

  const shippingAddress = order.addresses.find((a) => a.type === "SHIPPING") ?? order.addresses[0];

  try {
    const contactId = await getOrCreateZohoContact({
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

    const defaultTaxId = process.env.ZOHO_SALES_TAX_ID?.trim();

    const lineItems = await Promise.all(
      order.items.map(async (item) => {
        const rate = item.unitPriceInPaise / 100;
        const taxPercent = gstRatePercent(item.variant.productRel.taxClass);
        const zohoItemId = await resolveZohoItemIdForSku(item.variant.sku);
        const row: Record<string, unknown> = {
          name: item.nameSnapshot || item.variant.productRel.name,
          description: item.variant.sku,
          rate,
          quantity: item.qtyOrdered,
          unit: "pcs"
        };
        if (zohoItemId) row.item_id = zohoItemId;
        if (defaultTaxId && taxPercent > 0) {
          row.tax_id = defaultTaxId;
          row.tax_percentage = taxPercent;
        }
        return row;
      })
    );

    // Sarveda prices are GST-inclusive; Zoho must not add tax on top of line rates.
    const result = await zohoPost<{
      invoice: { invoice_id: string; invoice_number: string };
    }>("/invoices", {
      customer_id: contactId,
      reference_number: order.orderNumber,
      date: new Date().toISOString().slice(0, 10),
      due_date: new Date().toISOString().slice(0, 10),
      is_inclusive_tax: true,
      is_discount_before_tax: false,
      line_items: lineItems,
      shipping_charge: order.shippingInPaise / 100,
      discount: order.discountInPaise / 100,
      notes: "Amounts are GST-inclusive per Sarveda storefront pricing."
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        zohoInvoiceId: result.invoice.invoice_id,
        zohoInvoiceNo: result.invoice.invoice_number,
        zohoSyncedAt: new Date(),
        zohoSyncError: null
      }
    });

    try {
      await zohoPost(`/invoices/${result.invoice.invoice_id}/status/sent`, {});
    } catch (err) {
      logger.warn("Could not mark invoice as sent", { err });
    }

    logger.info("Zoho invoice created", {
      orderId,
      zohoInvoiceId: result.invoice.invoice_id,
      invoiceNumber: result.invoice.invoice_number
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("Zoho invoice creation failed", { orderId, error: errorMsg });
    await prisma.order
      .update({
        where: { id: orderId },
        data: { zohoSyncError: errorMsg }
      })
      .catch(() => {});
    throw err;
  }
}
