import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";
import { invoiceNumberForOrder } from "../../utils/invoice";
import {
  buildInvoiceInputFromOrder,
  ensureOrderInvoicePdf,
  loadOrderForInvoice
} from "../invoices/invoice.service";
import { buildGstInvoicePdf } from "../../utils/invoice";
import { orderBlocksCarrierSync, syncTrackingByWaybill } from "../shipping/orderLifecycle";

function serializePublicOrderView(order: {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotalInPaise: number;
  shippingInPaise: number;
  grandTotalInPaise: number;
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
    shippingInPaise: order.shippingInPaise,
    grandTotalInPaise: order.grandTotalInPaise,
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
  status: string;
  paymentStatus: string;
  grandTotalInPaise: number;
  currency: string;
  createdAt: Date;
  placedAt: Date | null;
  items: Array<{ nameSnapshot: string; qtyOrdered: number }>;
  invoice: { invoiceNo: string } | null;
}) {
  const headline = order.items[0]?.nameSnapshot ?? "Order";
  const itemCount = order.items.reduce((sum, row) => sum + row.qtyOrdered, 0);
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    grandTotalInPaise: order.grandTotalInPaise,
    currency: order.currency,
    createdAt: order.createdAt,
    placedAt: order.placedAt,
    itemCount,
    headline,
    invoiceNo: order.invoice?.invoiceNo ?? null
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
        invoice: true
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

    const order = await loadOrderForInvoice(
      (
        await prisma.order.findFirst({
          where: { orderNumber, deletedAt: null, email },
          select: { id: true }
        })
      )?.id ?? ""
    );

    if (!order || order.email !== email) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    if (order.paymentStatus !== "CAPTURED" && order.status !== "PAID") {
      res.status(400).json({
        success: false,
        error: "Invoice is available after payment is captured",
        code: "INVOICE_NOT_READY"
      });
      return;
    }

    if (order.invoice?.pdfUrl?.startsWith("http")) {
      res.redirect(302, order.invoice.pdfUrl);
      return;
    }

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

    const pdf = await buildGstInvoicePdf(input);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${input.invoiceNo}.pdf"`);
    res.send(pdf);
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
