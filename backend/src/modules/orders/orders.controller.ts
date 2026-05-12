import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";
import { buildGstInvoicePdf, invoiceNumberForOrder } from "../../utils/invoice";

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
        invoice: true
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
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
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
          shippingAddress: order.addresses.find((a) => a.type === "SHIPPING")
        }
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

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        addresses: true,
        invoice: true
      }
    });

    if (!order || order.deletedAt || order.email !== email) {
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

    const shippingAddress = order.addresses.find((row) => row.type === "SHIPPING");
    if (!shippingAddress) {
      res.status(400).json({
        success: false,
        error: "Shipping address missing for invoice",
        code: "INVOICE_NOT_READY"
      });
      return;
    }

    const invoiceNo = order.invoice?.invoiceNo ?? invoiceNumberForOrder(order.orderNumber);
    if (!order.invoice) {
      await prisma.invoice.create({
        data: {
          orderId: order.id,
          invoiceNo
        }
      });
    }

    const pdf = await buildGstInvoicePdf({
      invoiceNo,
      orderNumber: order.orderNumber,
      issuedAt: order.placedAt ?? order.createdAt,
      buyerEmail: order.email,
      shippingAddress,
      items: order.items.map((row) => ({
        name: row.nameSnapshot,
        sku: row.skuSnapshot,
        qty: row.qtyOrdered,
        unitPriceInPaise: row.unitPriceInPaise,
        lineTotalInPaise: row.lineTotalInPaise
      })),
      subtotalInPaise: order.subtotalInPaise,
      discountInPaise: order.discountInPaise,
      shippingInPaise: order.shippingInPaise,
      taxInPaise: order.taxInPaise,
      grandTotalInPaise: order.grandTotalInPaise
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoiceNo}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
}
