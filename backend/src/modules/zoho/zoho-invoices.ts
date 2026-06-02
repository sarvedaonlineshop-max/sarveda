import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { getOrCreateZohoContact } from "./zoho-contacts";
import { zohoPost } from "./zoho-client";

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

    const lineItems = order.items.map((item) => ({
      name: item.variant.productRel.name,
      description: item.variant.sku,
      rate: item.unitPriceInPaise / 100,
      quantity: item.qtyOrdered,
      unit: "pcs"
    }));

    const result = await zohoPost<{
      invoice: { invoice_id: string; invoice_number: string };
    }>("/invoices", {
      customer_id: contactId,
      invoice_number: order.orderNumber,
      date: new Date().toISOString().slice(0, 10),
      due_date: new Date().toISOString().slice(0, 10),
      line_items: lineItems,
      shipping_charge: order.shippingInPaise / 100,
      discount: order.discountInPaise / 100
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
  }
}
