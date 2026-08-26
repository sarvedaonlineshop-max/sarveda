import { prisma } from "../../config/db";

const CHANNEL_LABELS: Record<string, string> = {
  AMAZON: "Amazon",
  FLIPKART: "Flipkart",
  ETSY: "Etsy",
  AMALA: "Amala",
  FIRSTCRY: "FirstCry",
  TATA_1MG: "Tata 1mg",
  SARVEDA: "Sarveda"
};

type ArchiveItem = {
  id?: string;
  skuSnapshot?: string;
  productNameSnapshot?: string | null;
  quantity?: number;
  unitPriceInPaise?: number | null;
  lineTotalInPaise?: number | null;
  variantId?: string | null;
  variant?: { sku?: string; productRel?: { name?: string } } | null;
};

type ArchiveReturn = {
  id?: string;
  quantity?: number;
  status?: string;
  refundedAmountInPaise?: number | null;
  restockedToZoho?: boolean;
  createdAt?: string;
  reason?: string | null;
  marketplaceOrderItemId?: string | null;
};

function channelMeta(code: string, id?: string) {
  return {
    id: id ?? code,
    code,
    displayName: CHANNEL_LABELS[code] ?? code
  };
}

function mapArchiveOrder(row: {
  id: string;
  originalMarketplaceOrderId: string;
  channelId: string;
  channelCode: string;
  externalOrderId: string;
  orderDate: Date;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  shipToCountry: string | null;
  shipToPostalCode: string | null;
  status: string;
  source: string;
  notes: string | null;
  currency: string;
  grandTotalInPaise: number;
  items: unknown;
  returns: unknown;
  rawPayload: unknown;
  createdAt: Date;
  migratedAt: Date;
}) {
  const items = (Array.isArray(row.items) ? row.items : []) as ArchiveItem[];
  const returns = (Array.isArray(row.returns) ? row.returns : []) as ArchiveReturn[];
  const mappedItems = items.map((item, idx) => ({
    id: item.id ?? `${row.id}-item-${idx}`,
    skuSnapshot: item.skuSnapshot ?? "—",
    productNameSnapshot: item.productNameSnapshot ?? null,
    variantName: item.productNameSnapshot ?? item.skuSnapshot ?? null,
    quantity: item.quantity ?? 1,
    unitPriceInPaise: item.unitPriceInPaise ?? null,
    lineTotalInPaise: item.lineTotalInPaise ?? null,
    variantId: item.variantId ?? null,
    variantSku: item.variant?.sku ?? item.skuSnapshot ?? null,
    productName: item.variant?.productRel?.name ?? item.productNameSnapshot ?? null
  }));
  const totalItems = mappedItems.reduce((s, i) => s + i.quantity, 0);
  const totalValueInPaise =
    row.grandTotalInPaise ||
    mappedItems.reduce((s, i) => s + (i.lineTotalInPaise ?? (i.unitPriceInPaise ?? 0) * i.quantity), 0);

  return {
    id: row.id,
    channel: channelMeta(row.channelCode, row.channelId),
    externalOrderId: row.externalOrderId,
    orderDate: row.orderDate.toISOString(),
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    shipToCity: row.shipToCity,
    shipToState: row.shipToState,
    shipToCountry: row.shipToCountry,
    shipToPostalCode: row.shipToPostalCode,
    status: row.status,
    source: row.source,
    notes: row.notes,
    currency: row.currency,
    rawPayload: row.rawPayload as Record<string, unknown> | null,
    items: mappedItems,
    returns: returns.map((ret, idx) => ({
      id: ret.id ?? `${row.id}-ret-${idx}`,
      quantity: ret.quantity ?? 1,
      status: ret.status ?? "REQUESTED",
      refundedAmountInPaise: ret.refundedAmountInPaise ?? null,
      restockedToZoho: ret.restockedToZoho ?? false,
      createdAt: ret.createdAt ?? row.orderDate.toISOString()
    })),
    totalItems,
    totalValueInPaise,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.migratedAt.toISOString()
  };
}

function parseFrom(from?: string) {
  if (!from?.trim()) return null;
  const d = new Date(`${from.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTo(to?: string) {
  if (!to?.trim()) return null;
  const d = new Date(`${to.trim()}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadArchiveRows(params?: {
  channelCode?: string;
  search?: string;
  from?: string;
  to?: string;
}) {
  const from = parseFrom(params?.from);
  const to = parseTo(params?.to);
  return prisma.legacyMarketplaceOrderArchive.findMany({
    where: {
      ...(params?.channelCode ? { channelCode: params.channelCode.toUpperCase() } : {}),
      ...(from || to
        ? {
            orderDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {})
            }
          }
        : {}),
      ...(params?.search
        ? {
            OR: [
              { externalOrderId: { contains: params.search, mode: "insensitive" } },
              { customerName: { contains: params.search, mode: "insensitive" } },
              { customerEmail: { contains: params.search, mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: { orderDate: "desc" }
  });
}

export async function getLegacyMarketplaceOverview() {
  const rows = await prisma.legacyMarketplaceOrderArchive.findMany({
    orderBy: { orderDate: "desc" },
    take: 8
  });
  const grouped = await prisma.legacyMarketplaceOrderArchive.groupBy({
    by: ["channelCode", "status"],
    _count: { _all: true }
  });
  const channels = [...new Set(grouped.map((g) => g.channelCode))].sort();

  return {
    channels: channels.map((code) => {
      const orderCount = grouped.filter((g) => g.channelCode === code).reduce((s, g) => s + g._count._all, 0);
      const dispatchPending = grouped
        .filter((g) => g.channelCode === code && ["RECEIVED", "CONFIRMED"].includes(g.status))
        .reduce((s, g) => s + g._count._all, 0);
      return {
        id: code,
        code,
        displayName: CHANNEL_LABELS[code] ?? code,
        isActive: true,
        listingCount: 0,
        activeListingCount: 0,
        orderCount,
        dispatchPending,
        highRiskCount: 0
      };
    }),
    totals: {
      channels: channels.length,
      listings: 0,
      orders: grouped.reduce((s, g) => s + g._count._all, 0),
      returns: 0
    },
    recentOrders: rows.map(mapArchiveOrder),
    recentReturns: []
  };
}

export async function listLegacyMarketplaceOrders(params?: {
  channelCode?: string;
  search?: string;
  from?: string;
  to?: string;
}) {
  const rows = await loadArchiveRows(params);
  return { items: rows.map(mapArchiveOrder) };
}

export async function listLegacyMarketplaceReturns(params?: {
  channelCode?: string;
  search?: string;
  from?: string;
  to?: string;
}) {
  const rows = await loadArchiveRows(params);
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const returns = (Array.isArray(row.returns) ? row.returns : []) as ArchiveReturn[];
    const items = (Array.isArray(row.items) ? row.items : []) as ArchiveItem[];
    for (let i = 0; i < returns.length; i++) {
      const ret = returns[i]!;
      const item = items[i] ?? items[0];
      out.push({
        id: ret.id ?? `${row.id}-ret-${i}`,
        marketplaceOrderId: row.originalMarketplaceOrderId,
        marketplaceOrderItemId: ret.marketplaceOrderItemId ?? null,
        channel: channelMeta(row.channelCode, row.channelId),
        externalOrderId: row.externalOrderId,
        sku: item?.skuSnapshot ?? null,
        productName: item?.productNameSnapshot ?? null,
        variantName: item?.productNameSnapshot ?? item?.skuSnapshot ?? null,
        quantity: ret.quantity ?? 1,
        reason: ret.reason ?? null,
        status: ret.status ?? "REQUESTED",
        receivedAt: null,
        returnDate: row.orderDate.toISOString(),
        refundedAmountInPaise: ret.refundedAmountInPaise ?? null,
        currency: row.currency,
        restockedToZoho: ret.restockedToZoho ?? false,
        notes: row.notes,
        createdAt: ret.createdAt ?? row.createdAt.toISOString(),
        updatedAt: row.migratedAt.toISOString()
      });
    }
  }
  return { items: out };
}

export async function listLegacyMarketplaceListings() {
  return { items: [] as unknown[] };
}
