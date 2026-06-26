import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { gstRatePercent } from "../../utils/gst";

import { getOrCreateZohoContact } from "./zoho-contacts";
import { zohoPost } from "./zoho-client";
import { resolveZohoItemIdForSku } from "./zoho-items";

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Spread order-level coupon discount into line rates (Zoho disallows after-tax invoice discount with item_id lines). */
function lineRatesAfterOrderDiscount(
  items: Array<{ unitPriceInPaise: number; qtyOrdered: number }>,
  discountInPaise: number
): number[] {
  const grossLinePaise = items.reduce((sum, item) => sum + item.unitPriceInPaise * item.qtyOrdered, 0);
  const discountPaise = Math.min(Math.max(0, discountInPaise), grossLinePaise);
  if (discountPaise <= 0 || grossLinePaise <= 0) {
    return items.map((item) => round2(item.unitPriceInPaise / 100));
  }

  let allocatedDiscount = 0;
  return items.map((item, index) => {
    const lineGross = item.unitPriceInPaise * item.qtyOrdered;
    const lineDiscount =
      index === items.length - 1
        ? discountPaise - allocatedDiscount
        : Math.round((lineGross * discountPaise) / grossLinePaise);
    allocatedDiscount += lineDiscount;

    const lineNetPaise = lineGross - lineDiscount;
    const rate =
      item.qtyOrdered > 0 ? round2(lineNetPaise / item.qtyOrdered / 100) : round2(item.unitPriceInPaise / 100);
    return rate;
  });
}

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
    const discountedRates = lineRatesAfterOrderDiscount(order.items, order.discountInPaise);

    const lineItems = await Promise.all(
      order.items.map(async (item, index) => {
        const rate = discountedRates[index] ?? round2(item.unitPriceInPaise / 100);
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

    const notes =
      order.discountInPaise > 0
        ? `Amounts are GST-inclusive. Coupon discount of ₹${round2(order.discountInPaise / 100)} is included in line rates.`
        : "Amounts are GST-inclusive per Sarveda storefront pricing.";

    // Sarveda prices are GST-inclusive; Zoho must not add tax on top of line rates.
    // Do not send invoice-level discount with is_discount_before_tax:false — Zoho error 4089 when item_id is set.
    const result = await zohoPost<{
      invoice: { invoice_id: string; invoice_number: string };
    }>("/invoices", {
      customer_id: contactId,
      reference_number: order.orderNumber,
      date: new Date().toISOString().slice(0, 10),
      due_date: new Date().toISOString().slice(0, 10),
      is_inclusive_tax: true,
      line_items: lineItems,
      shipping_charge: order.shippingInPaise / 100,
      notes
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
    console.error("[ZOHO_INVOICE_FAILED]", { orderId, err });
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
