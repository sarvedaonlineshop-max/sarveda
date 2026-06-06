import { AddressType, OrderStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import {
  addDaysInstant,
  dateKeyKolkata,
  monthKeyKolkata,
  startOfDayKolkata,
  startOfMonthKolkata
} from "../../utils/reporting-time";
import { fetchRazorpayOrderPayments } from "../payments/razorpay";
import { completePaidOrder } from "../payments/razorpay.verify";
import { onOrderEnteredProcessing } from "../shipping/orderLifecycle";
import { getZohoStockSyncMeta } from "../zoho/zoho-stock-sync-cache";
import { auditSarvedaVariant, computeZohoSyncSummary, listZohoOnlyItems } from "../zoho/zoho-sync-audit";
import type { ZohoItemAuditRow } from "../zoho/zoho-sync-types";
import { shopCatalogProductWhere, shopInventoryWhere } from "../../utils/shop-catalog";

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

function addUtcMonths(base: Date, months: number): Date {
  const x = new Date(base);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

function buildDailySeries(
  startDay: Date,
  dayCount: number,
  orders: { grandTotalInPaise: number; createdAt: Date }[]
): Array<{ date: string; revenueInPaise: number }> {
  const byDay = new Map<string, number>();
  for (let i = 0; i < dayCount; i++) {
    const k = addUtcDays(startDay, i).toISOString().slice(0, 10);
    byDay.set(k, 0);
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    if (byDay.has(key)) {
      byDay.set(key, (byDay.get(key) ?? 0) + o.grandTotalInPaise);
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenueInPaise]) => ({ date, revenueInPaise }));
}

function buildMonthlySeries(
  anchor: Date,
  monthCount: number,
  orders: { grandTotalInPaise: number; createdAt: Date }[]
): Array<{ month: string; revenueInPaise: number }> {
  const keys: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = addUtcMonths(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)), -i);
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const byMonth = new Map<string, number>();
  for (const k of keys) byMonth.set(k, 0);
  for (const o of orders) {
    const d = o.createdAt;
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (byMonth.has(k)) {
      byMonth.set(k, (byMonth.get(k) ?? 0) + o.grandTotalInPaise);
    }
  }
  return keys.map((month) => ({ month, revenueInPaise: byMonth.get(month) ?? 0 }));
}

function buildDailySeriesKolkata(
  startDay: Date,
  dayCount: number,
  orders: { reportingTotalInInrPaise: number | null; placedAt: Date | null; createdAt: Date }[]
): Array<{ date: string; revenueInPaise: number }> {
  const byDay = new Map<string, number>();
  for (let i = 0; i < dayCount; i++) {
    const k = dateKeyKolkata(addDaysInstant(startDay, i));
    byDay.set(k, 0);
  }
  for (const o of orders) {
    const dt = o.placedAt ?? o.createdAt;
    const key = dateKeyKolkata(dt);
    if (byDay.has(key)) {
      byDay.set(key, (byDay.get(key) ?? 0) + (o.reportingTotalInInrPaise ?? 0));
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenueInPaise]) => ({ date, revenueInPaise }));
}

function buildMonthlySeriesKolkata(
  anchor: Date,
  monthCount: number,
  orders: { reportingTotalInInrPaise: number | null; placedAt: Date | null; createdAt: Date }[]
): Array<{ month: string; revenueInPaise: number }> {
  const keys: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = addUtcMonths(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)), -i);
    keys.push(monthKeyKolkata(d));
  }
  const byMonth = new Map<string, number>();
  for (const k of keys) byMonth.set(k, 0);
  for (const o of orders) {
    const dt = o.placedAt ?? o.createdAt;
    const k = monthKeyKolkata(dt);
    if (byMonth.has(k)) {
      byMonth.set(k, (byMonth.get(k) ?? 0) + (o.reportingTotalInInrPaise ?? 0));
    }
  }
  return keys.map((month) => ({ month, revenueInPaise: byMonth.get(month) ?? 0 }));
}

export async function dashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const today = startOfDayKolkata(now);
    const tomorrow = addDaysInstant(today, 1);
    const weekStart = addDaysInstant(today, -6);
    const monthStart = startOfMonthKolkata(now);
    const chart7Start = addDaysInstant(today, -6);
    const chart30Start = addDaysInstant(today, -29);
    const chart12mStart = addUtcMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -11);

    const revenueWhere = {
      deletedAt: null as null,
      status: { in: revenueStatuses },
      reportingTotalInInrPaise: { not: null as null }
    };

    const [
      revenueAgg,
      revenueTodayAgg,
      revenueWeekAgg,
      revenueMonthAgg,
      countsToday,
      countsWeek,
      countsMonth,
      productCounts,
      recentOrders,
      ordersForChart7,
      ordersForChart30,
      ordersForChart12m,
      velocityItems,
      activeProductSample
    ] = await Promise.all([
      prisma.order.aggregate({
        where: revenueWhere,
        _sum: { reportingTotalInInrPaise: true }
      }),
      prisma.order.aggregate({
        where: { ...revenueWhere, placedAt: { gte: today, lt: tomorrow } },
        _sum: { reportingTotalInInrPaise: true }
      }),
      prisma.order.aggregate({
        where: { ...revenueWhere, placedAt: { gte: weekStart } },
        _sum: { reportingTotalInInrPaise: true }
      }),
      prisma.order.aggregate({
        where: { ...revenueWhere, placedAt: { gte: monthStart } },
        _sum: { reportingTotalInInrPaise: true }
      }),
      prisma.order.count({
        where: { deletedAt: null, placedAt: { gte: today, lt: tomorrow } }
      }),
      prisma.order.count({
        where: { deletedAt: null, placedAt: { gte: weekStart } }
      }),
      prisma.order.count({
        where: { deletedAt: null, placedAt: { gte: monthStart } }
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
      }),
      prisma.order.findMany({
        where: { ...revenueWhere, placedAt: { gte: chart7Start } },
        select: { reportingTotalInInrPaise: true, placedAt: true, createdAt: true }
      }),
      prisma.order.findMany({
        where: { ...revenueWhere, placedAt: { gte: chart30Start } },
        select: { reportingTotalInInrPaise: true, placedAt: true, createdAt: true }
      }),
      prisma.order.findMany({
        where: { ...revenueWhere, placedAt: { gte: chart12mStart } },
        select: { reportingTotalInInrPaise: true, placedAt: true, createdAt: true }
      }),
      prisma.orderItem.findMany({
        where: {
          order: {
            deletedAt: null,
            status: { in: revenueStatuses },
            createdAt: { gte: addUtcDays(today, -30) }
          },
          variant: { productRel: { deletedAt: null } }
        },
        select: {
          qtyOrdered: true,
          variant: { select: { productRel: { select: { id: true, name: true } } } }
        },
        take: 12_000
      }),
      prisma.product.findMany({
        where: { deletedAt: null, status: "ACTIVE" },
        select: { id: true, name: true },
        take: 400
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

    const revenueByDayLast7 = buildDailySeriesKolkata(chart7Start, 7, ordersForChart7);
    const revenueByDayLast30 = buildDailySeriesKolkata(chart30Start, 30, ordersForChart30);
    const revenueByMonthLast12 = buildMonthlySeriesKolkata(now, 12, ordersForChart12m);

    const byProduct = new Map<string, { name: string; units: number }>();
    for (const it of velocityItems) {
      const p = it.variant?.productRel;
      if (!p) continue;
      const cur = byProduct.get(p.id) ?? { name: p.name, units: 0 };
      cur.units += it.qtyOrdered;
      byProduct.set(p.id, cur);
    }
    const ranked = [...byProduct.entries()].sort((a, b) => b[1].units - a[1].units);
    const fastMovers = ranked.slice(0, 6).map(([productId, v]) => ({
      productId,
      name: v.name,
      unitsSold: v.units
    }));
    const slowMovers = activeProductSample
      .filter((p) => (byProduct.get(p.id)?.units ?? 0) < 2)
      .slice(0, 6)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        unitsSold: byProduct.get(p.id)?.units ?? 0
      }));

    const insightTips: string[] = [];
    if (lowStock.length) {
      insightTips.push(
        `${lowStock.length} active SKU${lowStock.length === 1 ? "" : "s"} ${lowStock.length === 1 ? "is" : "are"} at or below the low-stock threshold — prioritize replenishment.`
      );
    }
    if (fastMovers[0]) {
      insightTips.push(
        `${fastMovers[0].name} led unit sales in the last 30 days — keep buffer stock and spotlight it on the homepage.`
      );
    }
    if (slowMovers[0]) {
      insightTips.push(
        `${slowMovers[0].name} moved fewer than 2 units in the last 30 days — review pricing, merchandising, or bundle it with a fast mover.`
      );
    }
    if (insightTips.length === 0) {
      insightTips.push("Sales signals look balanced — continue monitoring weekly velocity and inventory coverage.");
    }

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
        totalRevenueInPaise: revenueAgg._sum.reportingTotalInInrPaise ?? 0,
        revenueInPaise: {
          today: revenueTodayAgg._sum.reportingTotalInInrPaise ?? 0,
          last7Days: revenueWeekAgg._sum.reportingTotalInInrPaise ?? 0,
          thisMonth: revenueMonthAgg._sum.reportingTotalInInrPaise ?? 0
        },
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
        revenueByDayLast7,
        revenueByDayLast30,
        revenueByMonthLast12,
        insights: {
          fastMovers,
          slowMovers,
          tips: insightTips
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

const ordersExportPdfQuery = z.object({
  range: z.enum(["today", "week", "month", "year"])
});

export async function ordersExportPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = ordersExportPdfQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "range must be one of: today, week, month, year",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const now = new Date();
    const today = startOfUtcDay(now);
    const range = parsed.data.range;
    let from: Date;
    let title: string;
    switch (range) {
      case "today":
        from = today;
        title = "Sarveda — Orders (today)";
        break;
      case "week":
        from = addUtcDays(today, -6);
        title = "Sarveda — Orders (last 7 days)";
        break;
      case "month":
        from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        title = "Sarveda — Orders (this calendar month)";
        break;
      case "year":
        from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
        title = `Sarveda — Orders (${now.getUTCFullYear()}, month-wise)`;
        break;
      default:
        from = today;
        title = "Sarveda — Orders";
    }

    const orders = await prisma.order.findMany({
      where: { deletedAt: null, createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: 4000,
      select: {
        orderNumber: true,
        email: true,
        status: true,
        paymentStatus: true,
        grandTotalInPaise: true,
        createdAt: true,
        items: {
          select: { nameSnapshot: true, qtyOrdered: true, lineTotalInPaise: true }
        }
      }
    });

    const doc = new PDFDocument({ margin: 48, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="sarveda-orders-${range}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).text(title, { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#555").text(`Generated ${now.toISOString()} · ${orders.length} orders`, {
      align: "left"
    });
    doc.fillColor("#000");
    doc.moveDown();

    if (range === "year") {
      const buckets = new Map<string, typeof orders>();
      for (const o of orders) {
        const mk = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
        const list = buckets.get(mk) ?? [];
        list.push(o);
        buckets.set(mk, list);
      }
      const months = [...buckets.keys()].sort();
      for (const mk of months) {
        const list = buckets.get(mk) ?? [];
        const subtotal = list.reduce((s, o) => s + o.grandTotalInPaise, 0);
        doc.fontSize(12).text(`Month ${mk}`, { underline: true });
        doc.fontSize(9).text(`${list.length} orders · ₹${(subtotal / 100).toLocaleString("en-IN")}`);
        doc.moveDown(0.3);
        for (const o of list) {
          doc
            .fontSize(8)
            .text(
              `${o.orderNumber}  ${o.status}  ${o.paymentStatus}  ₹${(o.grandTotalInPaise / 100).toLocaleString("en-IN")}  ${o.email}`
            );
        }
        doc.moveDown();
      }
    } else {
      for (const o of orders) {
        const lines = o.items.map((i) => `${i.qtyOrdered}× ${i.nameSnapshot}`).join("; ");
        doc
          .fontSize(9)
          .text(
            `${o.orderNumber} · ${o.status} · ${o.paymentStatus} · ₹${(o.grandTotalInPaise / 100).toLocaleString("en-IN")} · ${o.createdAt.toISOString().slice(0, 10)}`
          );
        doc.fontSize(8).fillColor("#444").text(`${o.email} — ${lines}`, { width: 500 });
        doc.fillColor("#000");
        doc.moveDown(0.25);
      }
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}

/** Unpaid orders older than this are treated as abandoned checkout (separate from cancelled). */
const ABANDON_CHECKOUT_MS = 48 * 60 * 60 * 1000;

type OrderBucket =
  | "all"
  | "pending"
  | "abandoned"
  | "cancelled"
  | "refunded"
  | "paid"
  | "shipped"
  | "delivered";

function bucketWhere(bucket: Exclude<OrderBucket, "all">, now: Date): Record<string, unknown> {
  const abandonedCutoff = new Date(now.getTime() - ABANDON_CHECKOUT_MS);
  switch (bucket) {
    case "pending":
      return {
        status: "PENDING_PAYMENT" as const,
        createdAt: { gte: abandonedCutoff }
      };
    case "abandoned":
      return {
        status: "PENDING_PAYMENT" as const,
        createdAt: { lt: abandonedCutoff }
      };
    case "cancelled":
      return { status: "CANCELLED" as const };
    case "refunded":
      return { status: "REFUNDED" as const };
    case "paid":
      return { status: { in: ["PAID", "PROCESSING", "PACKED"] } };
    case "shipped":
      return { status: "SHIPPED" as const };
    case "delivered":
      return { status: "DELIVERED" as const };
    default:
      return {};
  }
}

export async function customersList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const q = String(req.query.q ?? "").trim().toLowerCase();

    const where =
      q ?
        {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } }
          ]
        }
      : {};

    const [total, rows] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          wooCommerceId: true,
          createdAt: true,
          _count: { select: { orders: true } }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        items: rows.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          phone: u.phone,
          role: u.role,
          wooCommerceId: u.wooCommerceId,
          orderCount: u._count.orders,
          createdAt: u.createdAt
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

export async function ordersList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const now = new Date();
    const rawBucket = String(req.query.bucket ?? "all");
    const valid: OrderBucket[] = [
      "all",
      "pending",
      "abandoned",
      "cancelled",
      "refunded",
      "paid",
      "shipped",
      "delivered"
    ];
    const bucket: OrderBucket = valid.includes(rawBucket as OrderBucket) ? (rawBucket as OrderBucket) : "all";
    const bWhere = bucket === "all" ? {} : bucketWhere(bucket, now);

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
          currency: o.currency,
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
        items: {
          include: {
            variant: { select: { id: true, sku: true } },
            pickupLocation: { select: { id: true, label: true, shiprocketPickupName: true } }
          }
        },
        addresses: true,
        payments: true,
        invoice: true,
        shipments: {
          orderBy: { createdAt: "desc" },
          include: {
            pickupLocation: { select: { id: true, label: true, shiprocketPickupName: true } }
          }
        },
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
    const paidPipeline = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] as OrderStatus[];

    if (
      (status === "CANCELLED" || status === "REFUNDED") &&
      paidPipeline.includes(prevStatus)
    ) {
      const { handlePaidOrderStatusChange } = await import("../orders/orders.service");
      const { notifyOrderEmail } = await import("../notifications/email");
      await handlePaidOrderStatusChange(
        id,
        status === "REFUNDED" ? "REFUNDED" : "CANCELLED",
        "Admin status update"
      );
      notifyOrderEmail(id, status === "REFUNDED" ? "refund_initiated" : "order_cancelled");
      const order = await prisma.order.findFirst({
        where: { id },
        include: { items: true, addresses: true, invoice: true }
      });
      res.json({ success: true, data: { order } });
      return;
    }

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
      const { notifyOrderEmail } = await import("../notifications/email");
      notifyOrderEmail(order.id, "order_processing");
      void onOrderEnteredProcessing(order.id);
    }

    res.json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
}

const inventoryInclude = {
  variant: {
    include: {
      productRel: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          catalogHidden: true,
          categories: {
            include: {
              category: { select: { slug: true, name: true, position: true } }
            }
          }
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
} as const;

type InventoryRowDb = Awaited<
  ReturnType<typeof prisma.inventory.findMany<{ include: typeof inventoryInclude }>>
>[number];

function mapInventoryRow(
  inv: InventoryRowDb,
  auditMap: Map<string, ZohoItemAuditRow> | null
) {
  const labels = inv.variant.attributeValues
    .map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
    .join(" · ");
  const available = Math.max(0, inv.onHand - inv.reserved);
  const low = inv.onHand > 0 && inv.onHand <= inv.lowStockThreshold;
  const categories = inv.variant.productRel.categories
    .map((pc) => ({
      slug: pc.category.slug,
      name: pc.category.name,
      position: pc.category.position
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  const audit = auditSarvedaVariant(inv.variant.sku, inv.onHand, auditMap);

  return {
    inventoryId: inv.id,
    variantId: inv.variantId,
    sku: inv.variant.sku,
    productId: inv.variant.productRel.id,
    productName: inv.variant.productRel.name,
    productSlug: inv.variant.productRel.slug,
    productStatus: inv.variant.productRel.status,
    catalogHidden: inv.variant.productRel.catalogHidden,
    variantLabel: labels || null,
    categories,
    primaryCategorySlug: categories[0]?.slug ?? null,
    primaryCategoryName: categories[0]?.name ?? "Uncategorized",
    onHand: inv.onHand,
    reserved: inv.reserved,
    available,
    lowStockThreshold: inv.lowStockThreshold,
    low,
    inZohoBooks: audit.inZohoBooks,
    zohoStockOnHand: audit.zohoStockOnHand,
    zohoSyncScenario: audit.scenario
  };
}

export async function inventoryList(req: Request, res: Response, next: NextFunction) {
  try {
    const loadAll = req.query.all === "1" || req.query.all === "true";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = loadAll
      ? 10000
      : Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
    const skip = loadAll ? 0 : (page - 1) * limit;

    const where = shopInventoryWhere;

    const [{ lastSyncAt, skuSet: zohoSkuSet, auditMap }, total, productCount, rows, syncSummary, zohoOnlyItems] =
      await Promise.all([
        getZohoStockSyncMeta(),
        prisma.inventory.count({ where }),
        prisma.product.count({
          where: {
            ...shopCatalogProductWhere,
            variants: { some: { inventory: { isNot: null } } }
          }
        }),
        prisma.inventory.findMany({
          where,
          orderBy: [{ onHand: "asc" }],
          skip,
          take: limit,
          include: inventoryInclude
        }),
        computeZohoSyncSummary(),
        listZohoOnlyItems()
      ]);

    const items = rows.map((inv) => mapInventoryRow(inv, auditMap));

    const totalPages = loadAll ? 1 : Math.max(1, Math.ceil(total / limit));
    res.json({
      success: true,
      data: {
        items,
        pagination: { page: loadAll ? 1 : page, limit, total, totalPages },
        meta: {
          lastZohoStockSyncAt: lastSyncAt,
          zohoSkuAuditAvailable: auditMap !== null || zohoSkuSet !== null,
          productCount,
          zohoSyncSummary: syncSummary,
          zohoOnlyItems
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export const patchInventorySchema = z
  .object({
    onHand: z.number().int().min(0).optional(),
    lowStockThreshold: z.number().int().min(0).optional()
  })
  .refine((d) => d.onHand !== undefined || d.lowStockThreshold !== undefined, {
    message: "Provide onHand and/or lowStockThreshold"
  });

export const bulkInventoryPatchSchema = z.object({
  updates: z
    .array(
      z
        .object({
          variantId: z.string().uuid(),
          onHand: z.number().int().min(0).optional(),
          lowStockThreshold: z.number().int().min(0).optional()
        })
        .refine((u) => u.onHand !== undefined || u.lowStockThreshold !== undefined, {
          message: "Each update needs onHand and/or lowStockThreshold"
        })
    )
    .min(1)
    .max(500)
});

export const inventoryImportSchema = z.object({
  rows: z
    .array(
      z.object({
        sku: z.string().min(1).max(120),
        onHand: z.number().int().min(0)
      })
    )
    .min(1)
    .max(5000)
});

export async function patchInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const { variantId } = req.params;
    const body = req.body as z.infer<typeof patchInventorySchema>;
    const data: { onHand?: number; lowStockThreshold?: number } = {};
    if (body.onHand !== undefined) data.onHand = body.onHand;
    if (body.lowStockThreshold !== undefined) data.lowStockThreshold = body.lowStockThreshold;

    const inv = await prisma.inventory.updateMany({
      where: { variantId },
      data
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
      include: inventoryInclude
    });

    const { auditMap } = await getZohoStockSyncMeta();
    res.json({
      success: true,
      data: { inventory: row ? mapInventoryRow(row, auditMap) : null }
    });
  } catch (err) {
    next(err);
  }
}

export async function bulkPatchInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const { updates } = req.body as z.infer<typeof bulkInventoryPatchSchema>;
    let updated = 0;

    for (const u of updates) {
      const data: { onHand?: number; lowStockThreshold?: number } = {};
      if (u.onHand !== undefined) data.onHand = u.onHand;
      if (u.lowStockThreshold !== undefined) data.lowStockThreshold = u.lowStockThreshold;
      const result = await prisma.inventory.updateMany({
        where: { variantId: u.variantId },
        data
      });
      updated += result.count;
    }

    res.json({ success: true, data: { updated, requested: updates.length } });
  } catch (err) {
    next(err);
  }
}

export async function importInventoryRows(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = req.body as z.infer<typeof inventoryImportSchema>;
    let updated = 0;
    let notFound = 0;

    for (const row of rows) {
      const sku = row.sku.trim();
      if (!sku) continue;

      const variant = await prisma.productVariant.findUnique({
        where: { sku },
        select: { id: true }
      });
      if (!variant) {
        notFound++;
        continue;
      }

      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: row.onHand },
        update: { onHand: row.onHand }
      });
      updated++;
    }

    res.json({
      success: true,
      data: { updated, notFound, total: rows.length }
    });
  } catch (err) {
    next(err);
  }
}

export const orderAddressPatchSchema = z
  .object({
    type: z.nativeEnum(AddressType),
    fullName: z.string().min(1).max(200).optional(),
    phone: z.string().min(5).max(30).optional(),
    line1: z.string().min(1).max(300).optional(),
    line2: z.string().max(300).nullable().optional(),
    city: z.string().min(1).max(100).optional(),
    state: z.string().min(1).max(100).optional(),
    postalCode: z.string().min(2).max(20).optional(),
    country: z.string().min(2).max(4).optional()
  })
  .refine(
    (d) =>
      d.fullName !== undefined ||
      d.phone !== undefined ||
      d.line1 !== undefined ||
      d.line2 !== undefined ||
      d.city !== undefined ||
      d.state !== undefined ||
      d.postalCode !== undefined ||
      d.country !== undefined,
    { message: "Provide at least one address field to update" }
  );

export async function patchOrderAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = req.body as z.infer<typeof orderAddressPatchSchema>;
    const order = await prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!order) {
      res.status(404).json({
        success: false,
        error: "Order not found",
        code: "NOT_FOUND"
      });
      return;
    }
    const addr = await prisma.orderAddress.findFirst({
      where: { orderId: id, type: body.type }
    });
    if (!addr) {
      res.status(404).json({
        success: false,
        error: "Address row not found for this order",
        code: "NOT_FOUND"
      });
      return;
    }
    const mergedCountry = (body.country ?? addr.country).trim().toUpperCase();
    const mergedPostal = (body.postalCode ?? addr.postalCode).trim();
    const mergedPhone = (body.phone ?? addr.phone).trim();

    if (mergedCountry === "IN") {
      const pinDigits = mergedPostal.replace(/\D/g, "").slice(0, 6);
      if (pinDigits.length !== 6) {
        res.status(400).json({
          success: false,
          error: "Indian postal codes must be exactly 6 digits.",
          code: "VALIDATION_ERROR"
        });
        return;
      }
      const phDigits = mergedPhone.replace(/\D/g, "");
      if (phDigits.length < 10 || phDigits.length > 12) {
        res.status(400).json({
          success: false,
          error: "Indian phone numbers should be 10–12 digits (including STD/series).",
          code: "VALIDATION_ERROR"
        });
        return;
      }
    } else {
      if (mergedPostal.length < 2 || mergedPostal.length > 20) {
        res.status(400).json({
          success: false,
          error: "Postal code looks invalid for the selected country.",
          code: "VALIDATION_ERROR"
        });
        return;
      }
      const phDigits = mergedPhone.replace(/\D/g, "");
      if (phDigits.length < 8 || phDigits.length > 18) {
        res.status(400).json({
          success: false,
          error: "Phone number looks too short or too long for the selected country.",
          code: "VALIDATION_ERROR"
        });
        return;
      }
    }

    await prisma.orderAddress.update({
      where: { id: addr.id },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
        ...(body.line1 !== undefined ? { line1: body.line1.trim() } : {}),
        ...(body.line2 !== undefined ? { line2: body.line2?.trim() || null } : {}),
        ...(body.city !== undefined ? { city: body.city.trim() } : {}),
        ...(body.state !== undefined ? { state: body.state.trim() } : {}),
        ...(body.postalCode !== undefined ? { postalCode: body.postalCode.trim() } : {}),
        ...(body.country !== undefined ? { country: body.country.trim().toUpperCase() } : {})
      }
    });
    const orderFull = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: { include: { variant: { select: { id: true, sku: true } } } },
        addresses: true,
        payments: true,
        invoice: true,
        shipments: {
          orderBy: { createdAt: "desc" },
          include: { pickupLocation: { select: { id: true, label: true, shiprocketPickupName: true } } }
        },
        customer: { select: { id: true, email: true, name: true } }
      }
    });
    res.json({ success: true, data: { order: orderFull } });
  } catch (err) {
    next(err);
  }
}

export async function reconcileRazorpayOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const row = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { payments: { where: { provider: "RAZORPAY" }, orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!row) {
      res.status(404).json({
        success: false,
        error: "Order not found",
        code: "NOT_FOUND"
      });
      return;
    }
    const pay = row.payments[0];
    if (!pay?.providerOrderId) {
      res.status(400).json({
        success: false,
        error: "No Razorpay order id on this payment",
        code: "NO_RAZORPAY_ORDER"
      });
      return;
    }
    let items: Array<Record<string, unknown>>;
    try {
      items = await fetchRazorpayOrderPayments(pay.providerOrderId);
    } catch (e) {
      logger.warn("razorpay_reconcile_fetch_failed", { orderId: id, err: e });
      const msg = e instanceof Error ? e.message : "Razorpay request failed";
      res.status(502).json({
        success: false,
        error: msg,
        code: "RAZORPAY_API"
      });
      return;
    }
    const captured = [...items].reverse().find((p) => String(p.status ?? "").toLowerCase() === "captured");
    if (!captured || typeof captured.id !== "string") {
      res.json({
        success: true,
        data: {
          updated: false,
          reason: "No captured Razorpay payment found for this order yet.",
          paymentsChecked: items.length
        }
      });
      return;
    }
    const pid = captured.id;
    try {
      await completePaidOrder(pay.providerOrderId, pid);
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      res.status(err.statusCode ?? 400).json({
        success: false,
        error: err.message ?? "Reconcile failed",
        code: err.code ?? "RECONCILE_FAILED"
      });
      return;
    }
    const fresh = await prisma.order.findFirst({
      where: { id },
      select: { status: true, paymentStatus: true, orderNumber: true }
    });
    res.json({
      success: true,
      data: {
        updated: true,
        orderStatus: fresh?.status,
        paymentStatus: fresh?.paymentStatus,
        orderNumber: fresh?.orderNumber,
        razorpayPaymentId: pid
      }
    });
  } catch (err) {
    next(err);
  }
}

/** Payment reconciliation summary for admin (order vs payment row mismatches). */
export async function paymentsReconciliation(req: Request, res: Response, next: NextFunction) {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    const rows = orders.map((o) => {
      const pay = o.payments[0];
      const isCod = pay?.provider === "COD";
      const mismatch =
        (o.paymentStatus === "CAPTURED" && pay?.status !== "CAPTURED") ||
        (o.status === "PAID" && o.paymentStatus === "PENDING" && !isCod) ||
        (o.status === "PENDING_PAYMENT" && pay?.status === "CAPTURED");
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        orderStatus: o.status,
        paymentStatus: o.paymentStatus,
        provider: pay?.provider ?? null,
        providerOrderId: pay?.providerOrderId ?? null,
        providerPaymentId: pay?.providerPaymentId ?? null,
        amountInPaise: pay?.amountInPaise ?? o.grandTotalInPaise,
        mismatch,
        createdAt: o.createdAt
      };
    });

    const mismatches = rows.filter((r) => r.mismatch);

    res.json({
      success: true,
      data: {
        days,
        total: rows.length,
        mismatchCount: mismatches.length,
        mismatches: mismatches.slice(0, 100),
        recent: rows.slice(0, 50)
      }
    });
  } catch (err) {
    next(err);
  }
}

export const orderItemWarehousesSchema = z.object({
  items: z.array(
    z.object({
      orderItemId: z.string().uuid(),
      pickupLocationId: z.string().uuid().nullable()
    })
  )
});

export async function patchOrderItemWarehouses(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: orderId } = req.params;
    const body = req.body as z.infer<typeof orderItemWarehousesSchema>;
    const order = await prisma.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }
    for (const row of body.items) {
      await prisma.orderItem.updateMany({
        where: { id: row.orderItemId, orderId },
        data: { pickupLocationId: row.pickupLocationId }
      });
    }
    res.json({ success: true, data: { updated: body.items.length } });
  } catch (err) {
    next(err);
  }
}

export const orderPreferredCourierSchema = z.object({
  preferredCourier: z.enum(["AUTO", "DELHIVERY", "SHIPROCKET", "SHIPROCKET_INTERNATIONAL"])
});

export async function patchOrderPreferredCourier(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = req.body as z.infer<typeof orderPreferredCourierSchema>;
    const order = await prisma.order.update({
      where: { id },
      data: { preferredCourier: body.preferredCourier }
    });
    res.json({ success: true, data: { preferredCourier: order.preferredCourier } });
  } catch (err) {
    next(err);
  }
}

export async function orderShippingBreakdown(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { items: true, addresses: true, payments: { take: 1 } }
    });
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }
    const ship = order.addresses.find((a) => a.type === "SHIPPING");
    const country = ship?.country ?? "IN";
    const isCod =
      order.payments[0]?.provider === "COD" ||
      (order.paymentStatus === "PENDING" && order.status === "PAID");
    const { computeVariantShippingBreakdown } = await import("../shipping/shippingRates.service");
    const lines = order.items.map((i) => ({ variantId: i.variantId, quantity: i.qtyOrdered }));
    const breakdown = await computeVariantShippingBreakdown(prisma, lines, country, {
      cod: isCod && country.toUpperCase() === "IN"
    });
    res.json({ success: true, data: { breakdown, orderShippingCharged: order.shippingInPaise } });
  } catch (err) {
    next(err);
  }
}
