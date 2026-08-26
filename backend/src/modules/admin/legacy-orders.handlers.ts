import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";

export async function legacyOrdersList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const source = String(req.query.source ?? "").trim();
    const channel = String(req.query.channel ?? "").trim();
    const q = String(req.query.q ?? "").trim();

    const where = {
      ...(source === "D2C" || source === "MARKETPLACE" ? { source: source as "D2C" | "MARKETPLACE" } : {}),
      ...(channel ? { channelCode: channel.toUpperCase() } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: "insensitive" as const } },
              { externalOrderId: { contains: q, mode: "insensitive" as const } },
              { customerEmail: { contains: q, mode: "insensitive" as const } },
              { customerName: { contains: q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [total, rows] = await prisma.$transaction([
      prisma.legacyOrderArchive.count({ where }),
      prisma.legacyOrderArchive.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: "desc" }
      })
    ]);

    res.json({
      success: true,
      data: {
        items: rows.map((r) => ({
          id: r.id,
          source: r.source,
          channelCode: r.channelCode,
          externalOrderId: r.externalOrderId,
          orderNumber: r.orderNumber,
          customerName: r.customerName,
          customerEmail: r.customerEmail,
          status: r.status,
          paymentProvider: r.paymentProvider,
          paymentStatus: r.paymentStatus,
          currency: r.currency,
          grandTotalInPaise: r.grandTotalInPaise,
          itemCount: r.itemCount,
          linePreview: r.linePreview,
          orderDate: r.orderDate,
          placedAt: r.placedAt
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function legacyOrderDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await prisma.legacyOrderArchive.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ success: false, error: "Legacy order not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { order: row } });
  } catch (err) {
    next(err);
  }
}

export async function legacyMarketplaceOrdersList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const channel = String(req.query.channel ?? "").trim();
    const q = String(req.query.q ?? "").trim();

    const where = {
      ...(channel ? { channelCode: channel.toUpperCase() } : {}),
      ...(q
        ? {
            OR: [
              { externalOrderId: { contains: q, mode: "insensitive" as const } },
              { customerEmail: { contains: q, mode: "insensitive" as const } },
              { customerName: { contains: q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [total, rows] = await prisma.$transaction([
      prisma.legacyMarketplaceOrderArchive.count({ where }),
      prisma.legacyMarketplaceOrderArchive.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: "desc" }
      })
    ]);

    res.json({
      success: true,
      data: {
        items: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function legacyMarketplaceOrderDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await prisma.legacyMarketplaceOrderArchive.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ success: false, error: "Legacy marketplace order not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { order: row } });
  } catch (err) {
    next(err);
  }
}

export async function legacyOrdersStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const [d2c, mp, mpArchive, channels] = await Promise.all([
      prisma.legacyOrderArchive.count({ where: { source: "D2C" } }),
      prisma.legacyOrderArchive.count({ where: { source: "MARKETPLACE" } }),
      prisma.legacyMarketplaceOrderArchive.count(),
      prisma.legacyMarketplaceOrderArchive.groupBy({
        by: ["channelCode"],
        _count: { _all: true }
      })
    ]);
    res.json({
      success: true,
      data: {
        legacyOrdersTotal: d2c + mp,
        legacyOrdersD2c: d2c,
        legacyOrdersMarketplaceMerged: mp,
        legacyMarketplaceArchiveTotal: mpArchive,
        channels: channels.map((c) => ({ code: c.channelCode, count: c._count._all }))
      }
    });
  } catch (err) {
    next(err);
  }
}
