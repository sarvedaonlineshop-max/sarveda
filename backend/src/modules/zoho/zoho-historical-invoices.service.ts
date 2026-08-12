/**
 * Zoho Books historical invoices — isolated from Order / MarketplaceOrder.
 * Analytics + shared channel normalization for import.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";

const FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: parseFloat(process.env.REPORTING_USD_INR ?? "83"),
  GBP: parseFloat(process.env.REPORTING_GBP_INR ?? "105"),
  AED: parseFloat(process.env.REPORTING_AED_INR ?? "22.6"),
  EUR: parseFloat(process.env.REPORTING_EUR_INR ?? "90"),
};

export function reportingInrPaiseFromMinor(currency: string, amountMinor: number): number {
  const c = (currency || "INR").toUpperCase();
  const fx = FX_TO_INR[c] ?? FX_TO_INR.USD;
  // amountMinor is already *100 of major; convert major→INR→paise
  const major = amountMinor / 100;
  return Math.round(major * fx * 100);
}

export function toMinor(major: number | null | undefined): number {
  if (major == null || Number.isNaN(Number(major))) return 0;
  return Math.round(Number(major) * 100);
}

export function normalizeZohoChannel(input: {
  salesChannelRaw?: string | null;
  marketplaceRaw?: string | null;
  customerName?: string | null;
}): string {
  const sales = (input.salesChannelRaw || "").trim();
  const mp = (input.marketplaceRaw || "").trim();
  const cust = (input.customerName || "").trim();
  const blob = `${sales} ${mp} ${cust}`.toLowerCase();

  if (blob.includes("amazon")) return "Amazon";
  if (blob.includes("flipkart")) return "Flipkart";
  if (blob.includes("etsy")) return "Etsy";
  if (blob.includes("amala")) return "Amala";
  if (blob.includes("firstcry") || blob.includes("first cry")) return "FirstCry";
  if (blob.includes("1mg") || blob.includes("tata")) return "Tata 1mg";
  if (blob.includes("meesho")) return "Meesho";
  if (blob.includes("ebay")) return "Ebay";
  if (blob.includes("meolaa")) return "Meolaa";
  if (blob.includes("offline")) return "Offline Sales";
  if (blob.includes("web sales") || sales.toLowerCase() === "web sales") return "Web Sales";
  if (sales) return sales;
  if (mp) return mp;
  return "Direct/Other";
}

const EXCLUDED_STATUSES = new Set(["void", "draft"]);

export type ZohoHistoricalAnalytics = {
  range: { from: string; to: string; allTimeFrom: string | null; allTimeTo: string | null };
  totals: {
    invoices: number;
    lineItems: number;
    unitsSold: number;
    revenueInInrPaise: number;
    excludedInvoices: number;
  };
  byChannel: Array<{
    channel: string;
    invoices: number;
    unitsSold: number;
    revenueInInrPaise: number;
  }>;
  byMonth: Array<{
    month: string;
    invoices: number;
    revenueInInrPaise: number;
  }>;
  byCurrency: Array<{
    currency: string;
    invoices: number;
    totalInMinor: number;
    revenueInInrPaise: number;
  }>;
  topSkus: Array<{
    sku: string;
    itemName: string | null;
    unitsSold: number;
    lineRevenueInMinorApprox: number;
    invoiceCount: number;
  }>;
  dailyInvoices: Array<{ date: string; invoices: number; revenueInInrPaise: number }>;
  conclusion: string[];
};

function parseDay(s?: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

export async function getZohoHistoricalAnalytics(opts: {
  from?: string;
  to?: string;
  channel?: string;
}): Promise<ZohoHistoricalAnalytics> {
  const bounds = await prisma.zohoHistoricalInvoice.aggregate({
    _min: { invoiceDate: true },
    _max: { invoiceDate: true },
  });
  const allTimeFrom = bounds._min.invoiceDate
    ? bounds._min.invoiceDate.toISOString().slice(0, 10)
    : null;
  const allTimeTo = bounds._max.invoiceDate
    ? bounds._max.invoiceDate.toISOString().slice(0, 10)
    : null;

  const from = parseDay(opts.from) ?? (allTimeFrom ? parseDay(allTimeFrom)! : new Date("2024-01-01"));
  const toRaw = parseDay(opts.to) ?? (allTimeTo ? parseDay(allTimeTo)! : new Date());
  const to = new Date(toRaw);
  to.setUTCHours(23, 59, 59, 999);

  const where: Prisma.ZohoHistoricalInvoiceWhereInput = {
    invoiceDate: { gte: from, lte: to },
    status: { notIn: [...EXCLUDED_STATUSES] },
  };
  if (opts.channel && opts.channel !== "ALL") {
    where.channelNormalized = opts.channel;
  }

  const invoices = await prisma.zohoHistoricalInvoice.findMany({
    where,
    select: {
      id: true,
      invoiceDate: true,
      currency: true,
      totalInMinor: true,
      reportingTotalInInrPaise: true,
      channelNormalized: true,
      status: true,
      lines: {
        select: {
          sku: true,
          itemName: true,
          quantity: true,
          lineTotalInMinor: true,
        },
      },
    },
  });

  const excludedInvoices = await prisma.zohoHistoricalInvoice.count({
    where: {
      invoiceDate: { gte: from, lte: to },
      status: { in: [...EXCLUDED_STATUSES] },
      ...(opts.channel && opts.channel !== "ALL" ? { channelNormalized: opts.channel } : {}),
    },
  });

  const byChannelMap = new Map<
    string,
    { invoices: number; unitsSold: number; revenueInInrPaise: number }
  >();
  const byMonthMap = new Map<string, { invoices: number; revenueInInrPaise: number }>();
  const byCurrencyMap = new Map<
    string,
    { invoices: number; totalInMinor: number; revenueInInrPaise: number }
  >();
  const dailyMap = new Map<string, { invoices: number; revenueInInrPaise: number }>();
  const skuMap = new Map<
    string,
    {
      sku: string;
      itemName: string | null;
      unitsSold: number;
      lineRevenueInMinorApprox: number;
      invoiceIds: Set<string>;
    }
  >();

  let lineItems = 0;
  let unitsSold = 0;
  let revenueInInrPaise = 0;

  for (const inv of invoices) {
    revenueInInrPaise += inv.reportingTotalInInrPaise;
    const ch = inv.channelNormalized || "Direct/Other";
    const chRow = byChannelMap.get(ch) || { invoices: 0, unitsSold: 0, revenueInInrPaise: 0 };
    chRow.invoices += 1;
    chRow.revenueInInrPaise += inv.reportingTotalInInrPaise;
    byChannelMap.set(ch, chRow);

    const month = inv.invoiceDate.toISOString().slice(0, 7);
    const mRow = byMonthMap.get(month) || { invoices: 0, revenueInInrPaise: 0 };
    mRow.invoices += 1;
    mRow.revenueInInrPaise += inv.reportingTotalInInrPaise;
    byMonthMap.set(month, mRow);

    const cur = inv.currency || "INR";
    const cRow = byCurrencyMap.get(cur) || {
      invoices: 0,
      totalInMinor: 0,
      revenueInInrPaise: 0,
    };
    cRow.invoices += 1;
    cRow.totalInMinor += inv.totalInMinor;
    cRow.revenueInInrPaise += inv.reportingTotalInInrPaise;
    byCurrencyMap.set(cur, cRow);

    const day = inv.invoiceDate.toISOString().slice(0, 10);
    const dRow = dailyMap.get(day) || { invoices: 0, revenueInInrPaise: 0 };
    dRow.invoices += 1;
    dRow.revenueInInrPaise += inv.reportingTotalInInrPaise;
    dailyMap.set(day, dRow);

    for (const line of inv.lines) {
      lineItems += 1;
      const qty = Number(line.quantity) || 0;
      unitsSold += qty;
      chRow.unitsSold += qty;
      const skuKey = (line.sku || "").trim() || `(no-sku) ${line.itemName || "item"}`;
      const s =
        skuMap.get(skuKey) ||
        {
          sku: (line.sku || "").trim() || "—",
          itemName: line.itemName,
          unitsSold: 0,
          lineRevenueInMinorApprox: 0,
          invoiceIds: new Set<string>(),
        };
      s.unitsSold += qty;
      s.lineRevenueInMinorApprox += line.lineTotalInMinor;
      s.invoiceIds.add(inv.id);
      if (!s.itemName && line.itemName) s.itemName = line.itemName;
      skuMap.set(skuKey, s);
    }
    byChannelMap.set(ch, chRow);
  }

  const byChannel = Array.from(byChannelMap.entries())
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.revenueInInrPaise - a.revenueInInrPaise);

  const byMonth = Array.from(byMonthMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byCurrency = Array.from(byCurrencyMap.entries())
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.revenueInInrPaise - a.revenueInInrPaise);

  const topSkus = Array.from(skuMap.values())
    .map((s) => ({
      sku: s.sku,
      itemName: s.itemName,
      unitsSold: Math.round(s.unitsSold * 100) / 100,
      lineRevenueInMinorApprox: s.lineRevenueInMinorApprox,
      invoiceCount: s.invoiceIds.size,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 20);

  const dailyInvoices = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topChannel = byChannel[0];
  const topSku = topSkus[0];
  const conclusion: string[] = [
    `${invoices.length.toLocaleString("en-IN")} Zoho invoices in range (excl. void/draft) · ${Math.round(unitsSold).toLocaleString("en-IN")} units · ₹${(revenueInInrPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })} reporting INR.`,
  ];
  if (topChannel) {
    conclusion.push(
      `Largest channel: ${topChannel.channel} (${topChannel.invoices.toLocaleString("en-IN")} invoices, ₹${(topChannel.revenueInInrPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}).`
    );
  }
  if (topSku) {
    conclusion.push(
      `Top SKU by units: ${topSku.sku}${topSku.itemName ? ` — ${topSku.itemName}` : ""} (${topSku.unitsSold} units).`
    );
  }
  if (excludedInvoices > 0) {
    conclusion.push(`${excludedInvoices} void/draft invoices excluded from totals.`);
  }

  return {
    range: {
      from: from.toISOString().slice(0, 10),
      to: toRaw.toISOString().slice(0, 10),
      allTimeFrom,
      allTimeTo,
    },
    totals: {
      invoices: invoices.length,
      lineItems,
      unitsSold: Math.round(unitsSold * 100) / 100,
      revenueInInrPaise,
      excludedInvoices,
    },
    byChannel,
    byMonth,
    byCurrency,
    topSkus,
    dailyInvoices,
    conclusion,
  };
}

export async function listZohoHistoricalChannels(): Promise<string[]> {
  const rows = await prisma.zohoHistoricalInvoice.findMany({
    distinct: ["channelNormalized"],
    select: { channelNormalized: true },
    orderBy: { channelNormalized: "asc" },
  });
  return rows.map((r) => r.channelNormalized).filter(Boolean);
}
