import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import type { NextFunction, Request, Response } from "express";
import { OrderStatus, PaymentProvider, PaymentStatus, Role } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/db";
import { isSuperAdminRole, superAdminEmailSet } from "../../middleware/adminActivity";
import {
  addDaysInstant,
  startOfDayKolkata,
  startOfMonthKolkata
} from "../../utils/reporting-time";
import { listAdminSessions } from "../auth/admin-session";
import { logger } from "../../config/logger";

type DumpTopItem = {
  sku: string;
  productName: string;
  slug: string;
  unitsSold: number;
  revenueInr: number;
  revenueInPaise: number;
};

function loadWooDumpTopItems(): { topItems: DumpTopItem[]; units: number } {
  const candidates = [
    path.join(process.cwd(), "data", "woo-dump-top-items.json"),
    path.join(__dirname, "..", "..", "..", "data", "woo-dump-top-items.json")
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
        topItems?: DumpTopItem[];
        totals?: { units?: number };
      };
      const topItems = Array.isArray(raw.topItems) ? raw.topItems : [];
      return {
        topItems,
        units: raw.totals?.units ?? topItems.reduce((s, i) => s + (i.unitsSold || 0), 0)
      };
    } catch (err) {
      logger.warn("Failed reading woo dump top-items file", {
        file,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return { topItems: [], units: 0 };
}

const periodSchema = z.enum(["daily", "weekly", "monthly", "financial_year"]);
const reportTypeSchema = z.enum([
  "sales",
  "products",
  "customers",
  "vendors",
  "razorpay",
  "paypal",
  "stripe",
  "gateways"
]);

export type ReportPeriod = z.infer<typeof periodSchema>;
export type ReportType = z.infer<typeof reportTypeSchema>;

const REPORT_ORDER_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"];

const ANALYTICS_WOO_DELIVERED_WHERE = {
  deletedAt: null as Date | null,
  status: "DELIVERED" as OrderStatus,
  orderNumber: { startsWith: "WOO-" }
};

/** Indian financial year: 1 Apr → 31 Mar (Asia/Kolkata). */
export function resolveReportRange(period: ReportPeriod, now = new Date()): { from: Date; to: Date; label: string } {
  const todayStart = startOfDayKolkata(now);
  const to = addDaysInstant(todayStart, 1); // exclusive end = tomorrow 00:00 IST

  if (period === "daily") {
    return { from: todayStart, to, label: "daily" };
  }
  if (period === "weekly") {
    return { from: addDaysInstant(todayStart, -6), to, label: "weekly" };
  }
  if (period === "monthly") {
    return { from: startOfMonthKolkata(now), to, label: "monthly" };
  }

  // Financial year
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [yStr, mStr] = ymd.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const fyStartYear = m >= 4 ? y : y - 1;
  const from = new Date(`${fyStartYear}-04-01T00:00:00+05:30`);
  return { from, to, label: `fy-${fyStartYear}-${String(fyStartYear + 1).slice(2)}` };
}

function paiseToInr(paise: number): number {
  return Math.round(paise) / 100;
}

async function buildWorkbookBuffer(
  sheetName: string,
  columns: Array<{ header: string; key: string; width?: number }>,
  rows: Record<string, unknown>[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sarveda Admin";
  wb.created = new Date();
  const sheet = wb.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function salesRows(from: Date, to: Date) {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      placedAt: { gte: from, lt: to },
      status: { in: REPORT_ORDER_STATUSES }
    },
    orderBy: { placedAt: "desc" },
    take: 8000,
    select: {
      orderNumber: true,
      email: true,
      phone: true,
      status: true,
      paymentStatus: true,
      currency: true,
      subtotalInPaise: true,
      discountInPaise: true,
      shippingInPaise: true,
      taxInPaise: true,
      grandTotalInPaise: true,
      reportingTotalInInrPaise: true,
      couponCode: true,
      placedAt: true,
      createdAt: true,
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { provider: true, providerPaymentId: true, status: true }
      }
    }
  });

  return orders.map((o) => ({
    orderNumber: o.orderNumber,
    email: o.email,
    phone: o.phone ?? "",
    status: o.status,
    paymentStatus: o.paymentStatus,
    gateway: o.payments[0]?.provider ?? "",
    gatewayPaymentId: o.payments[0]?.providerPaymentId ?? "",
    currency: o.currency,
    subtotalInr: paiseToInr(o.subtotalInPaise),
    discountInr: paiseToInr(o.discountInPaise),
    shippingInr: paiseToInr(o.shippingInPaise),
    taxInr: paiseToInr(o.taxInPaise),
    grandTotalInr: paiseToInr(o.grandTotalInPaise),
    reportingInr: paiseToInr(o.reportingTotalInInrPaise ?? o.grandTotalInPaise),
    couponCode: o.couponCode ?? "",
    placedAt: (o.placedAt ?? o.createdAt).toISOString()
  }));
}

async function productRows(from: Date, to: Date) {
  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        deletedAt: null,
        placedAt: { gte: from, lt: to },
        status: { in: REPORT_ORDER_STATUSES }
      }
    },
    take: 20000,
    select: {
      skuSnapshot: true,
      nameSnapshot: true,
      qtyOrdered: true,
      unitPriceInPaise: true,
      lineTotalInPaise: true,
      order: { select: { orderNumber: true, placedAt: true, createdAt: true } },
      variant: {
        select: {
          sku: true,
          productRel: { select: { name: true, slug: true } }
        }
      }
    }
  });

  type Agg = {
    sku: string;
    productName: string;
    slug: string;
    unitsSold: number;
    revenueInr: number;
  };
  const map = new Map<string, Agg>();
  for (const it of items) {
    const sku = it.variant?.sku || it.skuSnapshot;
    const cur = map.get(sku) ?? {
      sku,
      productName: it.variant?.productRel.name || it.nameSnapshot,
      slug: it.variant?.productRel.slug ?? "",
      unitsSold: 0,
      revenueInr: 0
    };
    cur.unitsSold += it.qtyOrdered;
    cur.revenueInr += paiseToInr(it.lineTotalInPaise);
    map.set(sku, cur);
  }
  return [...map.values()].sort((a, b) => b.unitsSold - a.unitsSold);
}

async function customerRows(from: Date, to: Date) {
  const customers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: Role.CUSTOMER,
      OR: [
        { createdAt: { gte: from, lt: to } },
        {
          orders: {
            some: {
              deletedAt: null,
              placedAt: { gte: from, lt: to },
              status: { in: REPORT_ORDER_STATUSES }
            }
          }
        }
      ]
    },
    take: 8000,
    orderBy: { createdAt: "desc" },
    select: {
      email: true,
      name: true,
      phone: true,
      createdAt: true,
      orders: {
        where: {
          deletedAt: null,
          status: { in: REPORT_ORDER_STATUSES }
        },
        select: {
          reportingTotalInInrPaise: true,
          grandTotalInPaise: true,
          placedAt: true,
          createdAt: true
        }
      }
    }
  });

  return customers.map((c) => {
    const inPeriod = c.orders.filter((o) => {
      const t = o.placedAt ?? o.createdAt;
      return t >= from && t < to;
    });
    const periodRevenue = inPeriod.reduce(
      (s, o) => s + (o.reportingTotalInInrPaise ?? o.grandTotalInPaise),
      0
    );
    const lifetime = c.orders.reduce(
      (s, o) => s + (o.reportingTotalInInrPaise ?? o.grandTotalInPaise),
      0
    );
    return {
      name: c.name ?? "",
      email: c.email,
      phone: c.phone ?? "",
      registeredAt: c.createdAt.toISOString(),
      ordersInPeriod: inPeriod.length,
      revenueInPeriodInr: paiseToInr(periodRevenue),
      lifetimeOrders: c.orders.length,
      lifetimeRevenueInr: paiseToInr(lifetime)
    };
  });
}

/** Vendor = pickup / warehouse locations with units & revenue in period. */
async function vendorRows(from: Date, to: Date) {
  const locations = await prisma.pickupLocation.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      shiprocketPickupName: true,
      city: true,
      state: true,
      isActive: true,
      isPrimary: true
    }
  });

  const items = await prisma.orderItem.findMany({
    where: {
      pickupLocationId: { not: null },
      order: {
        deletedAt: null,
        placedAt: { gte: from, lt: to },
        status: { in: REPORT_ORDER_STATUSES }
      }
    },
    select: {
      pickupLocationId: true,
      qtyOrdered: true,
      lineTotalInPaise: true
    }
  });

  const byLoc = new Map<string, { units: number; revenue: number }>();
  for (const it of items) {
    if (!it.pickupLocationId) continue;
    const cur = byLoc.get(it.pickupLocationId) ?? { units: 0, revenue: 0 };
    cur.units += it.qtyOrdered;
    cur.revenue += it.lineTotalInPaise;
    byLoc.set(it.pickupLocationId, cur);
  }

  return locations.map((loc) => {
    const stats = byLoc.get(loc.id) ?? { units: 0, revenue: 0 };
    return {
      warehouse: loc.label,
      shiprocketName: loc.shiprocketPickupName,
      city: loc.city ?? "",
      state: loc.state ?? "",
      isActive: loc.isActive ? "yes" : "no",
      isPrimary: loc.isPrimary ? "yes" : "no",
      unitsDispatched: stats.units,
      revenueInr: paiseToInr(stats.revenue)
    };
  });
}

async function gatewayRows(from: Date, to: Date, provider?: PaymentProvider) {
  const payments = await prisma.payment.findMany({
    where: {
      createdAt: { gte: from, lt: to },
      ...(provider ? { provider } : { provider: { in: ["RAZORPAY", "STRIPE", "PAYPAL"] } }),
      status: { in: [PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED] }
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
    select: {
      provider: true,
      providerOrderId: true,
      providerPaymentId: true,
      amountInPaise: true,
      currency: true,
      status: true,
      gatewayFeeInPaise: true,
      settledInPaise: true,
      settlementDate: true,
      refundedInPaise: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          email: true,
          reportingTotalInInrPaise: true
        }
      }
    }
  });

  return payments.map((p) => ({
    gateway: p.provider,
    orderNumber: p.order.orderNumber,
    email: p.order.email,
    providerOrderId: p.providerOrderId ?? "",
    providerPaymentId: p.providerPaymentId ?? "",
    amount: paiseToInr(p.amountInPaise),
    currency: p.currency,
    status: p.status,
    gatewayFee: paiseToInr(p.gatewayFeeInPaise),
    settled: paiseToInr(p.settledInPaise),
    settlementDate: p.settlementDate?.toISOString().slice(0, 10) ?? "",
    refunded: paiseToInr(p.refundedInPaise),
    createdAt: p.createdAt.toISOString(),
    reportingInr: paiseToInr(p.order.reportingTotalInInrPaise ?? p.amountInPaise)
  }));
}

export async function adminReportAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const dumpTop = loadWooDumpTopItems();

    const orders = await prisma.order.findMany({
      where: ANALYTICS_WOO_DELIVERED_WHERE,
      orderBy: { placedAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        email: true,
        phone: true,
        status: true,
        currency: true,
        grandTotalInPaise: true,
        reportingTotalInInrPaise: true,
        placedAt: true,
        createdAt: true,
        addresses: {
          select: {
            type: true,
            fullName: true,
            city: true,
            state: true,
            country: true
          }
        }
      }
    });

    const topItems = dumpTop.topItems.map((r) => ({
      sku: r.sku,
      productName: r.productName,
      slug: r.slug || "",
      unitsSold: r.unitsSold,
      revenueInPaise: r.revenueInPaise,
      revenueInr: r.revenueInr
    }));

    const repeatCustomersMap = new Map<
      string,
      {
        email: string;
        name: string;
        city: string;
        orderCount: number;
        totalSpendInPaise: number;
        lastOrderedAt: string;
      }
    >();
    const topPlacesMap = new Map<
      string,
      { city: string; state: string; country: string; orderCount: number; totalInPaise: number }
    >();

    for (const order of orders) {
      const shipping =
        order.addresses.find((a) => a.type === "SHIPPING") ??
        order.addresses.find((a) => a.type === "BILLING") ??
        null;
      const totalInPaise = order.reportingTotalInInrPaise ?? order.grandTotalInPaise;
      const email = order.email.trim().toLowerCase();
      const customer = repeatCustomersMap.get(email) ?? {
        email,
        name: shipping?.fullName?.trim() || email,
        city: shipping?.city?.trim() || "",
        orderCount: 0,
        totalSpendInPaise: 0,
        lastOrderedAt: (order.placedAt ?? order.createdAt).toISOString()
      };
      customer.orderCount += 1;
      customer.totalSpendInPaise += totalInPaise;
      customer.lastOrderedAt = (order.placedAt ?? order.createdAt).toISOString();
      if (!customer.name && shipping?.fullName?.trim()) customer.name = shipping.fullName.trim();
      if (!customer.city && shipping?.city?.trim()) customer.city = shipping.city.trim();
      repeatCustomersMap.set(email, customer);

      const city = shipping?.city?.trim() || "Unknown";
      const state = shipping?.state?.trim() || "";
      const country = shipping?.country?.trim() || "";
      const key = `${city}|${state}|${country}`.toLowerCase();
      const place = topPlacesMap.get(key) ?? {
        city,
        state,
        country,
        orderCount: 0,
        totalInPaise: 0
      };
      place.orderCount += 1;
      place.totalInPaise += totalInPaise;
      topPlacesMap.set(key, place);
    }

    const repeatCustomers = [...repeatCustomersMap.values()]
      .filter((c) => c.orderCount > 1)
      .sort((a, b) => b.orderCount - a.orderCount || b.totalSpendInPaise - a.totalSpendInPaise)
      .slice(0, 10)
      .map((c) => ({ ...c, totalSpendInr: paiseToInr(c.totalSpendInPaise) }));

    const topPlaces = [...topPlacesMap.values()]
      .sort((a, b) => b.orderCount - a.orderCount || b.totalInPaise - a.totalInPaise)
      .slice(0, 10)
      .map((p) => ({ ...p, totalInr: paiseToInr(p.totalInPaise) }));

    const highestOrders = orders
      .map((o) => {
        const shipping =
          o.addresses.find((a) => a.type === "SHIPPING") ??
          o.addresses.find((a) => a.type === "BILLING") ??
          null;
        const totalInPaise = o.reportingTotalInInrPaise ?? o.grandTotalInPaise;
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          email: o.email,
          customerName: shipping?.fullName?.trim() || o.email,
          city: shipping?.city?.trim() || "",
          status: o.status,
          placedAt: (o.placedAt ?? o.createdAt).toISOString(),
          totalInPaise,
          totalInr: paiseToInr(totalInPaise)
        };
      })
      .sort((a, b) => b.totalInPaise - a.totalInPaise)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        label: "woo-dump-top-items+db-delivered-orders",
        totals: {
          orders: orders.length,
          units: dumpTop.units
        },
        topItemsSource: "woo-dump",
        topItems,
        repeatCustomers,
        topPlaces,
        highestOrders
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function exportAdminReport(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z
      .object({
        type: reportTypeSchema,
        period: periodSchema
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "type and period are required",
        code: "VALIDATION_ERROR"
      });
      return;
    }

    const { type, period } = parsed.data;

    if (type === "customers") {
      const role = req.authUser?.role;
      const email = req.authUser?.email?.toLowerCase();
      const allowed =
        isSuperAdminRole(role) || (email != null && superAdminEmailSet().has(email));
      if (!allowed) {
        res.status(403).json({
          success: false,
          error: "Only super admin can download customer data",
          code: "FORBIDDEN"
        });
        return;
      }
    }

    const { from, to, label } = resolveReportRange(period);
    let buffer: Buffer;
    let filename: string;

    if (type === "sales") {
      const rows = await salesRows(from, to);
      buffer = await buildWorkbookBuffer(
        "Sales",
        [
          { header: "Order", key: "orderNumber", width: 18 },
          { header: "Email", key: "email", width: 28 },
          { header: "Phone", key: "phone", width: 14 },
          { header: "Status", key: "status", width: 14 },
          { header: "Payment status", key: "paymentStatus", width: 14 },
          { header: "Gateway", key: "gateway", width: 12 },
          { header: "Gateway payment ID", key: "gatewayPaymentId", width: 24 },
          { header: "Currency", key: "currency", width: 10 },
          { header: "Subtotal (INR)", key: "subtotalInr", width: 14 },
          { header: "Discount (INR)", key: "discountInr", width: 14 },
          { header: "Shipping (INR)", key: "shippingInr", width: 14 },
          { header: "Tax (INR)", key: "taxInr", width: 12 },
          { header: "Grand total (INR)", key: "grandTotalInr", width: 16 },
          { header: "Reporting INR", key: "reportingInr", width: 14 },
          { header: "Coupon", key: "couponCode", width: 12 },
          { header: "Placed at", key: "placedAt", width: 22 }
        ],
        rows
      );
      filename = `sarveda-sales-${label}.xlsx`;
    } else if (type === "products") {
      const rows = await productRows(from, to);
      buffer = await buildWorkbookBuffer(
        "Products",
        [
          { header: "SKU", key: "sku", width: 18 },
          { header: "Product", key: "productName", width: 36 },
          { header: "Slug", key: "slug", width: 28 },
          { header: "Units sold", key: "unitsSold", width: 12 },
          { header: "Revenue (INR)", key: "revenueInr", width: 14 }
        ],
        rows
      );
      filename = `sarveda-products-${label}.xlsx`;
    } else if (type === "customers") {
      const rows = await customerRows(from, to);
      buffer = await buildWorkbookBuffer(
        "Customers",
        [
          { header: "Name", key: "name", width: 22 },
          { header: "Email", key: "email", width: 28 },
          { header: "Phone", key: "phone", width: 14 },
          { header: "Registered", key: "registeredAt", width: 22 },
          { header: "Orders (period)", key: "ordersInPeriod", width: 14 },
          { header: "Revenue period (INR)", key: "revenueInPeriodInr", width: 18 },
          { header: "Lifetime orders", key: "lifetimeOrders", width: 14 },
          { header: "Lifetime revenue (INR)", key: "lifetimeRevenueInr", width: 18 }
        ],
        rows
      );
      filename = `sarveda-customers-${label}.xlsx`;
    } else if (type === "vendors") {
      const rows = await vendorRows(from, to);
      buffer = await buildWorkbookBuffer(
        "Vendors",
        [
          { header: "Warehouse / vendor", key: "warehouse", width: 28 },
          { header: "Shiprocket name", key: "shiprocketName", width: 24 },
          { header: "City", key: "city", width: 14 },
          { header: "State", key: "state", width: 14 },
          { header: "Active", key: "isActive", width: 10 },
          { header: "Primary", key: "isPrimary", width: 10 },
          { header: "Units dispatched", key: "unitsDispatched", width: 16 },
          { header: "Revenue (INR)", key: "revenueInr", width: 14 }
        ],
        rows
      );
      filename = `sarveda-vendors-${label}.xlsx`;
    } else {
      const providerMap: Record<string, PaymentProvider | undefined> = {
        razorpay: "RAZORPAY",
        paypal: "PAYPAL",
        stripe: "STRIPE",
        gateways: undefined
      };
      const rows = await gatewayRows(from, to, providerMap[type]);
      buffer = await buildWorkbookBuffer(
        "Gateway revenue",
        [
          { header: "Gateway", key: "gateway", width: 12 },
          { header: "Order", key: "orderNumber", width: 18 },
          { header: "Email", key: "email", width: 26 },
          { header: "Provider order ID", key: "providerOrderId", width: 22 },
          { header: "Provider payment ID", key: "providerPaymentId", width: 24 },
          { header: "Amount", key: "amount", width: 12 },
          { header: "Currency", key: "currency", width: 10 },
          { header: "Status", key: "status", width: 16 },
          { header: "Gateway fee", key: "gatewayFee", width: 12 },
          { header: "Settled", key: "settled", width: 12 },
          { header: "Settlement date", key: "settlementDate", width: 14 },
          { header: "Refunded", key: "refunded", width: 12 },
          { header: "Created", key: "createdAt", width: 22 },
          { header: "Reporting INR", key: "reportingInr", width: 14 }
        ],
        rows
      );
      filename = `sarveda-${type}-${label}.xlsx`;
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function adminMeSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true }
    });
    if (!user) {
      res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    const sessions = await listAdminSessions(userId, 50);
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        sessions
      }
    });
  } catch (err) {
    next(err);
  }
}
