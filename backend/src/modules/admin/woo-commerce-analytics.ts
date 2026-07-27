import fs from "fs";
import path from "path";

import { logger } from "../../config/logger";

export type WarehouseOrder = {
  id: number;
  date: string;
  status: string;
  email: string;
  name: string;
  total: number;
  currency: string;
  city: string;
  state: string;
  country: string;
  payment: string;
  customerUserId: number;
};

export type WarehouseItem = {
  orderId: number;
  itemId: number;
  name: string;
  qty: number;
  lineTotal: number;
  productId: number;
  variationId: number;
  sku: string;
};

export type WarehouseRefund = {
  id: number;
  orderId: number;
  date: string;
  status: string;
  amount: number;
  reason: string;
};

export type WarehouseReturn = WarehouseItem & {
  date: string;
  email: string;
  customerName: string;
};

export type WarehouseCustomer = {
  id: number;
  email: string;
  name: string;
  registered: string;
  lastActive: string;
  phone: string;
  city: string;
  state: string;
  country: string;
};

export type WooWarehouse = {
  source: string;
  dumpFile: string;
  generatedAt: string;
  note: string;
  range: { minDate: string; maxDate: string };
  orders: WarehouseOrder[];
  items: WarehouseItem[];
  refunds: WarehouseRefund[];
  returns: WarehouseReturn[];
  customers: WarehouseCustomer[];
};

type ProductAgg = {
  sku: string;
  productName: string;
  unitsSold: number;
  revenueInr: number;
  revenueInPaise: number;
  orderCount: number;
};

let cached: WooWarehouse | null = null;

export function loadWooWarehouse(): WooWarehouse {
  if (cached) return cached;
  const candidates = [
    path.join(process.cwd(), "data", "woo-dump-warehouse.json"),
    path.join(__dirname, "..", "..", "..", "data", "woo-dump-warehouse.json")
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      cached = JSON.parse(fs.readFileSync(file, "utf8")) as WooWarehouse;
      return cached;
    } catch (err) {
      logger.warn("Failed reading woo dump warehouse", {
        file,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  cached = {
    source: "missing",
    dumpFile: "",
    generatedAt: "",
    note: "Warehouse file missing",
    range: { minDate: "", maxDate: "" },
    orders: [],
    items: [],
    refunds: [],
    returns: [],
    customers: []
  };
  return cached;
}

function inRange(date: string, from?: string, to?: string): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function aggregateProducts(items: WarehouseItem[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const it of items) {
    const key = `${it.sku || "unknown"}|${it.name}`;
    const cur = map.get(key) ?? {
      sku: it.sku || "unknown",
      productName: it.name,
      unitsSold: 0,
      revenueInr: 0,
      revenueInPaise: 0,
      orderCount: 0
    };
    cur.unitsSold += it.qty;
    cur.revenueInr += it.lineTotal;
    cur.orderCount += 1;
    map.set(key, cur);
  }
  return [...map.values()].map((r) => ({
    ...r,
    unitsSold: Math.round(r.unitsSold),
    revenueInr: Math.round(r.revenueInr * 100) / 100,
    revenueInPaise: Math.round(r.revenueInr * 100)
  }));
}

export type AnalyticsQuery = {
  from?: string;
  to?: string;
  tab?: "products" | "orders" | "places" | "returns" | "refunds" | "customers";
};

export function buildWooCommerceAnalytics(query: AnalyticsQuery) {
  const wh = loadWooWarehouse();
  const from = query.from || wh.range.minDate;
  const to = query.to || wh.range.maxDate;
  const tab = query.tab || "products";

  const ordersInRange = wh.orders.filter((o) => inRange(o.date, from, to));
  const completed = ordersInRange.filter((o) => o.status === "completed");
  const completedIds = new Set(completed.map((o) => o.id));
  const itemsCompleted = wh.items.filter((i) => completedIds.has(i.orderId));

  const productAggs = aggregateProducts(itemsCompleted);
  const mostSold = [...productAggs].sort((a, b) => b.unitsSold - a.unitsSold || b.revenueInr - a.revenueInr).slice(0, 10);
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

  // Orders tab
  const byStatus: Record<string, number> = {};
  for (const o of ordersInRange) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  const highestOrders = [...completed]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((o) => ({
      orderNumber: `WOO-${o.id}`,
      email: o.email,
      customerName: o.name || o.email,
      city: o.city,
      status: o.status,
      placedAt: o.date,
      totalInr: o.total,
      totalInPaise: Math.round(o.total * 100)
    }));

  const placesMap = new Map<string, { city: string; state: string; country: string; orderCount: number; totalInr: number }>();
  for (const o of completed) {
    const city = o.city || "Unknown";
    const state = o.state || "";
    const country = o.country || "";
    const key = `${city}|${state}|${country}`.toLowerCase();
    const cur = placesMap.get(key) ?? { city, state, country, orderCount: 0, totalInr: 0 };
    cur.orderCount += 1;
    cur.totalInr += o.total;
    placesMap.set(key, cur);
  }
  const topPlaces = [...placesMap.values()]
    .sort((a, b) => b.orderCount - a.orderCount || b.totalInr - a.totalInr)
    .slice(0, 10)
    .map((p) => ({ ...p, totalInr: Math.round(p.totalInr * 100) / 100, totalInPaise: Math.round(p.totalInr * 100) }));

  const custMap = new Map<
    string,
    { email: string; name: string; city: string; orderCount: number; totalSpendInr: number; lastOrderedAt: string }
  >();
  for (const o of completed) {
    const email = o.email || `unknown-${o.id}`;
    const cur = custMap.get(email) ?? {
      email,
      name: o.name || email,
      city: o.city || "",
      orderCount: 0,
      totalSpendInr: 0,
      lastOrderedAt: o.date
    };
    cur.orderCount += 1;
    cur.totalSpendInr += o.total;
    if (o.date > cur.lastOrderedAt) cur.lastOrderedAt = o.date;
    if (!cur.name && o.name) cur.name = o.name;
    if (!cur.city && o.city) cur.city = o.city;
    custMap.set(email, cur);
  }
  const repeatCustomers = [...custMap.values()]
    .filter((c) => c.orderCount > 1)
    .sort((a, b) => b.orderCount - a.orderCount || b.totalSpendInr - a.totalSpendInr)
    .slice(0, 10)
    .map((c) => ({
      ...c,
      totalSpendInr: Math.round(c.totalSpendInr * 100) / 100,
      totalSpendInPaise: Math.round(c.totalSpendInr * 100)
    }));

  const orderTrendMap = new Map<string, { month: string; orders: number; revenueInr: number }>();
  for (const o of completed) {
    const m = monthKey(o.date);
    const cur = orderTrendMap.get(m) ?? { month: m, orders: 0, revenueInr: 0 };
    cur.orders += 1;
    cur.revenueInr += o.total;
    orderTrendMap.set(m, cur);
  }
  const orderTrend = [...orderTrendMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, revenueInr: Math.round(r.revenueInr * 100) / 100 }));

  // Returns
  const returnsInRange = wh.returns.filter((r) => inRange(r.date, from, to));
  const returnItemAggs = aggregateProducts(returnsInRange).sort((a, b) => b.unitsSold - a.unitsSold);
  const returnsByCustomerMap = new Map<string, { email: string; customerName: string; units: number; lines: number }>();
  for (const r of returnsInRange) {
    const email = r.email || "unknown";
    const cur = returnsByCustomerMap.get(email) ?? {
      email,
      customerName: r.customerName || email,
      units: 0,
      lines: 0
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

  const returnItemTrend: Array<{ productName: string; sku: string; months: Array<{ month: string; units: number }> }> = [];
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
        .map(([month, units]) => ({ month, units: Math.round(units) }))
    });
  }

  // Refunds
  const refundsInRange = wh.refunds.filter((r) => inRange(r.date, from, to));
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
    const order = wh.orders.find((o) => o.id === r.orderId);
    const email = order?.email || `order-${r.orderId}`;
    const cur = refundsByCustomerMap.get(email) ?? {
      email,
      customerName: order?.name || email,
      count: 0,
      amountInr: 0
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
    const reason = (r.reason || "unspecified").trim() || "unspecified";
    refundReasonsMap.set(reason, (refundReasonsMap.get(reason) || 0) + 1);
  }
  const refundReasons = [...refundReasonsMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // Customers / logins
  const customersInActivity = wh.customers
    .filter((c) => c.lastActive && inRange(c.lastActive, from, to))
    .sort((a, b) => b.lastActive.localeCompare(a.lastActive));
  const mostVisited = customersInActivity.slice(0, 20).map((c) => ({
    email: c.email,
    name: c.name,
    lastActive: c.lastActive,
    city: c.city,
    registered: c.registered
  }));

  // Prefer purchase-based repeating customers for "most bought"
  const mostBought = [...custMap.values()]
    .sort((a, b) => b.orderCount - a.orderCount || b.totalSpendInr - a.totalSpendInr)
    .slice(0, 20)
    .map((c) => ({
      email: c.email,
      name: c.name,
      city: c.city,
      orderCount: c.orderCount,
      totalSpendInr: Math.round(c.totalSpendInr * 100) / 100,
      lastOrderedAt: c.lastOrderedAt
    }));

  const newCustomers = wh.customers.filter((c) => c.registered && inRange(c.registered, from, to)).length;

  const kpis = {
    orders: completed.length,
    revenueInr: Math.round(completed.reduce((s, o) => s + o.total, 0) * 100) / 100,
    aovInr:
      completed.length > 0
        ? Math.round((completed.reduce((s, o) => s + o.total, 0) / completed.length) * 100) / 100
        : 0,
    units: Math.round(itemsCompleted.reduce((s, i) => s + i.qty, 0)),
    refundAmountInr: Math.round(refundsInRange.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    refundCount: refundsInRange.length,
    returnUnits: Math.round(returnsInRange.reduce((s, r) => s + r.qty, 0)),
    repeatCustomerCount: [...custMap.values()].filter((c) => c.orderCount > 1).length,
    uniqueCustomers: custMap.size,
    newCustomers
  };

  const meta = {
    source: wh.source,
    dumpFile: wh.dumpFile,
    generatedAt: wh.generatedAt,
    availableRange: wh.range,
    appliedRange: { from, to },
    note: wh.note
  };

  const overview = {
    kpis,
    orderTrend,
    tips: [] as string[]
  };

  if (tab === "orders") {
    overview.tips = buildOrdersTips(kpis, highestOrders[0], orderTrend);
    return {
      meta,
      overview,
      tab,
      orders: {
        byStatus,
        highestOrders,
        orderTrend
      }
    };
  }
  if (tab === "places") {
    overview.tips = buildPlacesTips(topPlaces);
    return {
      meta,
      overview,
      tab,
      places: {
        topPlaces
      }
    };
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
        note:
          "WooCommerce has limited native returns. This uses refunded-order line items as returned-item proxy."
      }
    };
  }
  if (tab === "refunds") {
    overview.tips = buildRefundsTips(refundsInRange.length, refundsInRange.reduce((s, r) => s + r.amount, 0), refundReasons[0]);
    return {
      meta,
      overview,
      tab,
      refunds: {
        list: refundsInRange
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 100)
          .map((r) => {
            const order = wh.orders.find((o) => o.id === r.orderId);
            return {
              refundId: r.id,
              orderNumber: `WOO-${r.orderId}`,
              date: r.date,
              amountInr: r.amount,
              reason: r.reason || "unspecified",
              email: order?.email || "",
              customerName: order?.name || ""
            };
          }),
        refundTrend,
        refundsByCustomer,
        refundReasons
      }
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
        note: "Most visited uses WooCommerce wc_last_active where available; most bought uses completed-order history."
      }
    };
  }

  // products default
  overview.tips = buildProductsTips(mostSold[0], leastSold[0], purchaseOrderNeeded.length, dropCandidates[0]);
  return {
    meta,
    overview,
    tab: "products" as const,
    products: {
      mostSold,
      leastSold,
      purchaseOrderNeeded,
      dropCandidates
    }
  };
}

function buildProductsTips(
  top?: ProductAgg,
  least?: ProductAgg,
  poCount = 0,
  drop?: ProductAgg
): string[] {
  const tips: string[] = [];
  if (top) {
    tips.push(
      `${top.productName} is your top seller in this range (${top.unitsSold} units) — protect stock and feature it.`
    );
  }
  if (poCount > 0) {
    tips.push(`${poCount} SKU(s) sold ≥5 units — raise purchase orders before stockouts.`);
  }
  if (least) {
    tips.push(
      `${least.productName} is among the least sold (${least.unitsSold} units) — review pricing, merchandising, or bundle it.`
    );
  }
  if (drop) {
    tips.push(`${drop.productName} looks like a drop candidate (${drop.unitsSold} units) — discount, bundle, or delist.`);
  }
  if (tips.length === 0) tips.push("No completed product sales in this date range.");
  return tips.slice(0, 3);
}

function buildOrdersTips(
  kpis: { orders: number; aovInr: number; revenueInr: number },
  topOrder?: { orderNumber: string; totalInr: number; customerName: string },
  trend: Array<{ month: string; orders: number }> = []
): string[] {
  const tips: string[] = [];
  tips.push(`${kpis.orders} completed orders · revenue ₹${kpis.revenueInr.toLocaleString("en-IN")} in this range.`);
  if (kpis.aovInr > 0) {
    tips.push(`Average order value is ₹${kpis.aovInr.toLocaleString("en-IN")} — test bundles or free-shipping thresholds to lift AOV.`);
  }
  if (topOrder) {
    tips.push(
      `Highest order ${topOrder.orderNumber} is ₹${topOrder.totalInr.toLocaleString("en-IN")} (${topOrder.customerName}) — study that basket for upsell patterns.`
    );
  }
  if (trend.length >= 2) {
    const a = trend[trend.length - 2]?.orders ?? 0;
    const b = trend[trend.length - 1]?.orders ?? 0;
    if (b > a) tips.push(`Order volume is rising vs previous month in-range (${a} → ${b}).`);
    else if (b < a) tips.push(`Order volume softened vs previous month in-range (${a} → ${b}) — check campaigns and stock.`);
  }
  return tips.slice(0, 3);
}

function buildPlacesTips(
  places: Array<{ city: string; state: string; orderCount: number; totalInr: number }>
): string[] {
  const tips: string[] = [];
  if (!places.length) return ["No shipping/billing place data in this range."];
  const top = places[0];
  tips.push(
    `${top.city}${top.state ? `, ${top.state}` : ""} leads with ${top.orderCount} orders (₹${top.totalInr.toLocaleString("en-IN")}) — prioritize courier SLAs and local ads there.`
  );
  if (places[1]) {
    tips.push(
      `Next hot market: ${places[1].city} (${places[1].orderCount} orders) — compare conversion vs ${top.city}.`
    );
  }
  if (places.length >= 5) {
    tips.push(`${places.length} cities appear in the top list — expand regional stock coverage for the top 3 first.`);
  }
  return tips.slice(0, 3);
}

function buildReturnsTips(
  count: number,
  topItem?: ProductAgg,
  trend: Array<{ month: string; units: number }> = []
): string[] {
  const tips: string[] = [];
  if (count === 0) return ["No returned/refunded line items in this range — keep monitoring quality signals."];
  tips.push(`${count} returned line item(s) in this range — review QC and listing accuracy.`);
  if (topItem) {
    tips.push(
      `${topItem.productName} appears most in returns (${topItem.unitsSold} units) — inspect packaging and product page expectations.`
    );
  }
  if (trend.length >= 2) {
    const a = trend[trend.length - 2]?.units ?? 0;
    const b = trend[trend.length - 1]?.units ?? 0;
    if (b > a) tips.push(`Return units are increasing (${a} → ${b}) — escalate product QA.`);
    else if (b < a) tips.push(`Return units are easing (${a} → ${b}) — keep the quality improvements going.`);
  }
  return tips.slice(0, 3);
}

function buildRefundsTips(
  count: number,
  amount: number,
  topReason?: { reason: string; count: number }
): string[] {
  const tips: string[] = [];
  if (count === 0) return ["No refunds in this range."];
  tips.push(
    `${count} refund(s) totaling ₹${Math.round(amount).toLocaleString("en-IN")} — track reasons weekly.`
  );
  if (topReason) {
    tips.push(`Most common refund signal: “${topReason.reason}” (${topReason.count}) — address root cause.`);
  }
  tips.push("Compare refund rate to revenue; if rising, pause weak SKUs and tighten descriptions.");
  return tips.slice(0, 3);
}

function buildCustomersTips(
  kpis: { repeatCustomerCount: number; uniqueCustomers: number },
  topBuyer?: { name: string; orderCount: number; totalSpendInr: number },
  visitor?: { name: string; email: string; lastActive: string },
  newCustomers = 0
): string[] {
  const tips: string[] = [];
  if (kpis.uniqueCustomers > 0) {
    const repeatPct = Math.round((kpis.repeatCustomerCount / kpis.uniqueCustomers) * 100);
    tips.push(
      `Repeat purchase rate is about ${repeatPct}% (${kpis.repeatCustomerCount}/${kpis.uniqueCustomers}) — nurture VIPs with post-purchase offers.`
    );
  }
  tips.push(`${newCustomers} new customer(s) registered in this range.`);
  if (topBuyer) {
    tips.push(
      `${topBuyer.name} is a top buyer (${topBuyer.orderCount} orders, ₹${topBuyer.totalSpendInr.toLocaleString("en-IN")}) — invite to loyalty / early drops.`
    );
  } else if (visitor) {
    tips.push(`${visitor.name || visitor.email} was recently active (${visitor.lastActive}) — retarget with browse-abandon offers.`);
  }
  if (tips.length === 0) tips.push("No customer activity in this date range.");
  return tips.slice(0, 3);
}

/** Dashboard summary from full available warehouse range (or last 30 days of dump max). */
export function dashboardInsightsFromWarehouse() {
  const wh = loadWooWarehouse();
  const to = wh.range.maxDate;
  let from = to;
  if (to) {
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 30);
    from = d.toISOString().slice(0, 10);
    if (wh.range.minDate && from < wh.range.minDate) from = wh.range.minDate;
  }
  const data = buildWooCommerceAnalytics({ from, to, tab: "products" });
  const products = data.tab === "products" ? data.products : undefined;
  const most = products?.mostSold?.slice(0, 5) ?? [];
  return {
    source: "woo-dump" as const,
    periodLabel: from && to ? `${from} → ${to}` : "Woo dump",
    mostSoldThisMonthTop5: most.map((r) => ({
      sku: r.sku,
      name: r.productName,
      unitsSold: r.unitsSold
    })),
    purchaseOrderNeededCount: products?.purchaseOrderNeeded?.length ?? 0,
    dropCandidatesCount: products?.dropCandidates?.length ?? 0,
    leastSoldThisMonthCount: products?.leastSold?.length ?? 0,
    tips: data.overview.tips,
    fastMovers: [] as Array<{ productId: string; name: string; unitsSold: number }>,
    slowMovers: [] as Array<{ productId: string; name: string; unitsSold: number }>
  };
}
