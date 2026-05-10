import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";

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
        payments: true
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
