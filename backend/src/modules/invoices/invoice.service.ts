import { prisma } from "../../config/db";
import { uploadPdf } from "../../config/s3";
import { logger } from "../../config/logger";
import {
  buildOrderInvoicePdf,
  invoiceNumberForOrder,
  type GstInvoiceInput,
  type GstInvoiceLine
} from "../../utils/invoice";
import { gstFromInclusiveLine, gstRatePercent, isInterState } from "../../utils/gst";

export async function loadOrderForInvoice(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: {
        include: {
          variant: {
            include: {
              productRel: { select: { taxClass: true, hsnCode: true } }
            }
          }
        }
      },
      addresses: true,
      invoice: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
}

export function buildInvoiceInputFromOrder(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForInvoice>>>
): GstInvoiceInput | null {
  const shippingAddress = order.addresses.find((a) => a.type === "SHIPPING");
  if (!shippingAddress) return null;

  const shipCountry = shippingAddress.country.trim().toUpperCase();
  const isGstApplicable = shipCountry === "IN" && order.currency === "INR";
  const interState = isGstApplicable
    ? isInterState(shippingAddress.state, shippingAddress.country)
    : false;

  const defaultHsn = process.env.DEFAULT_HSN_CODE?.trim() || "9205";

  const lines: GstInvoiceLine[] = order.items.map((row) => {
    const taxClass = row.variant.productRel.taxClass;
    const rate = isGstApplicable ? gstRatePercent(taxClass) : 0;
    const { taxableMinor, taxMinor } = isGstApplicable
      ? gstFromInclusiveLine(row.lineTotalInPaise, rate)
      : { taxableMinor: row.lineTotalInPaise, taxMinor: 0 };
    const hsn = row.variant.productRel.hsnCode?.trim() || defaultHsn;
    return {
      name: row.nameSnapshot,
      sku: row.skuSnapshot,
      qty: row.qtyOrdered,
      unitPriceInPaise: row.unitPriceInPaise,
      lineTotalInPaise: row.lineTotalInPaise,
      taxClass: taxClass ?? "standard",
      hsn,
      gstRatePercent: rate,
      taxableMinor,
      taxMinor
    };
  });

  let totalTaxMinor = isGstApplicable ? lines.reduce((s, l) => s + l.taxMinor, 0) : 0;
  if (isGstApplicable && order.taxInPaise > 0) totalTaxMinor = order.taxInPaise;

  return {
    invoiceNo: order.invoice?.invoiceNo ?? invoiceNumberForOrder(order.orderNumber),
    orderNumber: order.orderNumber,
    currency: order.currency,
    issuedAt: order.placedAt ?? order.createdAt,
    buyerEmail: order.email,
    shippingAddress,
    items: lines,
    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise,
    shippingInPaise: order.shippingInPaise,
    taxInPaise: totalTaxMinor,
    grandTotalInPaise: order.grandTotalInPaise,
    interState,
    isGstApplicable
  };
}

/** Build PDF, upload to S3 when configured, persist `pdfUrl`. Returns URL or null. */
export async function ensureOrderInvoicePdf(orderId: string): Promise<string | null> {
  const order = await loadOrderForInvoice(orderId);
  if (!order) return null;

  const isCod = order.payments?.some((p) => p.provider === "COD") ?? false;
  const invoiceReady =
    order.paymentStatus === "CAPTURED" ||
    order.status === "PAID" ||
    (isCod && !["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status));

  if (!invoiceReady) {
    return order.invoice?.pdfUrl ?? null;
  }

  const input = buildInvoiceInputFromOrder(order);
  if (!input) {
    logger.warn("invoice_missing_shipping_address", { orderId });
    return null;
  }

  if (order.invoice?.pdfUrl) {
    return order.invoice.pdfUrl;
  }

  const pdf = await buildOrderInvoicePdf(input);
  const key = `invoices/${order.orderNumber}/${input.invoiceNo}.pdf`;
  const uploadedUrl = await uploadPdf(key, pdf);
  const pdfUrl = uploadedUrl ?? `local://${key}`;

  await prisma.invoice.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      invoiceNo: input.invoiceNo,
      pdfUrl: uploadedUrl ?? undefined
    },
    update: {
      invoiceNo: input.invoiceNo,
      ...(uploadedUrl ? { pdfUrl: uploadedUrl } : {})
    }
  });

  logger.info("invoice_generated", { orderId, orderNumber: order.orderNumber, pdfUrl: uploadedUrl ?? "no-s3" });
  return uploadedUrl ?? pdfUrl;
}
