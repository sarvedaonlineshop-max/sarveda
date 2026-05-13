import { OrderStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";
import { onOrderEnteredProcessing } from "../shipping/orderLifecycle";

const revenueStatuses: OrderStatus[] = [
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED"
];

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addUtcDays(base: Date, days: number): Date {
  const x = new Date(base);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export async function dashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const today = startOfUtcDay(now);
    const weekStart = addUtcDays(today, -6);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [revenueAgg, countsToday, countsWeek, countsMonth, productCounts, recentOrders] = await Promise.all([
      prisma.order.aggregate({
        where: { status: { in: revenueStatuses }, deletedAt: null },
        _sum: { grandTotalInPaise: true }
      }),
      prisma.order.count({
        where: { createdAt: { gte: today }, deletedAt: null }
      }),
      prisma.order.count({
        where: { createdAt: { gte: weekStart }, deletedAt: null }
      }),
      prisma.order.count({
        where: { createdAt: { gte: monthStart }, deletedAt: null }
      }),
      prisma.product.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { id: true }
      }),
      prisma.order.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          email: true,
          status: true,
          grandTotalInPaise: true,
          createdAt: true
        }
      })
    ]);

    const inventoryCandidates = await prisma.inventory.findMany({
      where: {
        variant: {
          status: "ACTIVE",
          productRel: { deletedAt: null, status: "ACTIVE" }
        }
      },
      take: 500,
      orderBy: { onHand: "asc" },
      include: {
        variant: {
          include: {
            productRel: { select: { id: true, name: true, slug: true } }
          }
        }
      }
    });
    const lowStock = inventoryCandidates.filter((inv) => inv.onHand <= inv.lowStockThreshold).slice(0, 25);

    const chartStart = addUtcDays(today, -6);
    const byDay = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const k = addUtcDays(chartStart, i).toISOString().slice(0, 10);
      byDay.set(k, 0);
    }

    const ordersForChart = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: revenueStatuses },
        createdAt: { gte: chartStart }
      },
      select: { grandTotalInPaise: true, createdAt: true }
    });
    for (const o of ordersForChart) {
      const key = o.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + o.grandTotalInPaise);
    }

    const revenueByDayLast7 = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenueInPaise]) => ({ date, revenueInPaise }));

    const productsByStatus = {
      active: 0,
      draft: 0,
      archived: 0
    };
    for (const row of productCounts) {
      if (row.status === "ACTIVE") productsByStatus.active = row._count.id;
      if (row.status === "DRAFT") productsByStatus.draft = row._count.id;
      if (row.status === "ARCHIVED") productsByStatus.archived = row._count.id;
    }

    res.json({
      success: true,
      data: {
        totalRevenueInPaise: revenueAgg._sum.grandTotalInPaise ?? 0,
        ordersCount: {
          today: countsToday,
          thisWeek: countsWeek,
          thisMonth: countsMonth
        },
        productsByStatus,
        recentOrders,
        lowStockAlerts: lowStock.map((inv) => ({
          variantId: inv.variantId,
          sku: inv.variant.sku,
          onHand: inv.onHand,
          reserved: inv.reserved,
          lowStockThreshold: inv.lowStockThreshold,
          productName: inv.variant.productRel.name,
          productSlug: inv.variant.productRel.slug
        })),
        revenueByDayLast7
      }
    });
  } catch (err) {
    next(err);
  }
}

type OrderBucket = "pending" | "paid" | "shipped" | "delivered" | "all";

function bucketWhere(bucket: OrderBucket): { status?: { in: OrderStatus[] } } {
  switch (bucket) {
    case "pending":
      return { status: { in: ["PENDING_PAYMENT"] } };
    case "paid":
      return { status: { in: ["PAID", "PROCESSING", "PACKED"] } };
    case "shipped":
      return { status: { in: ["SHIPPED"] } };
    case "delivered":
      return { status: { in: ["DELIVERED"] } };
    default:
      return {};
  }
}

export async function ordersList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const bucket = (req.query.bucket as OrderBucket) || "all";
    const bWhere =
      bucket === "pending" ||
      bucket === "paid" ||
      bucket === "shipped" ||
      bucket === "delivered"
        ? bucketWhere(bucket)
        : {};

    const where = { deletedAt: null as null, ...bWhere };

    const [total, rows] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            select: {
              id: true,
              nameSnapshot: true,
              qtyOrdered: true,
              lineTotalInPaise: true
            }
          },
          customer: { select: { id: true, email: true, name: true } }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        items: rows.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          email: o.email,
          customerName: o.customer?.name ?? null,
          status: o.status,
          paymentStatus: o.paymentStatus,
          grandTotalInPaise: o.grandTotalInPaise,
          itemCount: o.items.reduce((s, i) => s + i.qtyOrdered, 0),
          linePreview: o.items.slice(0, 2).map((i) => i.nameSnapshot),
          createdAt: o.createdAt
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

export async function orderDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: { include: { variant: { select: { id: true, sku: true } } } },
        addresses: true,
        payments: true,
        invoice: true,
        shipments: { orderBy: { createdAt: "desc" } },
        customer: { select: { id: true, email: true, name: true } }
      }
    });
    if (!order) {
      res.status(404).json({
        success: false,
        error: "Order not found",
        code: "NOT_FOUND"
      });
      return;
    }
    res.json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function orderInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const inv = await prisma.invoice.findFirst({
      where: { orderId: id },
      select: { pdfUrl: true, invoiceNo: true }
    });
    res.json({
      success: true,
      data: {
        pdfUrl: inv?.pdfUrl ?? null,
        invoiceNo: inv?.invoiceNo ?? null
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function patchOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const status = (req.body as { status: OrderStatus }).status;
    const exists = await prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!exists) {
      res.status(404).json({
        success: false,
        error: "Order not found",
        code: "NOT_FOUND"
      });
      return;
    }

    const prevStatus = exists.status;

    const order = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        items: true,
        addresses: true,
        invoice: true
      }
    });

    if (status === "PROCESSING" && prevStatus !== "PROCESSING") {
      void onOrderEnteredProcessing(order.id);
    }

    res.json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function inventoryList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
    const skip = (page - 1) * limit;

    const where = {
      variant: {
        productRel: { deletedAt: null }
      }
    };

    const [total, rows] = await prisma.$transaction([
      prisma.inventory.count({ where }),
      prisma.inventory.findMany({
        where,
        orderBy: [{ onHand: "asc" }],
        skip,
        take: limit,
        include: {
          variant: {
            include: {
              productRel: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  status: true
                }
              },
              attributeValues: {
                include: {
                  attributeValue: {
                    include: { attribute: true }
                  }
                }
              }
            }
          }
        }
      })
    ]);

    const items = rows.map((inv) => {
      const labels = inv.variant.attributeValues
        .map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
        .join(" · ");
      const available = Math.max(0, inv.onHand - inv.reserved);
      const low = inv.onHand <= inv.lowStockThreshold;
      return {
        inventoryId: inv.id,
        variantId: inv.variantId,
        sku: inv.variant.sku,
        productId: inv.variant.productRel.id,
        productName: inv.variant.productRel.name,
        productSlug: inv.variant.productRel.slug,
        productStatus: inv.variant.productRel.status,
        variantLabel: labels || null,
        onHand: inv.onHand,
        reserved: inv.reserved,
        available,
        lowStockThreshold: inv.lowStockThreshold,
        low
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({
      success: true,
      data: { items, pagination: { page, limit, total, totalPages } }
    });
  } catch (err) {
    next(err);
  }
}

export async function patchInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const { variantId } = req.params;
    const onHand = Number(req.body?.onHand);
    if (!Number.isFinite(onHand) || onHand < 0) {
      res.status(400).json({
        success: false,
        error: "Invalid onHand",
        code: "INVALID_BODY"
      });
      return;
    }

    const inv = await prisma.inventory.updateMany({
      where: { variantId },
      data: { onHand: Math.floor(onHand) }
    });
    if (inv.count === 0) {
      res.status(404).json({
        success: false,
        error: "Inventory row not found for variant",
        code: "NOT_FOUND"
      });
      return;
    }

    const row = await prisma.inventory.findUnique({
      where: { variantId },
      include: {
        variant: {
          include: {
            productRel: { select: { name: true, slug: true } },
            attributeValues: {
              include: {
                attributeValue: {
                  include: { attribute: true }
                }
              }
            }
          }
        }
      }
    });

    res.json({ success: true, data: { inventory: row } });
  } catch (err) {
    next(err);
  }
}
