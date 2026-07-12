import type { NextFunction, Request, Response } from "express";

import { getCartPayload, resolveCartContext, setCartItemQuantity } from "../cart/cart.service";
import { prisma } from "../../config/db";
import { downloadPdfFromS3, s3KeyFromStoredUrl } from "../../config/s3";
import { invoiceNumberForOrder } from "../../utils/invoice";
import {
  buildInvoiceInputFromOrder,
  ensureOrderInvoicePdf,
  loadOrderForInvoice
} from "../invoices/invoice.service";
import { buildOrderInvoicePdf } from "../../utils/invoice";
import { orderBlocksCarrierSync, syncTrackingByWaybill } from "../shipping/orderLifecycle";
import {
  buildOrderSummaryDetails,
  type OrderCostBreakdownDto,
  type OrderLineItemDto,
  type OrderShippingAddressDto
} from "./order-summary-details";

function serializePublicOrderView(order: {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  grandTotalInPaise: number;
  couponCode: string | null;
  currency: string;
  email: string;
  createdAt: Date;
  placedAt: Date | null;
  shippingLastError: string | null;
  shippingLastErrorAt: Date | null;
  invoice: { invoiceNo: string } | null;
  items: Array<{
    nameSnapshot: string;
    skuSnapshot: string;
    qtyOrdered: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
  }>;
  addresses: Array<{
    type: string;
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>;
  shipments: Array<{
    id: string;
    courier: string;
    awb: string | null;
    trackingUrl: string | null;
    status: string;
    deliveredAt: Date | null;
    rtoAt: Date | null;
    updatedAt: Date;
  }>;
  payments?: Array<{ provider: string }>;
}) {
  const paymentProvider = order.payments?.[0]?.provider ?? null;
  const isCod = paymentProvider === "COD";
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentProvider,
    isCod,
    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise,
    shippingInPaise: order.shippingInPaise,
    grandTotalInPaise: order.grandTotalInPaise,
    couponCode: order.couponCode,
    currency: order.currency,
    email: order.email,
    createdAt: order.createdAt,
    placedAt: order.placedAt,
    invoiceNo: order.invoice?.invoiceNo ?? invoiceNumberForOrder(order.orderNumber),
    items: order.items.map((i) => ({
      nameSnapshot: i.nameSnapshot,
      skuSnapshot: i.skuSnapshot,
      qtyOrdered: i.qtyOrdered,
      unitPriceInPaise: i.unitPriceInPaise,
      lineTotalInPaise: i.lineTotalInPaise
    })),
    shippingAddress: order.addresses.find((a) => a.type === "SHIPPING"),
    shipments: order.shipments.map((s) => ({
      id: s.id,
      courier: s.courier,
      awb: s.awb,
      trackingUrl: s.trackingUrl,
      status: s.status,
      deliveredAt: s.deliveredAt,
      rtoAt: s.rtoAt,
      updatedAt: s.updatedAt
    })),
    shippingLastError: order.shippingLastError,
    shippingLastErrorAt: order.shippingLastErrorAt
  };
}

function serializeOrderSummary(order: {
  orderNumber: string;
  email: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  grandTotalInPaise: number;
  createdAt: Date;
  placedAt: Date | null;
  items: Array<{ nameSnapshot: string; qtyOrdered: number; lineTotalInPaise: number }>;
  addresses: Array<{
    type: string;
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>;
  invoice: { invoiceNo: string } | null;
  payments?: Array<{ provider: string }>;
  shipments?: Array<{
    courier: string;
    awb: string | null;
    trackingUrl: string | null;
    status: string;
    carrierMeta?: unknown;
  }>;
}): {
  orderNumber: string;
  email: string;
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  isCod: boolean;
  grandTotalInPaise: number;
  currency: string;
  createdAt: Date;
  placedAt: Date | null;
  itemCount: number;
  headline: string;
  invoiceNo: string | null;
  deliveryPartner: string | null;
  awb: string | null;
  trackingUrl: string | null;
  shipmentStatus: string | null;
  lineItems?: OrderLineItemDto[];
  costBreakdown: OrderCostBreakdownDto;
  shippingAddress?: OrderShippingAddressDto;
} {
  const headline = order.items[0]?.nameSnapshot ?? "Order";
  const itemCount = order.items.reduce((sum, row) => sum + row.qtyOrdered, 0);
  const paymentProvider = order.payments?.[0]?.provider ?? null;
  const trackShipment =
    order.shipments?.find((s) => {
      const meta = s.carrierMeta as { manual?: boolean; direction?: string } | null;
      return s.awb?.trim() && !meta?.manual && meta?.direction !== "REVERSE";
    }) ?? order.shipments?.find((s) => s.awb?.trim());
  const details = buildOrderSummaryDetails({
    currency: order.currency,
    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise,
    shippingInPaise: order.shippingInPaise,
    items: order.items,
    addresses: order.addresses
  });
  // Response exposes only mapped lineItems / costBreakdown / shippingAddress — never raw addresses[].
  return {
    orderNumber: order.orderNumber,
    email: order.email,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentProvider,
    isCod: paymentProvider === "COD",
    grandTotalInPaise: order.grandTotalInPaise,
    currency: order.currency,
    createdAt: order.createdAt,
    placedAt: order.placedAt,
    itemCount,
    headline,
    invoiceNo: order.invoice?.invoiceNo ?? null,
    deliveryPartner: trackShipment?.courier ?? null,
    awb: trackShipment?.awb ?? null,
    trackingUrl: trackShipment?.trackingUrl ?? null,
    shipmentStatus: trackShipment?.status ?? null,
    ...details
  };
}

export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const email = user.email.trim().toLowerCase();
    const orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        OR: [{ customerId: user.id }, { email }]
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        items: { orderBy: { nameSnapshot: "asc" } },
        addresses: true,
        invoice: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        shipments: {
          where: { awb: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 3
        }
      }
    });

    res.json({
      success: true,
      data: {
        orders: orders.map(serializeOrderSummary)
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getByOrderNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderNumber } = req.params;
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";

    if (!orderNumber || !email) {
      res.status(400).json({
        success: false,
        error: "orderNumber and email query required",
        code: "BAD_REQUEST"
      });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        addresses: true,
        payments: true,
        invoice: true,
        shipments: { orderBy: { createdAt: "desc" } }
      }
    });

    if (!order || order.deletedAt) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    if (order.email !== email) {
      res.status(403).json({ success: false, error: "Forbidden", code: "FORBIDDEN" });
      return;
    }

    res.json({
      success: true,
      data: {
        order: serializePublicOrderView(order)
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderNumber } = req.params;
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
    if (!orderNumber || !email) {
      res.status(400).json({
        success: false,
        error: "orderNumber and email query required",
        code: "BAD_REQUEST"
      });
      return;
    }

    const orderRow = await prisma.order.findFirst({
      where: { orderNumber, deletedAt: null, email },
      select: { id: true, email: true }
    });

    if (!orderRow) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    const order = await loadOrderForInvoice(orderRow.id);

    if (!order || order.email !== email) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    const isCod = order.payments?.some((p) => p.provider === "COD") ?? false;
    const invoiceReady =
      order.paymentStatus === "CAPTURED" ||
      order.status === "PAID" ||
      (isCod && !["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status));

    if (!invoiceReady) {
      res.status(400).json({
        success: false,
        error: "Invoice is available after your order is confirmed",
        code: "INVOICE_NOT_READY"
      });
      return;
    }

    let pdf: Buffer | null = null;
    let invoiceNo = order.invoice?.invoiceNo ?? invoiceNumberForOrder(order.orderNumber);

    const storedUrl = order.invoice?.pdfUrl;
    if (storedUrl?.startsWith("http")) {
      const key = s3KeyFromStoredUrl(storedUrl);
      if (key) {
        pdf = await downloadPdfFromS3(key);
      }
    }

    if (!pdf) {
      await ensureOrderInvoicePdf(order.id);
      const refreshed = await loadOrderForInvoice(order.id);
      const input = refreshed ? buildInvoiceInputFromOrder(refreshed) : null;
      if (!input) {
        res.status(400).json({
          success: false,
          error: "Shipping address missing for invoice",
          code: "INVOICE_NOT_READY"
        });
        return;
      }
      invoiceNo = input.invoiceNo;
      pdf = await buildOrderInvoicePdf(input);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoiceNo}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
}

/** Restore line items from a cancelled unpaid order into the shopper's cart. */
export async function reorderCancelledPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderNumber } = req.params;
    const { email: rawEmail } = req.body as { email: string };
    const email = rawEmail.trim().toLowerCase();
    if (!orderNumber || !email) {
      res.status(400).json({
        success: false,
        error: "orderNumber and email are required",
        code: "BAD_REQUEST"
      });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { items: true, addresses: true }
    });

    if (!order || order.deletedAt) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }
    if (order.email !== email) {
      res.status(403).json({ success: false, error: "Forbidden", code: "FORBIDDEN" });
      return;
    }
    if (order.status !== "CANCELLED") {
      res.status(400).json({
        success: false,
        error: "Only cancelled orders can be reordered this way",
        code: "ORDER_NOT_REORDERABLE"
      });
      return;
    }
    if (order.paymentStatus === "CAPTURED") {
      res.status(400).json({
        success: false,
        error: "This order was paid — contact support if you need help",
        code: "ORDER_NOT_REORDERABLE"
      });
      return;
    }

    const { cartId, newSessionId, userId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(500).json({ success: false, error: "Cart error", code: "CART_ERROR" });
      return;
    }

    const restored: string[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const line of order.items) {
      try {
        await setCartItemQuantity(cartId, line.variantId, line.qtyOrdered);
        restored.push(line.nameSnapshot);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unavailable";
        skipped.push({ name: line.nameSnapshot, reason: message });
      }
    }

    if (restored.length === 0) {
      res.status(400).json({
        success: false,
        error: "None of the items from this order are available right now",
        code: "REORDER_UNAVAILABLE",
        data: { skipped }
      });
      return;
    }

    const shippingCountry =
      order.addresses.find((a) => a.type === "SHIPPING")?.country ??
      order.addresses[0]?.country;
    const payload = await getCartPayload(cartId, shippingCountry, { userId, email });

    res.json({
      success: true,
      data: {
        ...payload,
        sessionId: newSessionId,
        restoredCount: restored.length,
        skipped
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshShippingPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderNumber } = req.params;
    const { email: rawEmail } = req.body as { email: string };
    const email = rawEmail.trim().toLowerCase();
    if (!orderNumber || !email) {
      res.status(400).json({
        success: false,
        error: "orderNumber and email are required",
        code: "BAD_REQUEST"
      });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        addresses: true,
        payments: true,
        invoice: true,
        shipments: { orderBy: { createdAt: "desc" } }
      }
    });

    if (!order || order.deletedAt) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }
    if (order.email !== email) {
      res.status(403).json({ success: false, error: "Forbidden", code: "FORBIDDEN" });
      return;
    }
    if (orderBlocksCarrierSync(order.status)) {
      res.status(400).json({
        success: false,
        error: "Tracking cannot be refreshed for this order.",
        code: "ORDER_STATE"
      });
      return;
    }

    type Row = { awb: string; ok: boolean; error?: string; code?: string; data?: unknown };
    const syncResults: Row[] = [];
    for (const sh of order.shipments) {
      if (!sh.awb) {
        syncResults.push({ awb: "", ok: false, error: "No AWB yet", code: "MISSING_AWB" });
        continue;
      }
      const r = await syncTrackingByWaybill(sh.awb);
      syncResults.push(
        r.success
          ? { awb: sh.awb, ok: true, data: r.data }
          : { awb: sh.awb, ok: false, error: r.error, code: r.code }
      );
    }

    const fresh = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        addresses: true,
        payments: true,
        invoice: true,
        shipments: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!fresh) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    res.json({
      success: true,
      data: {
        syncResults,
        order: serializePublicOrderView(fresh)
      }
    });
  } catch (err) {
    next(err);
  }
}
