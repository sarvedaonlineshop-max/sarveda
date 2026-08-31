import { AddressType, OrderStatus, Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import ExcelJS from "exceljs";
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
import { initiateGatewayRefund } from "../payments/refund.service";
import {
  cancelUnpaidOrderWithRelease,
  handlePaidOrderStatusChange
} from "../orders/orders.service";
import {
  adminApplyInventoryRestock,
  adminInventoryRestockBodySchema,
  listOrderInventoryRestocks
} from "../orders/order-inventory-restock.service";
import { notifyOrderEmail } from "../notifications/email";
import { onOrderEnteredProcessing } from "../shipping/orderLifecycle";
import { getZohoStockSyncMeta } from "../zoho/zoho-stock-sync-cache";
import { isZohoInventorySyncEnabled } from "../zoho/zoho-inventory-sync-flag";
import { auditSarvedaVariant, computeZohoSyncSummary, listZohoOnlyItems } from "../zoho/zoho-sync-audit";
import { mirrorStockToZohoForSkus } from "../zoho/zoho-items";
import type { ZohoItemAuditRow } from "../zoho/zoho-sync-types";
import { shopCatalogProductWhere, shopInventoryWhere } from "../../utils/shop-catalog";
import { liveAdminOrderWhere } from "./live-order-filter";
import {
  getReservedStockSummary,
  listReservedMismatches,
  reconcileInventoryReserved
} from "../orders/inventory-reserved-reconcile.service";
import {
  inventoryXlSheetSaveSchema,
  listInventoryXlSheetRows,
  saveInventoryXlSheetRows,
  type InventoryXlStockFilter
} from "./inventoryXlSheet.service";

export { inventoryXlSheetSaveSchema };
import {
  genuineCancelledWhere,
  unpaidAttemptCancelledWhere,
  unpaidCheckoutAttemptWhere
} from "../orders/abandoned-checkout";
import { buildZohoDashboardAnalytics, dashboardInsightsFromZoho } from "../zoho/zoho-dashboard-analytics.service";

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
      ...liveAdminOrderWhere(now),
      status: { in: revenueStatuses },
      reportingTotalInInrPaise: { not: null as null }
    };

    const liveOrders = liveAdminOrderWhere(now);

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
      ordersForChart12m
    ] = await Promise.all([
      prisma.order.aggregate({
        where: revenueWhere,
        _sum: { reportingTotalInInrPaise: true }
      }),
      prisma.order.aggregate({
        where: { AND: [revenueWhere, { placedAt: { gte: today, lt: tomorrow } }] },
        _sum: { reportingTotalInInrPaise: true }
      }),
      prisma.order.aggregate({
        where: { AND: [revenueWhere, { placedAt: { gte: weekStart } }] },
        _sum: { reportingTotalInInrPaise: true }
      }),
      prisma.order.aggregate({
        where: { AND: [revenueWhere, { placedAt: { gte: monthStart } }] },
        _sum: { reportingTotalInInrPaise: true }
      }),
      prisma.order.count({
        where: { AND: [liveOrders, { placedAt: { gte: today, lt: tomorrow } }] }
      }),
      prisma.order.count({
        where: { AND: [liveOrders, { placedAt: { gte: weekStart } }] }
      }),
      prisma.order.count({
        where: { AND: [liveOrders, { placedAt: { gte: monthStart } }] }
      }),
      prisma.product.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { id: true }
      }),
      prisma.order.findMany({
        where: liveOrders,
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
        where: { AND: [revenueWhere, { placedAt: { gte: chart7Start } }] },
        select: { reportingTotalInInrPaise: true, placedAt: true, createdAt: true }
      }),
      prisma.order.findMany({
        where: { AND: [revenueWhere, { placedAt: { gte: chart30Start } }] },
        select: { reportingTotalInInrPaise: true, placedAt: true, createdAt: true }
      }),
      prisma.order.findMany({
        where: { AND: [revenueWhere, { placedAt: { gte: chart12mStart } }] },
        select: { reportingTotalInInrPaise: true, placedAt: true, createdAt: true }
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
    const reservedSummary = await getReservedStockSummary();
    const reservedMismatchSamples = await listReservedMismatches(8);

    const revenueByDayLast7 = buildDailySeriesKolkata(chart7Start, 7, ordersForChart7);
    const revenueByDayLast30 = buildDailySeriesKolkata(chart30Start, 30, ordersForChart30);
    const revenueByMonthLast12 = buildMonthlySeriesKolkata(now, 12, ordersForChart12m);

    const wooInsights = await dashboardInsightsFromZoho();
    if (lowStock.length) {
      wooInsights.tips.unshift(
        `${lowStock.length} active SKU${lowStock.length === 1 ? "" : "s"} ${lowStock.length === 1 ? "is" : "are"} at or below the low-stock threshold — prioritize replenishment.`
      );
    }
    if (reservedSummary.orphanUnits > 0) {
      wooInsights.tips.unshift(
        `${reservedSummary.orphanUnits} reserved unit(s) across ${reservedSummary.orphanVariantCount} SKU(s) are not tied to a PENDING_PAYMENT order — run Inventory → Reconcile reserved.`
      );
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
        reservedStock: {
          ...reservedSummary,
          samples: reservedMismatchSamples.map((r) => ({
            sku: r.sku,
            productName: r.productName,
            onHand: r.onHand,
            reservedStored: r.reservedStored,
            reservedExpected: r.reservedExpected,
            orphanUnits: r.orphanUnits,
            pendingOrderNumbers: r.pendingOrderNumbers
          }))
        },
        revenueByDayLast7,
        revenueByDayLast30,
        revenueByMonthLast12,
        insights: wooInsights
      }
    });
  } catch (err) {
    next(err);
  }
}

/** Woo dump commerce analytics (filterable; no DB import). */
export async function wooProductAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const tabRaw = typeof req.query.tab === "string" ? req.query.tab : "products";
    const tab =
      tabRaw === "orders" ||
      tabRaw === "places" ||
      tabRaw === "returns" ||
      tabRaw === "refunds" ||
      tabRaw === "customers" ||
      tabRaw === "products"
        ? tabRaw
        : "products";
    const data = await buildZohoDashboardAnalytics({ from, to, tab });
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
}

/** Lightweight bell feed — low stock, today's sales, recent refunds. */
export async function adminNotifications(_req: Request, res: Response, next: NextFunction) {
  try {
    const today = startOfDayKolkata(new Date());
    const revenueStatuses: OrderStatus[] = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"];

    const [lowStockRows, soldToday, recentRefunds] = await Promise.all([
      prisma.inventory.findMany({
        where: {
          variant: {
            status: "ACTIVE",
            productRel: { deletedAt: null, status: "ACTIVE", catalogHidden: false }
          }
        },
        orderBy: { onHand: "asc" },
        take: 80,
        include: {
          variant: {
            include: { productRel: { select: { name: true, slug: true } } }
          }
        }
      }),
      prisma.orderItem.aggregate({
        where: {
          order: {
            deletedAt: null,
            status: { in: revenueStatuses },
            createdAt: { gte: today }
          }
        },
        _sum: { qtyOrdered: true }
      }),
      prisma.refund.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          payment: {
            include: {
              order: { select: { orderNumber: true } }
            }
          }
        }
      })
    ]);

    const lowStock = lowStockRows
      .filter((inv) => inv.onHand <= inv.lowStockThreshold)
      .slice(0, 8)
      .map((inv) => ({
        id: `low-${inv.variantId}`,
        type: "low_stock" as const,
        title: `${inv.variant.productRel.name} low stock`,
        detail: `${inv.variant.sku} — ${inv.onHand} on hand`,
        href: `/admin/inventory`
      }));

    const unitsToday = soldToday._sum.qtyOrdered ?? 0;
    const soldNotice =
      unitsToday > 0
        ? [
            {
              id: "sold-today",
              type: "sales" as const,
              title: `${unitsToday} unit${unitsToday === 1 ? "" : "s"} sold today`,
              detail: "Paid and in-flight orders since midnight IST",
              href: "/admin/orders"
            }
          ]
        : [];

    const refundNotices = recentRefunds.map((r) => ({
      id: `refund-${r.id}`,
      type: "refund" as const,
      title: `Refund ${r.status} · ${r.payment.order.orderNumber}`,
      detail: r.reason?.trim() || "Recent refund activity",
      href: "/admin/orders"
    }));

    const items = [...lowStock, ...soldNotice, ...refundNotices];
    res.json({ success: true, data: { items, unreadCount: items.length } });
  } catch (err) {
    next(err);
  }
}

/** Matches payment-timeout job (15 min). Pending = still awaiting pay; older unpaid → Abandoned. */
const PAYMENT_PENDING_MS = 15 * 60 * 1000;

type OrderBucket =
  | "all"
  | "pending"
  | "abandoned"
  | "attempted"
  | "cancelled"
  | "refunded"
  | "paid"
  | "shipped"
  | "delivered";

const ORDER_BUCKETS: OrderBucket[] = [
  "all",
  "pending",
  "abandoned",
  "attempted",
  "cancelled",
  "refunded",
  "paid",
  "shipped",
  "delivered"
];

function bucketWhere(bucket: Exclude<OrderBucket, "all">, now: Date): Prisma.OrderWhereInput {
  const pendingCutoff = new Date(now.getTime() - PAYMENT_PENDING_MS);
  switch (bucket) {
    case "pending":
      return {
        status: "PENDING_PAYMENT",
        createdAt: { gte: pendingCutoff }
      };
    case "abandoned":
    case "attempted":
      return {
        OR: [
          unpaidAttemptCancelledWhere,
          {
            AND: [
              unpaidCheckoutAttemptWhere,
              { status: "PENDING_PAYMENT", createdAt: { lt: pendingCutoff } }
            ]
          }
        ]
      };
    case "cancelled":
      return genuineCancelledWhere;
    case "refunded":
      return { status: "REFUNDED" };
    case "paid":
      return { status: { in: ["PAID", "PROCESSING", "PACKED"] } };
    case "shipped":
      return { status: "SHIPPED" };
    case "delivered":
      return { status: "DELIVERED" };
    default:
      return {};
  }
}

type OrdersListFilters = {
  now: Date;
  bucket: OrderBucket;
  orderNumber: string;
  customerName: string;
  place: string;
  country: string;
  from: Date | null;
  toExclusive: Date | null;
};

function parseYmdToKolkataStart(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOrdersListFilters(req: Request): OrdersListFilters {
  const now = new Date();
  const rawBucket = String(req.query.bucket ?? "all");
  const bucket: OrderBucket = ORDER_BUCKETS.includes(rawBucket as OrderBucket)
    ? (rawBucket as OrderBucket)
    : "all";

  const orderNumber = String(req.query.orderNumber ?? req.query.orderId ?? "").trim();
  const customerName = String(req.query.customerName ?? "").trim();
  const place = String(req.query.place ?? req.query.city ?? "").trim();
  const country = String(req.query.country ?? "").trim();

  const todayFlag =
    String(req.query.today ?? "").trim() === "1" ||
    String(req.query.today ?? "").toLowerCase() === "true";

  let from: Date | null = null;
  let toExclusive: Date | null = null;

  if (todayFlag) {
    from = startOfDayKolkata(now);
    toExclusive = addDaysInstant(from, 1);
  } else {
    const fromRaw = String(req.query.from ?? req.query.dateFrom ?? "").trim();
    const toRaw = String(req.query.to ?? req.query.dateTo ?? "").trim();
    if (fromRaw) from = parseYmdToKolkataStart(fromRaw);
    if (toRaw) {
      const toStart = parseYmdToKolkataStart(toRaw);
      if (toStart) toExclusive = addDaysInstant(toStart, 1);
    }
  }

  return { now, bucket, orderNumber, customerName, place, country, from, toExclusive };
}

function ordersSearchWhere(f: OrdersListFilters): Prisma.OrderWhereInput {
  const parts: Prisma.OrderWhereInput[] = [liveAdminOrderWhere(f.now)];

  if (f.orderNumber) {
    parts.push({ orderNumber: { contains: f.orderNumber, mode: "insensitive" } });
  }
  if (f.customerName) {
    parts.push({
      OR: [
        { email: { contains: f.customerName, mode: "insensitive" } },
        { phone: { contains: f.customerName } },
        { customer: { name: { contains: f.customerName, mode: "insensitive" } } },
        {
          addresses: {
            some: { fullName: { contains: f.customerName, mode: "insensitive" } }
          }
        }
      ]
    });
  }
  if (f.place) {
    parts.push({
      addresses: {
        some: {
          OR: [
            { city: { contains: f.place, mode: "insensitive" } },
            { state: { contains: f.place, mode: "insensitive" } },
            { postalCode: { contains: f.place, mode: "insensitive" } }
          ]
        }
      }
    });
  }
  if (f.country) {
    parts.push({
      addresses: {
        some: { country: { contains: f.country, mode: "insensitive" } }
      }
    });
  }
  if (f.from || f.toExclusive) {
    parts.push({
      createdAt: {
        ...(f.from ? { gte: f.from } : {}),
        ...(f.toExclusive ? { lt: f.toExclusive } : {})
      }
    });
  }

  return { AND: parts };
}

function ordersListWhere(f: OrdersListFilters): Prisma.OrderWhereInput {
  const search = ordersSearchWhere(f);
  if (f.bucket === "all") return search;
  return { AND: [search, bucketWhere(f.bucket, f.now)] };
}

async function loadOrdersForExport(f: OrdersListFilters) {
  return prisma.order.findMany({
    where: ordersListWhere(f),
    orderBy: { createdAt: "desc" },
    take: 4000,
    select: {
      orderNumber: true,
      email: true,
      phone: true,
      status: true,
      paymentStatus: true,
      currency: true,
      grandTotalInPaise: true,
      createdAt: true,
      customer: { select: { name: true } },
      addresses: {
        select: { type: true, fullName: true, city: true, state: true, country: true, postalCode: true }
      },
      items: {
        select: { nameSnapshot: true, qtyOrdered: true, lineTotalInPaise: true }
      },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true } }
    }
  });
}

function shippingAddress(addresses: Array<{
  type: AddressType;
  fullName: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}>) {
  return addresses.find((a) => a.type === "SHIPPING") ?? addresses[0] ?? null;
}

/** Unified filtered export — Excel or PDF (same filters as Orders list). */
export async function ordersExport(req: Request, res: Response, next: NextFunction) {
  try {
    const formatRaw = String(req.query.format ?? "pdf").toLowerCase();
    const format = formatRaw === "xlsx" || formatRaw === "excel" || formatRaw === "xls" ? "xlsx" : "pdf";
    const f = parseOrdersListFilters(req);
    const orders = await loadOrdersForExport(f);
    const stamp = dateKeyKolkata(f.now);

    const filterLabel = [
      f.bucket !== "all" ? `bucket=${f.bucket}` : null,
      f.orderNumber ? `order=${f.orderNumber}` : null,
      f.customerName ? `customer=${f.customerName}` : null,
      f.place ? `place=${f.place}` : null,
      f.country ? `country=${f.country}` : null,
      f.from ? `from=${dateKeyKolkata(f.from)}` : null,
      f.toExclusive ? `to=${dateKeyKolkata(addDaysInstant(f.toExclusive, -1))}` : null
    ]
      .filter(Boolean)
      .join(", ");

    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Sarveda Admin";
      wb.created = f.now;
      const sheet = wb.addWorksheet("Orders");
      sheet.columns = [
        { header: "Order", key: "orderNumber", width: 18 },
        { header: "Customer", key: "customer", width: 22 },
        { header: "Email", key: "email", width: 28 },
        { header: "Phone", key: "phone", width: 16 },
        { header: "Place", key: "place", width: 18 },
        { header: "State", key: "state", width: 14 },
        { header: "Country", key: "country", width: 10 },
        { header: "Status", key: "status", width: 14 },
        { header: "Payment", key: "paymentStatus", width: 14 },
        { header: "Provider", key: "provider", width: 12 },
        { header: "Currency", key: "currency", width: 10 },
        { header: "Amount", key: "amount", width: 12 },
        { header: "Items", key: "items", width: 40 },
        { header: "Created", key: "createdAt", width: 22 }
      ];
      sheet.getRow(1).font = { bold: true };
      for (const o of orders) {
        const ship = shippingAddress(o.addresses);
        sheet.addRow({
          orderNumber: o.orderNumber,
          customer: o.customer?.name ?? ship?.fullName ?? "",
          email: o.email,
          phone: o.phone ?? "",
          place: ship?.city ?? "",
          state: ship?.state ?? "",
          country: ship?.country ?? "",
          status: o.status,
          paymentStatus: o.paymentStatus,
          provider: o.payments[0]?.provider ?? "",
          currency: o.currency,
          amount: Math.round(o.grandTotalInPaise) / 100,
          items: o.items.map((i) => `${i.qtyOrdered}× ${i.nameSnapshot}`).join("; "),
          createdAt: o.createdAt.toISOString()
        });
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="sarveda-orders-${stamp}.xlsx"`);
      res.send(buf);
      return;
    }

    const doc = new PDFDocument({ margin: 48, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="sarveda-orders-${stamp}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).text("Sarveda — Orders export", { align: "left" });
    doc.moveDown(0.4);
    doc
      .fontSize(9)
      .fillColor("#555")
      .text(
        `Generated ${f.now.toISOString()} · ${orders.length} orders${filterLabel ? ` · ${filterLabel}` : ""}`,
        { align: "left" }
      );
    doc.fillColor("#000");
    doc.moveDown();

    for (const o of orders) {
      const ship = shippingAddress(o.addresses);
      const lines = o.items.map((i) => `${i.qtyOrdered}× ${i.nameSnapshot}`).join("; ");
      const place = [ship?.city, ship?.state, ship?.country].filter(Boolean).join(", ");
      doc
        .fontSize(9)
        .text(
          `${o.orderNumber} · ${o.status} · ${o.paymentStatus} · ${o.currency} ${(o.grandTotalInPaise / 100).toLocaleString("en-IN")} · ${o.createdAt.toISOString().slice(0, 10)}`
        );
      doc
        .fontSize(8)
        .fillColor("#444")
        .text(
          `${o.customer?.name ?? ship?.fullName ?? "—"} · ${o.email}${place ? ` · ${place}` : ""} — ${lines}`,
          { width: 500 }
        );
      doc.fillColor("#000");
      doc.moveDown(0.25);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}

/** @deprecated Prefer ordersExport — kept so old PDF links still work. */
export async function ordersExportPdf(req: Request, res: Response, next: NextFunction) {
  if (!req.query.format) req.query.format = "pdf";
  // Legacy range=today|week|month|year → map onto from/to when no explicit dates
  const range = String(req.query.range ?? "").trim();
  if (range && !req.query.from && !req.query.today) {
    const now = new Date();
    const today = startOfDayKolkata(now);
    if (range === "today") {
      req.query.today = "1";
    } else if (range === "week") {
      req.query.from = dateKeyKolkata(addDaysInstant(today, -6));
      req.query.to = dateKeyKolkata(today);
    } else if (range === "month") {
      req.query.from = dateKeyKolkata(startOfMonthKolkata(now));
      req.query.to = dateKeyKolkata(today);
    } else if (range === "year") {
      req.query.from = `${now.getFullYear()}-01-01`;
      req.query.to = dateKeyKolkata(today);
    }
  }
  return ordersExport(req, res, next);
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
    const f = parseOrdersListFilters(req);
    const where = ordersListWhere(f);
    const searchBase = ordersSearchWhere(f);

    const countBuckets = [
      "all",
      "paid",
      "pending",
      "abandoned",
      "cancelled",
      "refunded",
      "shipped",
      "delivered"
    ] as const;

    const [total, rows, ...bucketCounts] = await prisma.$transaction([
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
          customer: { select: { id: true, email: true, name: true } },
          payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true } },
          addresses: {
            where: { type: "SHIPPING" },
            take: 1,
            select: { city: true, state: true, country: true }
          }
        }
      }),
      ...countBuckets.map((b) =>
        prisma.order.count({
          where:
            b === "all"
              ? searchBase
              : { AND: [searchBase, bucketWhere(b, f.now)] }
        })
      )
    ]);

    const counts = Object.fromEntries(
      countBuckets.map((b, i) => [b, bucketCounts[i] as number])
    ) as Record<(typeof countBuckets)[number], number>;

    res.json({
      success: true,
      data: {
        items: rows.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          email: o.email,
          customerName: o.customer?.name ?? null,
          city: o.addresses[0]?.city ?? null,
          state: o.addresses[0]?.state ?? null,
          country: o.addresses[0]?.country ?? null,
          status: o.status,
          paymentStatus: o.paymentStatus,
          paymentProvider: o.payments[0]?.provider ?? null,
          grandTotalInPaise: o.grandTotalInPaise,
          currency: o.currency,
          itemCount: o.items.reduce((s, i) => s + i.qtyOrdered, 0),
          linePreview: o.items.slice(0, 2).map((i) => i.nameSnapshot),
          createdAt: o.createdAt
        })),
        counts,
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
        payments: {
          orderBy: { createdAt: "desc" },
          include: {
            refunds: { orderBy: { createdAt: "desc" } }
          }
        },
        invoice: true,
        shipments: {
          orderBy: { createdAt: "desc" },
          include: {
            pickupLocation: { select: { id: true, label: true, shiprocketPickupName: true } }
          }
        },
        customer: { select: { id: true, email: true, name: true } },
        serviceRequests: {
          orderBy: { createdAt: "desc" },
          include: {
            photos: true,
            items: { include: { photos: true } }
          }
        },
        inventoryRestocks: { orderBy: { createdAt: "asc" } },
        attribution: true
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
        invoiceNo: inv?.invoiceNo ?? null,
        /** Same-origin proxy — S3 invoice objects are private. */
        downloadUrl: inv ? `/api/admin/orders/${id}/invoice/download` : null
      }
    });
  } catch (err) {
    next(err);
  }
}

/** Admin invoice download — fetches from private S3 or regenerates PDF. */
export async function downloadOrderInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: { id: true }
    });
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    const { downloadOrderInvoicePdf } = await import("../invoices/invoice.service");
    const result = await downloadOrderInvoicePdf(order.id);
    if (!result) {
      res.status(400).json({
        success: false,
        error: "Invoice not available yet (order must be paid or COD confirmed)",
        code: "INVOICE_NOT_READY"
      });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.invoiceNo}.pdf"`);
    res.send(result.pdf);
  } catch (err) {
    next(err);
  }
}

/** Force-regenerate GST/commercial invoice PDF (overwrites S3). For layout testing. */
export async function regenerateOrderInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, orderNumber: true }
    });
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    const { regenerateOrderInvoicePdf } = await import("../invoices/invoice.service");
    const result = await regenerateOrderInvoicePdf(order.id);
    if (!result) {
      res.status(400).json({
        success: false,
        error: "Could not generate invoice (missing shipping address or order data)",
        code: "INVOICE_NOT_READY"
      });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.invoiceNo}.pdf"`);
    res.send(result.pdf);
  } catch (err) {
    next(err);
  }
}

export async function orderDeliveryChallan(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const {
      getDeliveryChallanForOrder,
      serializeChallan
    } = await import("../delivery-challans/delivery-challan.service");
    const row = await getDeliveryChallanForOrder(id);
    res.json({
      success: true,
      data: row ? serializeChallan(row) : null
    });
  } catch (err) {
    next(err);
  }
}

export async function generateOrderDeliveryChallan(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const {
      generateDeliveryChallan,
      serializeChallan
    } = await import("../delivery-challans/delivery-challan.service");
    const result = await generateDeliveryChallan(id, req.body);
    res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        ...serializeChallan(result.challan),
        created: result.created
      },
      message: result.created ? "Delivery challan generated" : "Delivery challan already exists"
    });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({
        success: false,
        error: e.message,
        code: e.code ?? "CHALLAN_ERROR"
      });
      return;
    }
    next(err);
  }
}

export async function downloadOrderDeliveryChallan(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: { id: true }
    });
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    const { downloadDeliveryChallanPdf } = await import("../delivery-challans/delivery-challan.service");
    const result = await downloadDeliveryChallanPdf(order.id);
    if (!result) {
      res.status(404).json({
        success: false,
        error: "Delivery challan not found — generate it first",
        code: "CHALLAN_NOT_FOUND"
      });
      return;
    }

    const filename = `${result.challanNumber.replace(/\//g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(result.pdf);
  } catch (err) {
    next(err);
  }
}

function sendEwayServiceError(res: Response, err: unknown, next: NextFunction) {
  const e = err as Error & { statusCode?: number; code?: string };
  if (e.statusCode) {
    res.status(e.statusCode).json({
      success: false,
      error: e.message,
      code: e.code ?? "EWAY_ERROR"
    });
    return;
  }
  next(err);
}

export async function listOrderEwayBillsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { listOrderEwayBills } = await import("../eway-bills/eway-bill.service");
    const data = await listOrderEwayBills(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    sendEwayServiceError(res, err, next);
  }
}

export async function reviewOrderEwayBill(req: Request, res: Response, next: NextFunction) {
  try {
    const source = String(req.query.sourceDocumentType || "");
    if (source !== "TAX_INVOICE" && source !== "DELIVERY_CHALLAN") {
      res.status(400).json({
        success: false,
        error: "sourceDocumentType must be TAX_INVOICE or DELIVERY_CHALLAN",
        code: "INVALID_SOURCE"
      });
      return;
    }
    const { buildEwayReviewPack } = await import("../eway-bills/eway-bill.service");
    const data = await buildEwayReviewPack(req.params.id, source);
    res.json({ success: true, data });
  } catch (err) {
    sendEwayServiceError(res, err, next);
  }
}

export async function prepareOrderEwayBill(req: Request, res: Response, next: NextFunction) {
  try {
    const { prepareEwayBill, serializeEwayBill } = await import("../eway-bills/eway-bill.service");
    const row = await prepareEwayBill(req.params.id, req.body, req.authUser?.id ?? null);
    res.status(201).json({
      success: true,
      data: serializeEwayBill(row),
      message:
        "Preparation saved. Generate the E-Way Bill on the government portal, then enter the issued EBN."
    });
  } catch (err) {
    sendEwayServiceError(res, err, next);
  }
}

export async function recordOrderEwayBillEbn(req: Request, res: Response, next: NextFunction) {
  try {
    const { recordEwayBillEbn, serializeEwayBill } = await import("../eway-bills/eway-bill.service");
    const ewayBillId =
      typeof req.params.ewayBillId === "string" && req.params.ewayBillId !== "new"
        ? req.params.ewayBillId
        : null;
    const row = await recordEwayBillEbn(
      req.params.id,
      ewayBillId,
      req.body,
      req.authUser?.id ?? null
    );
    res.status(ewayBillId ? 200 : 201).json({
      success: true,
      data: serializeEwayBill(row),
      message: "Government EBN recorded (manual). Sarveda did not generate this E-Way Bill."
    });
  } catch (err) {
    sendEwayServiceError(res, err, next);
  }
}

export async function updateOrderEwayTransport(req: Request, res: Response, next: NextFunction) {
  try {
    const { updateEwayTransport, serializeEwayBill } = await import("../eway-bills/eway-bill.service");
    const row = await updateEwayTransport(req.params.id, req.params.ewayBillId, req.body);
    res.json({ success: true, data: serializeEwayBill(row), message: "Transport details updated" });
  } catch (err) {
    sendEwayServiceError(res, err, next);
  }
}

export async function cancelOrderEwayBill(req: Request, res: Response, next: NextFunction) {
  try {
    const { markEwayCancelled, serializeEwayBill } = await import("../eway-bills/eway-bill.service");
    const row = await markEwayCancelled(req.params.id, req.params.ewayBillId, req.body?.notes);
    res.json({
      success: true,
      data: serializeEwayBill(row),
      message: "Local E-Way Bill record marked cancelled. Government portal cancel remains external."
    });
  } catch (err) {
    sendEwayServiceError(res, err, next);
  }
}

export async function markOrderEwayNotRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const { markEwayNotRequired, serializeEwayBill } = await import("../eway-bills/eway-bill.service");
    const row = await markEwayNotRequired(
      req.params.id,
      req.body?.notes,
      req.authUser?.id ?? null
    );
    res.status(201).json({
      success: true,
      data: serializeEwayBill(row),
      message: "Marked E-Way Bill not required"
    });
  } catch (err) {
    sendEwayServiceError(res, err, next);
  }
}

export async function getOrderEwayBill(req: Request, res: Response, next: NextFunction) {
  try {
    const { getEwayBill, serializeEwayBill } = await import("../eway-bills/eway-bill.service");
    const row = await getEwayBill(req.params.id, req.params.ewayBillId);
    res.json({ success: true, data: serializeEwayBill(row) });
  } catch (err) {
    sendEwayServiceError(res, err, next);
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
      notifyOrderEmail(id, "order_processing");
      void onOrderEnteredProcessing(order.id);
    }
    if (status === "SHIPPED" && prevStatus !== "SHIPPED" && prevStatus !== "DELIVERED") {
      notifyOrderEmail(id, "order_shipped");
    }
    if (status === "DELIVERED" && prevStatus !== "DELIVERED") {
      notifyOrderEmail(id, "order_delivered");
    }

    res.json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function refundOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const reason = (req.body as { reason?: string }).reason;
    const result = await initiateGatewayRefund(id, reason);
    res.json(result);
  } catch (err) {
    const code = (err as { code?: string }).code;
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (
      code === "DUPLICATE_REFUND" ||
      code === "AMOUNT_TOO_HIGH" ||
      code === "ALREADY_REFUNDED"
    ) {
      res.status(statusCode ?? 409).json({
        success: false,
        error: err instanceof Error ? err.message : "Refund conflict",
        code
      });
      return;
    }
    next(err);
  }
}

/** Explicit physical return / restock — independent of gateway monetary refund. */
export async function restockOrderInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = adminInventoryRestockBodySchema.parse(req.body);
    const adminUser = (req as Request & { authUser?: { id?: string } }).authUser;
    const { events, sourceId } = await adminApplyInventoryRestock({
      orderId: id,
      body,
      createdByUserId: adminUser?.id
    });
    res.json({
      success: true,
      data: { sourceId, events },
      message: `Recorded ${events.length} restock line(s). Sellable lines increment onHand once; accounting COGS reversal is a separate Phase 3D4 posting step.`
    });
  } catch (err) {
    next(err);
  }
}

export async function listOrderRestocks(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const events = await listOrderInventoryRestocks(id);
    res.json({ success: true, data: { events } });
  } catch (err) {
    next(err);
  }
}

export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const reason = (req.body as { reason?: string }).reason?.trim() || "Admin cancelled order";

    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { payments: { orderBy: { createdAt: "desc" } } }
    });
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    if (order.status === "PENDING_PAYMENT") {
      const changed = await cancelUnpaidOrderWithRelease(id, reason);
      res.json({
        success: true,
        message: changed
          ? "Unpaid order cancelled and stock released."
          : "Order was already cancelled or paid."
      });
      return;
    }

    const capturedPayment = order.payments.find((p) => p.status === "CAPTURED");
    if (capturedPayment) {
      res.status(400).json({
        success: false,
        error: "This order was paid online. Use Refund to Customer instead.",
        code: "USE_REFUND"
      });
      return;
    }

    const codPaid = order.payments.some((p) => p.provider === "COD");
    if (codPaid) {
      await handlePaidOrderStatusChange(id, "CANCELLED", reason);
      notifyOrderEmail(id, "order_cancelled");
      res.json({
        success: true,
        message: "COD order cancelled and stock restored. Arrange cash refund manually."
      });
      return;
    }

    await handlePaidOrderStatusChange(id, "CANCELLED", reason);
    notifyOrderEmail(id, "order_cancelled");
    res.json({ success: true, message: "Order cancelled." });
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
      },
      marketplaceListings: {
        include: {
          channel: {
            select: { id: true, code: true, displayName: true, isActive: true }
          }
        },
        orderBy: [{ channel: { displayName: "asc" } }]
      }
    }
  }
} satisfies Prisma.InventoryInclude;

type InventoryRowDb = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

function mapInventoryRow(
  inv: InventoryRowDb,
  auditMap: Map<string, ZohoItemAuditRow> | null,
  marketplaceStats?: Map<string, { recentMarketplaceSoldQty: number; recentMarketplaceReturnQty: number }>
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
  const marketStats = marketplaceStats?.get(inv.variantId) ?? {
    recentMarketplaceSoldQty: 0,
    recentMarketplaceReturnQty: 0
  };
  const marketplaceStockRisk =
    inv.onHand <= 0
      ? "out"
      : marketStats.recentMarketplaceSoldQty >= Math.max(1, available)
        ? "high"
        : marketStats.recentMarketplaceSoldQty >= Math.max(1, Math.floor(available / 2))
          ? "watch"
          : "ok";

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
    zohoSyncScenario: audit.scenario,
    recentMarketplaceSoldQty: marketStats.recentMarketplaceSoldQty,
    recentMarketplaceReturnQty: marketStats.recentMarketplaceReturnQty,
    marketplaceStockRisk,
    marketplaceListings: inv.variant.marketplaceListings.map((listing) => ({
      id: listing.id,
      channelId: listing.channelId,
      code: listing.channel.code,
      displayName: listing.channel.displayName,
      isChannelActive: listing.channel.isActive,
      listingId: listing.listingId,
      externalSku: listing.externalSku,
      sellerSku: listing.sellerSku,
      status: listing.status,
      isTracked: listing.isTracked,
      notes: listing.notes,
      lastSyncedAt: listing.lastSyncedAt?.toISOString() ?? null
    }))
  };
}

export async function inventoryXlSheetList(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = String(req.query.stock ?? "ALL").trim().toUpperCase();
    const stock =
      raw === "IN_STOCK" || raw === "LOW_STOCK" || raw === "OUT_OF_STOCK" || raw === "ALL"
        ? (raw as InventoryXlStockFilter)
        : "ALL";
    const data = await listInventoryXlSheetRows(stock);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function inventoryXlSheetSave(req: Request, res: Response, next: NextFunction) {
  try {
    const body = inventoryXlSheetSaveSchema.parse(req.body);
    const data = await saveInventoryXlSheetRows(body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function inventoryReservedSummary(_req: Request, res: Response, next: NextFunction) {
  try {
    const [summary, mismatches] = await Promise.all([
      getReservedStockSummary(),
      listReservedMismatches(50)
    ]);
    res.json({ success: true, data: { summary, mismatches } });
  } catch (err) {
    next(err);
  }
}

export async function inventoryReconcileReserved(req: Request, res: Response, next: NextFunction) {
  try {
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true" || req.body?.dryRun === true;
    const data = await reconcileInventoryReserved({ dryRun });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
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
    const zohoInventorySyncEnabled = isZohoInventorySyncEnabled();

    const emptyZohoSummary = {
      synced: 0,
      countMismatch: 0,
      zohoOnly: 0,
      sarvedaOnly: 0,
      outOfSync: 0
    };

    const zohoBundle = zohoInventorySyncEnabled
      ? await Promise.all([getZohoStockSyncMeta(), computeZohoSyncSummary(), listZohoOnlyItems()])
      : [
          { lastSyncAt: null as Date | null, skuSet: null, auditMap: null },
          emptyZohoSummary,
          [] as Awaited<ReturnType<typeof listZohoOnlyItems>>
        ] as const;

    const [{ lastSyncAt, skuSet: zohoSkuSet, auditMap }, syncSummary, zohoOnlyItems] = zohoBundle;

    const [total, productCount, rows] = await Promise.all([
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
      })
    ]);

    const variantIds = rows.map((row) => row.variantId);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    const [marketplaceOrderItems, marketplaceReturns] =
      variantIds.length === 0
        ? [[], []]
        : await Promise.all([
            prisma.marketplaceOrderItem.findMany({
              where: {
                variantId: { in: variantIds },
                marketplaceOrder: {
                  orderDate: { gte: since },
                  status: { not: "CANCELLED" }
                }
              },
              select: { variantId: true, quantity: true }
            }),
            prisma.marketplaceReturn.findMany({
              where: {
                marketplaceOrderItem: {
                  variantId: { in: variantIds }
                },
                marketplaceOrder: {
                  orderDate: { gte: since }
                }
              },
              select: {
                quantity: true,
                marketplaceOrderItem: { select: { variantId: true } }
              }
            })
          ]);
    const marketplaceStats = new Map<string, { recentMarketplaceSoldQty: number; recentMarketplaceReturnQty: number }>();
    for (const variantId of variantIds) {
      marketplaceStats.set(variantId, { recentMarketplaceSoldQty: 0, recentMarketplaceReturnQty: 0 });
    }
    for (const item of marketplaceOrderItems) {
      if (!item.variantId) continue;
      const cur = marketplaceStats.get(item.variantId);
      if (cur) cur.recentMarketplaceSoldQty += item.quantity;
    }
    for (const ret of marketplaceReturns) {
      const variantId = ret.marketplaceOrderItem?.variantId;
      if (!variantId) continue;
      const cur = marketplaceStats.get(variantId);
      if (cur) cur.recentMarketplaceReturnQty += ret.quantity;
    }

    const items = rows.map((inv) => mapInventoryRow(inv, auditMap, marketplaceStats));
    const reservedStock = await getReservedStockSummary();

    const totalPages = loadAll ? 1 : Math.max(1, Math.ceil(total / limit));
    res.json({
      success: true,
      data: {
        items,
        pagination: { page: loadAll ? 1 : page, limit, total, totalPages },
        meta: {
          zohoInventorySyncEnabled,
          lastZohoStockSyncAt: lastSyncAt,
          zohoSkuAuditAvailable: zohoInventorySyncEnabled && (auditMap !== null || zohoSkuSet !== null),
          productCount,
          zohoSyncSummary: syncSummary,
          zohoOnlyItems,
          reservedStock
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

    if (body.onHand !== undefined && row?.variant?.sku) {
      await mirrorStockToZohoForSkus([row.variant.sku], "admin_patch_inventory", { variantId });
    }

    if (body.onHand !== undefined && body.onHand > 0) {
      const { notifyStockSubscribersForVariant } = await import(
        "../stock-notifications/stockNotification.service"
      );
      void notifyStockSubscribersForVariant(variantId);
    }

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
    const touchedVariantIds = new Set<string>();

    for (const u of updates) {
      const data: { onHand?: number; lowStockThreshold?: number } = {};
      if (u.onHand !== undefined) data.onHand = u.onHand;
      if (u.lowStockThreshold !== undefined) data.lowStockThreshold = u.lowStockThreshold;
      const result = await prisma.inventory.updateMany({
        where: { variantId: u.variantId },
        data
      });
      updated += result.count;
      if (u.onHand !== undefined && result.count > 0) touchedVariantIds.add(u.variantId);
    }

    if (touchedVariantIds.size > 0) {
      const variants = await prisma.productVariant.findMany({
        where: { id: { in: Array.from(touchedVariantIds) } },
        select: { sku: true }
      });
      await mirrorStockToZohoForSkus(
        variants.map((v) => v.sku),
        "admin_bulk_patch_inventory",
        { updated }
      );
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
    const touchedSkus = new Set<string>();

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
      touchedSkus.add(sku);
    }

    if (touchedSkus.size > 0) {
      await mirrorStockToZohoForSkus(Array.from(touchedSkus), "admin_import_inventory_rows", {
        updated
      });
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

export async function triggerCartCleanup(_req: Request, res: Response, next: NextFunction) {
  try {
    const { runCartCleanupJob } = await import("../../jobs/cartCleanupJob");
    const data = await runCartCleanupJob();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
