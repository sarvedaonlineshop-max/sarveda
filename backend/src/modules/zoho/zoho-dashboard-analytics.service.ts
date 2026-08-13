/**
 * Dashboard analytics sourced from Zoho Books historical invoices table.
 * Excludes test website orders (invoice / ecom ids starting with SRV-).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";
import {
  type AnalyticsQuery,
  buildCustomersTips,
  buildOrdersTips,
  buildPlacesTips,
  buildProductsTips,
  buildRefundsTips,
  buildReturnsTips,
  type ProductAgg,
} from "../admin/woo-commerce-analytics";
import { normalizeZohoBillingLocation } from "./zoho-location";
import { reportingInrPaiseFromMinor } from "./zoho-historical-invoices.service";

const EXCLUDED_STATUSES = ["void", "draft"];

/** Live Sarveda test orders synced to Zoho with SRV- prefix. */
const TEST_ORDER_FILTER: Prisma.ZohoHistoricalInvoiceWhereInput = {
  NOT: {
    OR: [
      { invoiceNumber: { startsWith: "srv-", mode: "insensitive" } },
      { ecomOrderId: { startsWith: "srv-", mode: "insensitive" } },
      { salesOrderNumber: { startsWith: "srv-", mode: "insensitive" } },
      { ecomInvoiceNo: { startsWith: "srv-", mode: "insensitive" } },
    ],
  },
};

type LoadedInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  status: string;
  email: string | null;
  customerName: string | null;
  currency: string;
  totalInMinor: number;
  reportingTotalInInrPaise: number;
  billingCity: string | null;
  billingState: string | null;
  billingCountry: string | null;
  notes: string | null;
  lines: Array<{
    itemName: string | null;
    sku: string | null;
    quantity: number;
    lineTotalInMinor: number;
  }>;
};

function parseDay(s?: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function mapZohoStatus(status: string): "PAID" | "CANCELLED" | "REFUNDED" | "DRAFT" {
  const s = (status || "").toLowerCase();
  if (s.includes("void") || s.includes("cancel")) return "CANCELLED";
  if (s.includes("refund")) return "REFUNDED";
  if (s.includes("draft")) return "DRAFT";
  return "PAID";
}

function parseItemName(itemName: string | null, sku: string | null): string {
  const raw = (itemName || "").trim();
  if (!raw) return sku?.trim() || "Unnamed product";
  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  return parts[0] || raw;
}

function lineRevenueInr(currency: string, lineTotalInMinor: number): number {
  return reportingInrPaiseFromMinor(currency, lineTotalInMinor) / 100;
}

function orderTotalInr(inv: LoadedInvoice): number {
  return inv.reportingTotalInInrPaise / 100;
}

function aggregateProducts(
  invoices: LoadedInvoice[],
  onlyPaid = true
): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const inv of invoices) {
    const mapped = mapZohoStatus(inv.status);
    if (onlyPaid && mapped !== "PAID") continue;
    for (const line of inv.lines) {
      const qty = Number(line.quantity) || 0;
      if (qty <= 0) continue;
      const productName = parseItemName(line.itemName, line.sku);
      const sku = line.sku?.trim() || "unknown";
      const key = `${sku}|${productName}`;
      const rev = lineRevenueInr(inv.currency, line.lineTotalInMinor);
      const cur = map.get(key) ?? {
        sku,
        productName,
        unitsSold: 0,
        revenueInr: 0,
        revenueInPaise: 0,
        orderCount: 0,
      };
      cur.unitsSold += qty;
      cur.revenueInr += rev;
      cur.orderCount += 1;
      map.set(key, cur);
    }
  }
  return [...map.values()].map((r) => ({
    ...r,
    unitsSold: Math.round(r.unitsSold),
    revenueInr: Math.round(r.revenueInr * 100) / 100,
    revenueInPaise: Math.round(r.revenueInr * 100),
  }));
}

async function resolveDateRange(from?: string, to?: string) {
  const bounds = await prisma.zohoHistoricalInvoice.aggregate({
    where: TEST_ORDER_FILTER,
    _min: { invoiceDate: true },
    _max: { invoiceDate: true },
  });
  const allTimeFrom = bounds._min.invoiceDate
    ? dayKey(bounds._min.invoiceDate)
    : "";
  const allTimeTo = bounds._max.invoiceDate ? dayKey(bounds._max.invoiceDate) : "";
  const fromDate = parseDay(from) ?? (allTimeFrom ? parseDay(allTimeFrom)! : new Date("2024-01-01"));
  const toRaw = parseDay(to) ?? (allTimeTo ? parseDay(allTimeTo)! : new Date());
  const toDate = new Date(toRaw);
  toDate.setUTCHours(23, 59, 59, 999);
  return {
    from: dayKey(fromDate),
    to: dayKey(toRaw),
    fromDate,
    toDate,
    availableRange: { minDate: allTimeFrom, maxDate: allTimeTo },
  };
}

async function loadInvoices(fromDate: Date, toDate: Date): Promise<LoadedInvoice[]> {
  return prisma.zohoHistoricalInvoice.findMany({
    where: {
      invoiceDate: { gte: fromDate, lte: toDate },
      status: { notIn: EXCLUDED_STATUSES },
      ...TEST_ORDER_FILTER,
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      status: true,
      email: true,
      customerName: true,
      currency: true,
      totalInMinor: true,
      reportingTotalInInrPaise: true,
      billingCity: true,
      billingState: true,
      billingCountry: true,
      notes: true,
      lines: {
        select: {
          itemName: true,
          sku: true,
          quantity: true,
          lineTotalInMinor: true,
        },
      },
    },
    orderBy: { invoiceDate: "asc" },
  });
}

async function countNewCustomers(fromDate: Date, toDate: Date): Promise<number> {
  const rows = await prisma.zohoHistoricalInvoice.groupBy({
    by: ["email"],
    where: {
      status: { notIn: EXCLUDED_STATUSES },
      email: { not: null },
      ...TEST_ORDER_FILTER,
    },
    _min: { invoiceDate: true },
  });
  return rows.filter((r) => {
    const first = r._min.invoiceDate;
    return first && first >= fromDate && first <= toDate;
  }).length;
}

export async function buildZohoDashboardAnalytics(query: AnalyticsQuery) {
  const range = await resolveDateRange(query.from, query.to);
  const { from, to, fromDate, toDate, availableRange } = range;
  const tab = query.tab || "products";

  const invoices = await loadInvoices(fromDate, toDate);
  const paid = invoices.filter((i) => mapZohoStatus(i.status) === "PAID");
  const refunded = invoices.filter((i) => {
    const s = mapZohoStatus(i.status);
    return s === "REFUNDED" || s === "CANCELLED";
  });

  const productAggs = aggregateProducts(invoices, true);
  const mostSold = [...productAggs]
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenueInr - a.revenueInr)
    .slice(0, 10);
  const leastSold = [...productAggs]
    .filter((p) => p.unitsSold >= 1)
    .sort((a, b) => a.unitsSold - b.unitsSold || a.revenueInr - b.revenueInr)
    .slice(0, 10);
  const purchaseOrderNeeded = [...productAggs]
    .filter((p) => p.unitsSold >= 5)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 50);
  const dropCandidates = [...productAggs]
    .filter((p) => p.unitsSold >= 1 && p.unitsSold <= 2)
    .sort((a, b) => a.unitsSold - b.unitsSold || a.productName.localeCompare(b.productName))
    .slice(0, 50);

  const byStatus: Record<string, number> = {};
  for (const inv of invoices) {
    const key = mapZohoStatus(inv.status);
    byStatus[key] = (byStatus[key] || 0) + 1;
  }

  const highestOrders = [...paid]
    .sort((a, b) => orderTotalInr(b) - orderTotalInr(a))
    .slice(0, 10)
    .map((o) => {
      const loc = normalizeZohoBillingLocation(o.billingCity, o.billingState);
      return {
        orderNumber: o.invoiceNumber,
        email: o.email || "",
        customerName: o.customerName || o.email || o.invoiceNumber,
        city: loc.city || "Unknown",
        status: mapZohoStatus(o.status),
        placedAt: dayKey(o.invoiceDate),
        totalInr: Math.round(orderTotalInr(o) * 100) / 100,
        totalInPaise: o.reportingTotalInInrPaise,
      };
    });

  const placesMap = new Map<
    string,
    { city: string; state: string; country: string; orderCount: number; totalInr: number }
  >();
  for (const o of paid) {
    const loc = normalizeZohoBillingLocation(o.billingCity, o.billingState);
    const country = (o.billingCountry || "").trim();
    const city = loc.city || "Unknown";
    const state = loc.state || "";
    const key = `${city}|${state}|${country}`.toLowerCase();
    const total = orderTotalInr(o);
    const cur = placesMap.get(key) ?? {
      city,
      state,
      country,
      orderCount: 0,
      totalInr: 0,
    };
    cur.orderCount += 1;
    cur.totalInr += total;
    placesMap.set(key, cur);
  }
  const topPlaces = [...placesMap.values()]
    .sort((a, b) => b.orderCount - a.orderCount || b.totalInr - a.totalInr)
    .slice(0, 10)
    .map((p) => ({
      ...p,
      totalInr: Math.round(p.totalInr * 100) / 100,
      totalInPaise: Math.round(p.totalInr * 100),
    }));

  const custMap = new Map<
    string,
    {
      email: string;
      name: string;
      city: string;
      orderCount: number;
      totalSpendInr: number;
      lastOrderedAt: string;
      lastActive: string;
      registered: string;
    }
  >();
  for (const o of paid) {
    const email = (o.email || o.customerName || `invoice-${o.invoiceNumber}`).trim();
    const loc = normalizeZohoBillingLocation(o.billingCity, o.billingState);
    const date = dayKey(o.invoiceDate);
    const total = orderTotalInr(o);
    const cur = custMap.get(email) ?? {
      email,
      name: o.customerName || email,
      city: loc.city || "",
      orderCount: 0,
      totalSpendInr: 0,
      lastOrderedAt: date,
      lastActive: date,
      registered: date,
    };
    cur.orderCount += 1;
    cur.totalSpendInr += total;
    if (date > cur.lastOrderedAt) {
      cur.lastOrderedAt = date;
      cur.lastActive = date;
    }
    if (date < cur.registered) cur.registered = date;
    if (!cur.name && o.customerName) cur.name = o.customerName;
    if (!cur.city && loc.city) cur.city = loc.city;
    custMap.set(email, cur);
  }
  const repeatCustomers = [...custMap.values()]
    .filter((c) => c.orderCount > 1)
    .sort((a, b) => b.orderCount - a.orderCount || b.totalSpendInr - a.totalSpendInr)
    .slice(0, 10)
    .map((c) => ({
      email: c.email,
      name: c.name,
      city: c.city,
      orderCount: c.orderCount,
      totalSpendInr: Math.round(c.totalSpendInr * 100) / 100,
      totalSpendInPaise: Math.round(c.totalSpendInr * 100),
      lastOrderedAt: c.lastOrderedAt,
    }));

  const orderTrendMap = new Map<string, { month: string; orders: number; revenueInr: number }>();
  for (const o of paid) {
    const m = monthKey(dayKey(o.invoiceDate));
    const total = orderTotalInr(o);
    const cur = orderTrendMap.get(m) ?? { month: m, orders: 0, revenueInr: 0 };
    cur.orders += 1;
    cur.revenueInr += total;
    orderTrendMap.set(m, cur);
  }
  const orderTrend = [...orderTrendMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, revenueInr: Math.round(r.revenueInr * 100) / 100 }));

  const returnsInRange = refunded.flatMap((inv) =>
    inv.lines.map((line) => ({
      inv,
      line,
      date: dayKey(inv.invoiceDate),
      email: inv.email || "",
      customerName: inv.customerName || inv.email || "",
      qty: Number(line.quantity) || 0,
      name: parseItemName(line.itemName, line.sku),
      sku: line.sku?.trim() || "unknown",
      lineTotal: lineRevenueInr(inv.currency, line.lineTotalInMinor),
    }))
  );
  const returnItemAggs = aggregateProducts(
    refunded.map((inv) => ({ ...inv, status: "refunded" })),
    false
  ).sort((a, b) => b.unitsSold - a.unitsSold);

  const returnsByCustomerMap = new Map<
    string,
    { email: string; customerName: string; units: number; lines: number }
  >();
  for (const r of returnsInRange) {
    const email = r.email || "unknown";
    const cur = returnsByCustomerMap.get(email) ?? {
      email,
      customerName: r.customerName || email,
      units: 0,
      lines: 0,
    };
    cur.units += r.qty;
    cur.lines += 1;
    returnsByCustomerMap.set(email, cur);
  }
  const returnsByCustomer = [...returnsByCustomerMap.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, 20)
    .map((r) => ({ ...r, units: Math.round(r.units) }));

  const returnTrendMap = new Map<string, { month: string; units: number; lines: number }>();
  for (const r of returnsInRange) {
    const m = monthKey(r.date || from);
    const cur = returnTrendMap.get(m) ?? { month: m, units: 0, lines: 0 };
    cur.units += r.qty;
    cur.lines += 1;
    returnTrendMap.set(m, cur);
  }
  const returnTrend = [...returnTrendMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, units: Math.round(r.units) }));

  const returnItemTrend: Array<{ productName: string; sku: string; months: Array<{ month: string; units: number }> }> =
    [];
  const topReturnNames = returnItemAggs.slice(0, 5);
  for (const p of topReturnNames) {
    const months = new Map<string, number>();
    for (const r of returnsInRange) {
      if (r.name !== p.productName) continue;
      const m = monthKey(r.date || from);
      months.set(m, (months.get(m) || 0) + r.qty);
    }
    returnItemTrend.push({
      productName: p.productName,
      sku: p.sku,
      months: [...months.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, units]) => ({ month, units: Math.round(units) })),
    });
  }

  const refundsInRange = refunded.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    date: dayKey(inv.invoiceDate),
    amount: orderTotalInr(inv),
    reason: (inv.notes || inv.status || "unspecified").trim() || "unspecified",
    email: inv.email || "",
    customerName: inv.customerName || inv.email || "",
  }));

  const refundTrendMap = new Map<string, { month: string; count: number; amountInr: number }>();
  for (const r of refundsInRange) {
    const m = monthKey(r.date);
    const cur = refundTrendMap.get(m) ?? { month: m, count: 0, amountInr: 0 };
    cur.count += 1;
    cur.amountInr += r.amount;
    refundTrendMap.set(m, cur);
  }
  const refundTrend = [...refundTrendMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, amountInr: Math.round(r.amountInr * 100) / 100 }));

  const refundsByCustomerMap = new Map<
    string,
    { email: string; customerName: string; count: number; amountInr: number }
  >();
  for (const r of refundsInRange) {
    const email = r.email || `invoice-${r.invoiceNumber}`;
    const cur = refundsByCustomerMap.get(email) ?? {
      email,
      customerName: r.customerName || email,
      count: 0,
      amountInr: 0,
    };
    cur.count += 1;
    cur.amountInr += r.amount;
    refundsByCustomerMap.set(email, cur);
  }
  const refundsByCustomer = [...refundsByCustomerMap.values()]
    .sort((a, b) => b.amountInr - a.amountInr)
    .slice(0, 20)
    .map((r) => ({ ...r, amountInr: Math.round(r.amountInr * 100) / 100 }));

  const refundReasonsMap = new Map<string, number>();
  for (const r of refundsInRange) {
    const reason = r.reason;
    refundReasonsMap.set(reason, (refundReasonsMap.get(reason) || 0) + 1);
  }
  const refundReasons = [...refundReasonsMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const mostVisited = [...custMap.values()]
    .sort((a, b) => b.lastActive.localeCompare(a.lastActive))
    .slice(0, 20)
    .map((c) => ({
      email: c.email,
      name: c.name,
      lastActive: c.lastActive,
      city: c.city,
      registered: c.registered,
    }));

  const mostBought = [...custMap.values()]
    .sort((a, b) => b.orderCount - a.orderCount || b.totalSpendInr - a.totalSpendInr)
    .slice(0, 20)
    .map((c) => ({
      email: c.email,
      name: c.name,
      city: c.city,
      orderCount: c.orderCount,
      totalSpendInr: Math.round(c.totalSpendInr * 100) / 100,
      lastOrderedAt: c.lastOrderedAt,
    }));

  const newCustomers = await countNewCustomers(fromDate, toDate);

  const revenueInr = paid.reduce((s, o) => s + orderTotalInr(o), 0);
  const units = paid.reduce(
    (s, inv) => s + inv.lines.reduce((ls, line) => ls + (Number(line.quantity) || 0), 0),
    0
  );

  const kpis = {
    orders: paid.length,
    revenueInr: Math.round(revenueInr * 100) / 100,
    aovInr: paid.length > 0 ? Math.round((revenueInr / paid.length) * 100) / 100 : 0,
    units: Math.round(units),
    refundAmountInr: Math.round(refundsInRange.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    refundCount: refundsInRange.length,
    returnUnits: Math.round(returnsInRange.reduce((s, r) => s + r.qty, 0)),
    repeatCustomerCount: [...custMap.values()].filter((c) => c.orderCount > 1).length,
    uniqueCustomers: custMap.size,
    newCustomers,
  };

  const meta = {
    source: "zoho-historical",
    dumpFile: "zoho_historical_invoices",
    generatedAt: new Date().toISOString(),
    availableRange,
    appliedRange: { from, to },
    note: "Zoho Books historical invoices. Test SRV- website orders excluded.",
  };

  const overview = {
    kpis,
    orderTrend,
    tips: [] as string[],
  };

  if (tab === "orders") {
    overview.tips = buildOrdersTips(kpis, highestOrders[0], orderTrend);
    return { meta, overview, tab, orders: { byStatus, highestOrders, orderTrend } };
  }
  if (tab === "places") {
    overview.tips = buildPlacesTips(topPlaces);
    return { meta, overview, tab, places: { topPlaces } };
  }
  if (tab === "returns") {
    overview.tips = buildReturnsTips(returnsInRange.length, returnItemAggs[0], returnTrend);
    return {
      meta,
      overview,
      tab,
      returns: {
        returnedItems: returnItemAggs.slice(0, 50),
        returnsByCustomer,
        returnTrend,
        returnItemTrend,
        note: "Zoho Books refunded/void invoices used as returned-item proxy (no native returns module).",
      },
    };
  }
  if (tab === "refunds") {
    overview.tips = buildRefundsTips(
      refundsInRange.length,
      refundsInRange.reduce((s, r) => s + r.amount, 0),
      refundReasons[0]
    );
    return {
      meta,
      overview,
      tab,
      refunds: {
        list: refundsInRange
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 100)
          .map((r, idx) => ({
            refundId: idx + 1,
            orderNumber: r.invoiceNumber,
            date: r.date,
            amountInr: Math.round(r.amount * 100) / 100,
            reason: r.reason,
            email: r.email,
            customerName: r.customerName,
          })),
        refundTrend,
        refundsByCustomer,
        refundReasons,
      },
    };
  }
  if (tab === "customers") {
    overview.tips = buildCustomersTips(kpis, mostBought[0], mostVisited[0], newCustomers);
    return {
      meta,
      overview,
      tab,
      customers: {
        mostVisited,
        mostBought,
        repeatCustomers,
        newCustomers,
        note: "Most visited uses latest Zoho invoice date per customer (no Woo login activity).",
      },
    };
  }

  overview.tips = buildProductsTips(
    mostSold[0],
    leastSold[0],
    purchaseOrderNeeded.length,
    dropCandidates[0]
  );
  return {
    meta,
    overview,
    tab: "products" as const,
    products: {
      mostSold,
      leastSold,
      purchaseOrderNeeded,
      dropCandidates,
    },
  };
}

/** Dashboard hero insights from Zoho historical (last 30 days of available data). */
export async function dashboardInsightsFromZoho() {
  const bounds = await prisma.zohoHistoricalInvoice.aggregate({
    where: TEST_ORDER_FILTER,
    _max: { invoiceDate: true },
  });
  const to = bounds._max.invoiceDate ? dayKey(bounds._max.invoiceDate) : "";
  let from = to;
  if (to) {
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 30);
    from = d.toISOString().slice(0, 10);
    const minBounds = await prisma.zohoHistoricalInvoice.aggregate({
      where: TEST_ORDER_FILTER,
      _min: { invoiceDate: true },
    });
    const minDate = minBounds._min.invoiceDate ? dayKey(minBounds._min.invoiceDate) : "";
    if (minDate && from < minDate) from = minDate;
  }
  const data = await buildZohoDashboardAnalytics({ from, to, tab: "products" });
  const products = data.tab === "products" ? data.products : undefined;
  const most = products?.mostSold?.slice(0, 5) ?? [];
  return {
    source: "zoho-historical" as const,
    periodLabel: from && to ? `${from} → ${to}` : "Zoho Books",
    mostSoldThisMonthTop5: most.map((r) => ({
      sku: r.sku,
      name: r.productName,
      unitsSold: r.unitsSold,
    })),
    purchaseOrderNeededCount: products?.purchaseOrderNeeded?.length ?? 0,
    dropCandidatesCount: products?.dropCandidates?.length ?? 0,
    leastSoldThisMonthCount: products?.leastSold?.length ?? 0,
    tips: data.overview.tips,
    fastMovers: [] as Array<{ productId: string; name: string; unitsSold: number }>,
    slowMovers: [] as Array<{ productId: string; name: string; unitsSold: number }>,
  };
}
