/**
 * Historical all-marketplaces invoices imported from Zoho Books.
 * Kept fully separate from live website Orders / MarketplaceOrder tables.
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

const EXCLUDED_STATUSES = new Set(["void", "draft"]);

export function reportingInrPaiseFromMinor(currency: string, amountMinor: number): number {
  const c = (currency || "INR").toUpperCase();
  const fx = FX_TO_INR[c] ?? FX_TO_INR.USD;
  return Math.round((amountMinor / 100) * fx * 100);
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

export type ZohoHistoricalAnalytics = {
  range: { from: string; to: string; allTimeFrom: string | null; allTimeTo: string | null };
  totals: {
    orders: number;
    lineItems: number;
    unitsSold: number;
    revenueInInrPaise: number;
    excludedOrders: number;
  };
  topSeller: {
    productName: string;
    variantName: string;
    sku: string;
    unitsSold: number;
  } | null;
};

export type ZohoHistoricalProductRow = {
  productName: string;
  variantName: string;
  sku: string;
  unitsSold: number;
};

export type ZohoHistoricalProductsList = {
  total: number;
  suggestions: string[];
  items: ZohoHistoricalProductRow[];
};

export type ZohoHistoricalOrderRow = {
  zohoInvoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingCountry: string | null;
  totalInMinor: number;
  currency: string;
  orderStatus: "PAID" | "CANCELLED" | "REFUNDED" | "DRAFT";
  itemsShort: string;
};

export type ZohoHistoricalOrdersList = {
  total: number;
  options: {
    cities: string[];
    states: string[];
    countries: string[];
  };
  items: ZohoHistoricalOrderRow[];
};

export type ZohoHistoricalOrderDetail = {
  zohoInvoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: {
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
  };
  shippingAddress: {
    city: string | null;
    state: string | null;
    country: string | null;
  };
  currency: string;
  status: string;
  channel: string;
  subtotalInMinor: number;
  shippingInMinor: number;
  taxInMinor: number;
  discountInMinor: number;
  totalInMinor: number;
  balanceInMinor: number;
  lines: Array<{
    itemName: string | null;
    sku: string | null;
    quantity: number;
    unitPriceInMinor: number;
    lineTotalInMinor: number;
    taxAmountInMinor: number;
    hsnSac: string | null;
  }>;
};

type ParsedItemParts = {
  productName: string;
  variantName: string;
};

function parseDay(s?: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

function buildWhere(opts: { from?: string; to?: string; channel?: string }) {
  return prisma.zohoHistoricalInvoice.aggregate({
    _min: { invoiceDate: true },
    _max: { invoiceDate: true },
  }).then((bounds) => {
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

    return {
      where,
      range: {
        from: from.toISOString().slice(0, 10),
        to: toRaw.toISOString().slice(0, 10),
        allTimeFrom,
        allTimeTo,
      },
    };
  });
}

function parseItemName(itemName: string | null, sku: string | null): ParsedItemParts {
  const raw = (itemName || "").trim();
  if (!raw) {
    return { productName: sku?.trim() || "Unnamed product", variantName: "" };
  }
  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return { productName: raw, variantName: "" };
  }
  return {
    productName: parts[0],
    variantName: parts.slice(1).join(" / "),
  };
}

function mapZohoStatus(status: string): "PAID" | "CANCELLED" | "REFUNDED" | "DRAFT" {
  const s = (status || "").toLowerCase();
  if (s.includes("void") || s.includes("cancel")) return "CANCELLED";
  if (s.includes("refund")) return "REFUNDED";
  if (s.includes("draft")) return "DRAFT";
  return "PAID";
}

export async function getZohoHistoricalAnalytics(opts: {
  from?: string;
  to?: string;
  channel?: string;
}): Promise<ZohoHistoricalAnalytics> {
  const { where, range } = await buildWhere(opts);

  const invoices = await prisma.zohoHistoricalInvoice.findMany({
    where,
    select: {
      id: true,
      lines: { select: { itemName: true, sku: true, quantity: true } },
      reportingTotalInInrPaise: true,
    },
  });

  const excludedOrders = await prisma.zohoHistoricalInvoice.count({
    where: {
      invoiceDate: {
        gte: new Date(`${range.from}T00:00:00.000Z`),
        lte: new Date(`${range.to}T23:59:59.999Z`),
      },
      status: { in: [...EXCLUDED_STATUSES] },
      ...(opts.channel && opts.channel !== "ALL" ? { channelNormalized: opts.channel } : {}),
    },
  });

  let unitsSold = 0;
  let lineItems = 0;
  let revenueInInrPaise = 0;
  const skuMap = new Map<string, ZohoHistoricalProductRow>();

  for (const invoice of invoices) {
    revenueInInrPaise += invoice.reportingTotalInInrPaise;
    for (const line of invoice.lines) {
      lineItems += 1;
      const qty = Number(line.quantity) || 0;
      unitsSold += qty;
      const parts = parseItemName(line.itemName, line.sku);
      const key = `${line.sku || "—"}|${parts.productName}|${parts.variantName}`;
      const row = skuMap.get(key) || {
        productName: parts.productName,
        variantName: parts.variantName,
        sku: line.sku?.trim() || "—",
        unitsSold: 0,
      };
      row.unitsSold += qty;
      skuMap.set(key, row);
    }
  }

  const topSeller =
    Array.from(skuMap.values()).sort((a, b) => b.unitsSold - a.unitsSold)[0] ?? null;

  return {
    range,
    totals: {
      orders: invoices.length,
      lineItems,
      unitsSold: Math.round(unitsSold * 100) / 100,
      revenueInInrPaise,
      excludedOrders,
    },
    topSeller,
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

export async function listZohoHistoricalProducts(opts: {
  from?: string;
  to?: string;
  channel?: string;
  search?: string;
  sort?: "top_sold" | "least_sold";
  limit?: number;
  offset?: number;
}): Promise<ZohoHistoricalProductsList> {
  const { where } = await buildWhere(opts);
  const invoices = await prisma.zohoHistoricalInvoice.findMany({
    where,
    select: {
      lines: {
        select: {
          itemName: true,
          sku: true,
          quantity: true,
        },
      },
    },
  });

  const q = (opts.search || "").trim().toLowerCase();
  const map = new Map<string, ZohoHistoricalProductRow>();
  const suggestions = new Set<string>();

  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      const parts = parseItemName(line.itemName, line.sku);
      suggestions.add(parts.productName);
      if (q && !parts.productName.toLowerCase().startsWith(q)) {
        continue;
      }

      const key = `${line.sku || "—"}|${parts.productName}|${parts.variantName}`;
      const row = map.get(key) || {
        productName: parts.productName,
        variantName: parts.variantName,
        sku: line.sku?.trim() || "—",
        unitsSold: 0,
      };
      row.unitsSold += Number(line.quantity) || 0;
      map.set(key, row);
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => {
    if (opts.sort === "least_sold") return a.unitsSold - b.unitsSold || a.productName.localeCompare(b.productName);
    return b.unitsSold - a.unitsSold || a.productName.localeCompare(b.productName);
  });

  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 25;
  return {
    total: sorted.length,
    suggestions: Array.from(suggestions)
      .filter((name) => (q ? name.toLowerCase().startsWith(q) : true))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 20),
    items: sorted.slice(offset, offset + limit),
  };
}

export async function listZohoHistoricalOrders(opts: {
  from?: string;
  to?: string;
  channel?: string;
  search?: string;
  city?: string;
  state?: string;
  country?: string;
  sort?: "highest" | "lowest";
  limit?: number;
  offset?: number;
}): Promise<ZohoHistoricalOrdersList> {
  const { where } = await buildWhere(opts);
  const q = (opts.search || "").trim();
  if (q) {
    where.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { billingCity: { contains: q, mode: "insensitive" } },
      { billingState: { contains: q, mode: "insensitive" } },
      { billingCountry: { contains: q, mode: "insensitive" } },
    ];
  }
  if (opts.city) where.billingCity = opts.city;
  if (opts.state) where.billingState = opts.state;
  if (opts.country) where.billingCountry = opts.country;

  const [total, rows, allLocations] = await Promise.all([
    prisma.zohoHistoricalInvoice.count({ where }),
    prisma.zohoHistoricalInvoice.findMany({
      where,
      orderBy: { totalInMinor: opts.sort === "lowest" ? "asc" : "desc" },
      skip: opts.offset ?? 0,
      take: opts.limit ?? 25,
      select: {
        zohoInvoiceId: true,
        invoiceNumber: true,
        invoiceDate: true,
        customerName: true,
        billingCity: true,
        billingState: true,
        billingCountry: true,
        totalInMinor: true,
        currency: true,
        status: true,
        lines: {
          take: 3,
          select: { itemName: true, quantity: true },
        },
      },
    }),
    prisma.zohoHistoricalInvoice.findMany({
      select: { billingCity: true, billingState: true, billingCountry: true },
      distinct: ["billingCity", "billingState", "billingCountry"],
      orderBy: [{ billingCountry: "asc" }, { billingState: "asc" }, { billingCity: "asc" }],
    }),
  ]);

  return {
    total,
    options: {
      cities: Array.from(new Set(allLocations.map((r) => r.billingCity).filter(Boolean) as string[])),
      states: Array.from(new Set(allLocations.map((r) => r.billingState).filter(Boolean) as string[])),
      countries: Array.from(new Set(allLocations.map((r) => r.billingCountry).filter(Boolean) as string[])),
    },
    items: rows.map((row) => ({
      zohoInvoiceId: row.zohoInvoiceId,
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
      customerName: row.customerName,
      billingCity: row.billingCity,
      billingState: row.billingState,
      billingCountry: row.billingCountry,
      totalInMinor: row.totalInMinor,
      currency: row.currency,
      orderStatus: mapZohoStatus(row.status),
      itemsShort: row.lines
        .map((line) => `${line.itemName || "Item"}${line.quantity ? ` x${line.quantity}` : ""}`)
        .join(", "),
    })),
  };
}

export async function getZohoHistoricalOrderDetail(
  zohoInvoiceId: string
): Promise<ZohoHistoricalOrderDetail | null> {
  const row = await prisma.zohoHistoricalInvoice.findUnique({
    where: { zohoInvoiceId },
    select: {
      zohoInvoiceId: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      customerName: true,
      email: true,
      phone: true,
      billingCity: true,
      billingState: true,
      billingCountry: true,
      billingPostalCode: true,
      shippingCity: true,
      shippingState: true,
      shippingCountry: true,
      currency: true,
      status: true,
      channelNormalized: true,
      subtotalInMinor: true,
      shippingInMinor: true,
      taxInMinor: true,
      discountInMinor: true,
      totalInMinor: true,
      balanceInMinor: true,
      lines: {
        orderBy: { lineIndex: "asc" },
        select: {
          itemName: true,
          sku: true,
          quantity: true,
          unitPriceInMinor: true,
          lineTotalInMinor: true,
          taxAmountInMinor: true,
          hsnSac: true,
        },
      },
    },
  });

  if (!row) return null;

  return {
    zohoInvoiceId: row.zohoInvoiceId,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    customerName: row.customerName,
    email: row.email,
    phone: row.phone,
    billingAddress: {
      city: row.billingCity,
      state: row.billingState,
      country: row.billingCountry,
      postalCode: row.billingPostalCode,
    },
    shippingAddress: {
      city: row.shippingCity,
      state: row.shippingState,
      country: row.shippingCountry,
    },
    currency: row.currency,
    status: mapZohoStatus(row.status),
    channel: row.channelNormalized,
    subtotalInMinor: row.subtotalInMinor,
    shippingInMinor: row.shippingInMinor,
    taxInMinor: row.taxInMinor,
    discountInMinor: row.discountInMinor,
    totalInMinor: row.totalInMinor,
    balanceInMinor: row.balanceInMinor,
    lines: row.lines.map((line) => ({
      itemName: line.itemName,
      sku: line.sku,
      quantity: Number(line.quantity) || 0,
      unitPriceInMinor: line.unitPriceInMinor,
      lineTotalInMinor: line.lineTotalInMinor,
      taxAmountInMinor: line.taxAmountInMinor,
      hsnSac: line.hsnSac,
    })),
  };
}

export async function getZohoHistoricalDateBounds(): Promise<{ from: string; to: string }> {
  const agg = await prisma.zohoHistoricalInvoice.aggregate({
    _min: { invoiceDate: true },
    _max: { invoiceDate: true },
  });
  const today = new Date().toISOString().slice(0, 10);
  return {
    from: agg._min.invoiceDate?.toISOString().slice(0, 10) ?? "2024-04-01",
    to: agg._max.invoiceDate?.toISOString().slice(0, 10) ?? today,
  };
}

export type ZohoProductChannelBreakdown = {
  productName: string;
  sku: string;
  totalUnits: number;
  channels: Array<{ channel: string; unitsSold: number }>;
};

export async function getZohoProductChannelBreakdown(opts: {
  from?: string;
  to?: string;
  sku: string;
  productName: string;
}): Promise<ZohoProductChannelBreakdown> {
  const { where } = await buildWhere({ from: opts.from, to: opts.to });
  const sku = opts.sku.trim();
  const productName = opts.productName.trim();

  const invoices = await prisma.zohoHistoricalInvoice.findMany({
    where,
    select: {
      channelNormalized: true,
      lines: {
        select: { itemName: true, sku: true, quantity: true },
      },
    },
  });

  const map = new Map<string, number>();
  let totalUnits = 0;

  for (const invoice of invoices) {
    const channel = invoice.channelNormalized || "Direct/Other";
    for (const line of invoice.lines) {
      const parts = parseItemName(line.itemName, line.sku);
      const lineSku = (line.sku || "").trim();
      if (lineSku !== sku || parts.productName !== productName) continue;
      const qty = Number(line.quantity) || 0;
      totalUnits += qty;
      map.set(channel, (map.get(channel) || 0) + qty);
    }
  }

  return {
    productName,
    sku,
    totalUnits,
    channels: Array.from(map.entries())
      .map(([channel, unitsSold]) => ({ channel, unitsSold }))
      .sort((a, b) => b.unitsSold - a.unitsSold || a.channel.localeCompare(b.channel)),
  };
}
