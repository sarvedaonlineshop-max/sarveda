import { AddressType, OrderStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { fetchRazorpayOrderPayments } from "../payments/razorpay";
import { completePaidOrder } from "../payments/razorpay.verify";
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

export async function dashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const today = startOfUtcDay(now);
    const tomorrow = addUtcDays(today, 1);
    const weekStart = addUtcDays(today, -6);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const chart7Start = addUtcDays(today, -6);
    const chart30Start = addUtcDays(today, -29);
    const chart12mStart = addUtcMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -11);

    const revenueWhere = { deletedAt: null, status: { in: revenueStatuses } };

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
        _sum: { grandTotalInPaise: true }
      }),
      prisma.order.aggregate({
        where: { ...revenueWhere, createdAt: { gte: today, lt: tomorrow } },
        _sum: { grandTotalInPaise: true }
      }),
      prisma.order.aggregate({
        where: { ...revenueWhere, createdAt: { gte: weekStart } },
        _sum: { grandTotalInPaise: true }
      }),
      prisma.order.aggregate({
        where: { ...revenueWhere, createdAt: { gte: monthStart } },
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
      }),
      prisma.order.findMany({
        where: { ...revenueWhere, createdAt: { gte: chart7Start } },
        select: { grandTotalInPaise: true, createdAt: true }
      }),
      prisma.order.findMany({
        where: { ...revenueWhere, createdAt: { gte: chart30Start } },
        select: { grandTotalInPaise: true, createdAt: true }
      }),
      prisma.order.findMany({
        where: { ...revenueWhere, createdAt: { gte: chart12mStart } },
        select: { grandTotalInPaise: true, createdAt: true }
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

    const revenueByDayLast7 = buildDailySeries(chart7Start, 7, ordersForChart7);
    const revenueByDayLast30 = buildDailySeries(chart30Start, 30, ordersForChart30);
    const revenueByMonthLast12 = buildMonthlySeries(now, 12, ordersForChart12m);

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
        totalRevenueInPaise: revenueAgg._sum.grandTotalInPaise ?? 0,
        revenueInPaise: {
          today: revenueTodayAgg._sum.grandTotalInPaise ?? 0,
          last7Days: revenueWeekAgg._sum.grandTotalInPaise ?? 0,
          thisMonth: revenueMonthAgg._sum.grandTotalInPaise ?? 0
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
