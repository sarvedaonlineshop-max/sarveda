import { MarketplaceOrderStatus, MarketplaceReturnStatus, Prisma } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { parseMarketplaceOrdersCsv } from "./marketplace-importers/orders-csv";
import type {
  MarketplaceChannelCodeInput,
  marketplaceEmailIngestSchema,
  marketplaceListingPatchSchema,
  marketplaceListingUpsertSchema,
  marketplaceOrderCreateSchema,
  marketplaceOrdersImportSchema,
  marketplaceReturnCreateSchema
} from "./marketplaces.schemas";

type MarketplaceListingInput = z.infer<typeof marketplaceListingUpsertSchema>;
type MarketplaceListingPatchInput = z.infer<typeof marketplaceListingPatchSchema>;
type MarketplaceOrderCreateInput = z.infer<typeof marketplaceOrderCreateSchema>;
type MarketplaceReturnCreateInput = z.infer<typeof marketplaceReturnCreateSchema>;
type MarketplaceOrdersImportInput = z.infer<typeof marketplaceOrdersImportSchema>;
type MarketplaceEmailIngestInput = z.infer<typeof marketplaceEmailIngestSchema>;

const marketplaceListingInclude = {
  channel: true,
  variant: {
    include: {
      productRel: true,
      inventory: true,
      attributeValues: {
        include: {
          attributeValue: {
            include: {
              attribute: true
            }
          }
        }
      }
    }
  }
} satisfies Prisma.MarketplaceListingInclude;

const marketplaceOrderInclude = {
  channel: true,
  items: {
    include: {
      variant: {
        include: {
          productRel: true,
          inventory: true,
          attributeValues: {
            include: {
              attributeValue: {
                include: {
                  attribute: true
                }
              }
            }
          }
        }
      }
    }
  },
  returns: true
} satisfies Prisma.MarketplaceOrderInclude;

const marketplaceReturnInclude = {
  marketplaceOrder: {
    include: {
      channel: true,
      items: {
        include: {
          variant: {
            include: {
              productRel: true,
              attributeValues: {
                include: {
                  attributeValue: {
                    include: {
                      attribute: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  marketplaceOrderItem: {
    include: {
      variant: {
        include: {
          productRel: true,
          attributeValues: {
            include: {
              attributeValue: {
                include: {
                  attribute: true
                }
              }
            }
          }
        }
      }
    }
  }
} satisfies Prisma.MarketplaceReturnInclude;

type ListingRow = Prisma.MarketplaceListingGetPayload<{ include: typeof marketplaceListingInclude }>;
type OrderRow = Prisma.MarketplaceOrderGetPayload<{ include: typeof marketplaceOrderInclude }>;
type ReturnRow = Prisma.MarketplaceReturnGetPayload<{ include: typeof marketplaceReturnInclude }>;

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDateInput(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw Object.assign(new Error(`Invalid date: ${value}`), { statusCode: 400, code: "VALIDATION" });
  }
  return d;
}

async function getChannelByCode(code: MarketplaceChannelCodeInput) {
  const channel = await prisma.marketplaceChannel.findUnique({ where: { code } });
  if (!channel) {
    throw Object.assign(new Error(`Marketplace channel ${code} not found`), {
      statusCode: 404,
      code: "NOT_FOUND"
    });
  }
  return channel;
}

function startFromDate(from?: string): Date | undefined {
  if (!from) return undefined;
  const d = new Date(`${from}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function endToDate(to?: string): Date | undefined {
  if (!to) return undefined;
  const d = new Date(`${to}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function variantDisplayName(row: {
  attributeValues?: Array<{
    attributeValue: {
      value: string;
    };
  }>;
  sku?: string;
}) {
  const values = row.attributeValues?.map((entry) => entry.attributeValue.value).filter(Boolean) ?? [];
  return values.length ? values.join(" / ") : row.sku ?? "Default";
}

function listingPriceFromNotes(notes?: string | null): number | null {
  if (!notes) return null;
  const match = notes.match(/price\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

/** Marketplace-native currency for display (retain source marketplace money). */
function marketplaceCurrency(
  channelCode: string,
  rawPayload?: unknown
): string {
  const defaults: Record<string, string> = {
    ETSY: "USD",
    AMAZON: "INR",
    FLIPKART: "INR",
    AMALA: "INR",
    FIRSTCRY: "INR",
    TATA_1MG: "INR",
    SARVEDA: "INR"
  };

  if (rawPayload && typeof rawPayload === "object") {
    const payload = rawPayload as Record<string, unknown>;
    const receipt = (payload.receipt ?? payload.order ?? payload) as Record<string, unknown>;
    const moneyCandidates = [
      (receipt?.grandtotal as { currency_code?: string } | undefined)?.currency_code,
      (receipt?.total_price as { currency_code?: string } | undefined)?.currency_code,
      ((receipt?.OrderTotal as { CurrencyCode?: string } | undefined)?.CurrencyCode),
      ((payload.transactions as Array<{ price?: { currency_code?: string } }> | undefined)?.[0]?.price
        ?.currency_code),
      ((receipt?.transactions as Array<{ price?: { currency_code?: string } }> | undefined)?.[0]?.price
        ?.currency_code)
    ];
    for (const code of moneyCandidates) {
      if (typeof code === "string" && code.trim()) return code.trim().toUpperCase();
    }
  }

  return defaults[channelCode] ?? "INR";
}

function mapListing(row: ListingRow, stats?: { soldQty: number; returnQty: number }) {
  const available = Math.max(0, (row.variant.inventory?.onHand ?? 0) - (row.variant.inventory?.reserved ?? 0));
  const recentSold = stats?.soldQty ?? 0;
  const recentReturns = stats?.returnQty ?? 0;
  const stockRisk =
    available <= 0
      ? "out"
      : recentSold >= available
        ? "high"
        : recentSold >= Math.max(1, Math.floor(available / 2))
          ? "watch"
          : "ok";

  return {
    id: row.id,
    channel: {
      id: row.channel.id,
      code: row.channel.code,
      displayName: row.channel.displayName,
      isActive: row.channel.isActive
    },
    variant: {
      id: row.variant.id,
      sku: row.variant.sku,
      variantName: variantDisplayName(row.variant),
      productId: row.variant.productRel.id,
      productName: row.variant.productRel.name,
      productSlug: row.variant.productRel.slug
    },
    listingId: row.listingId,
    externalSku: row.externalSku,
    sellerSku: row.sellerSku,
    status: row.status,
    isTracked: row.isTracked,
    notes: row.notes,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    zohoOnHand: row.variant.inventory?.onHand ?? 0,
    zohoReserved: row.variant.inventory?.reserved ?? 0,
    available,
    priceInPaise: listingPriceFromNotes(row.notes),
    currency: marketplaceCurrency(row.channel.code),
    recentSoldQty: recentSold,
    recentReturnQty: recentReturns,
    stockRisk,
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapOrder(row: OrderRow) {
  const totalItems = row.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValueInPaise = row.items.reduce(
    (sum, item) => sum + (item.lineTotalInPaise ?? (item.unitPriceInPaise ?? 0) * item.quantity),
    0
  );
  const currency = marketplaceCurrency(row.channel.code, row.rawPayload);
  return {
    id: row.id,
    channel: {
      id: row.channel.id,
      code: row.channel.code,
      displayName: row.channel.displayName
    },
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
    currency,
    rawPayload: row.rawPayload,
    items: row.items.map((item) => ({
      id: item.id,
      skuSnapshot: item.skuSnapshot,
      productNameSnapshot: item.productNameSnapshot,
      variantName: item.variant ? variantDisplayName(item.variant) : null,
      quantity: item.quantity,
      unitPriceInPaise: item.unitPriceInPaise,
      lineTotalInPaise: item.lineTotalInPaise,
      variantId: item.variantId,
      variantSku: item.variant?.sku ?? null,
      productName: item.variant?.productRel.name ?? null
    })),
    returns: row.returns.map((ret) => ({
      id: ret.id,
      quantity: ret.quantity,
      status: ret.status,
      refundedAmountInPaise: ret.refundedAmountInPaise,
      restockedToZoho: ret.restockedToZoho,
      createdAt: ret.createdAt.toISOString()
    })),
    totalItems,
    totalValueInPaise,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapReturn(row: ReturnRow) {
  const fallbackItem = row.marketplaceOrder.items[0] ?? null;
  const item = row.marketplaceOrderItem ?? fallbackItem;

  const raw = (row.rawPayload ?? {}) as {
    created_timestamp?: number;
    title?: string;
    reason?: string;
    item_name?: string;
    product_name?: string;
    return_request_date?: string;
    return_date?: string;
    refund_date?: string;
    order_date?: string;
  };
  const receiptPayload = (row.marketplaceOrder.rawPayload ?? {}) as {
    receipt?: { created_timestamp?: number; updated_timestamp?: number };
  };

  const parseLooseDate = (value?: string | null) => {
    if (!value?.trim()) return null;
    const ms = Date.parse(value.trim());
    return Number.isFinite(ms) ? new Date(ms) : null;
  };

  const payloadDate =
    raw.created_timestamp != null
      ? new Date(raw.created_timestamp * 1000)
      : parseLooseDate(raw.return_request_date) ??
        parseLooseDate(raw.return_date) ??
        parseLooseDate(raw.refund_date) ??
        parseLooseDate(raw.order_date) ??
        (receiptPayload.receipt?.updated_timestamp != null
          ? new Date(receiptPayload.receipt.updated_timestamp * 1000)
          : receiptPayload.receipt?.created_timestamp != null
            ? new Date(receiptPayload.receipt.created_timestamp * 1000)
            : null);

  const returnDate = row.receivedAt ?? payloadDate ?? row.marketplaceOrder.orderDate ?? row.createdAt;

  const productFromPayload =
    (typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null) ||
    (typeof raw.item_name === "string" && raw.item_name.trim() ? raw.item_name.trim() : null) ||
    (typeof raw.product_name === "string" && raw.product_name.trim() ? raw.product_name.trim() : null);

  return {
    id: row.id,
    marketplaceOrderId: row.marketplaceOrderId,
    marketplaceOrderItemId: row.marketplaceOrderItemId,
    channel: {
      id: row.marketplaceOrder.channel.id,
      code: row.marketplaceOrder.channel.code,
      displayName: row.marketplaceOrder.channel.displayName
    },
    externalOrderId: row.marketplaceOrder.externalOrderId,
    sku: item?.skuSnapshot ?? null,
    productName:
      item?.variant?.productRel.name ?? item?.productNameSnapshot ?? productFromPayload ?? null,
    variantName: item?.variant ? variantDisplayName(item.variant) : item?.skuSnapshot ?? null,
    quantity: row.quantity,
    reason: row.reason,
    status: row.status,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    returnDate: returnDate.toISOString(),
    refundedAmountInPaise: row.refundedAmountInPaise,
    currency: marketplaceCurrency(row.marketplaceOrder.channel.code, row.marketplaceOrder.rawPayload ?? row.rawPayload),
    restockedToZoho: row.restockedToZoho,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function recentStatsByListing(listings: ListingRow[]) {
  if (listings.length === 0) return new Map<string, { soldQty: number; returnQty: number }>();
  const variantIds = [...new Set(listings.map((l) => l.variantId))];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const [orderItems, returns] = await Promise.all([
    prisma.marketplaceOrderItem.findMany({
      where: {
        variantId: { in: variantIds },
        marketplaceOrder: {
          orderDate: { gte: since },
          status: { not: "CANCELLED" }
        }
      },
      select: {
        variantId: true,
        quantity: true,
        marketplaceOrder: { select: { channelId: true } }
      }
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
        marketplaceOrder: { select: { channelId: true } },
        marketplaceOrderItem: { select: { variantId: true } }
      }
    })
  ]);

  const keyed = new Map<string, { soldQty: number; returnQty: number }>();
  for (const row of listings) {
    keyed.set(`${row.channelId}:${row.variantId}`, { soldQty: 0, returnQty: 0 });
  }
  for (const row of orderItems) {
    if (!row.variantId) continue;
    const key = `${row.marketplaceOrder.channelId}:${row.variantId}`;
    const cur = keyed.get(key);
    if (cur) cur.soldQty += row.quantity;
  }
  for (const row of returns) {
    const variantId = row.marketplaceOrderItem?.variantId;
    if (!variantId) continue;
    const key = `${row.marketplaceOrder.channelId}:${variantId}`;
    const cur = keyed.get(key);
    if (cur) cur.returnQty += row.quantity;
  }
  return keyed;
}

async function findVariantBySku(sku: string) {
  return prisma.productVariant.findUnique({
    where: { sku },
    select: {
      id: true,
      sku: true,
      productRel: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

function aggregateRowsByOrder(input: MarketplaceOrdersImportInput, rows: ReturnType<typeof parseMarketplaceOrdersCsv>) {
  const byOrder = new Map<string, MarketplaceOrderCreateInput>();
  for (const row of rows) {
    const existing = byOrder.get(row.externalOrderId);
    const item = {
      sku: row.sku,
      quantity: row.quantity,
      unitPriceInPaise: row.unitPriceInPaise,
      productName: row.productName
    };
    if (existing) {
      existing.items.push(item);
      if (!existing.notes && row.notes) existing.notes = row.notes;
      continue;
    }
    byOrder.set(row.externalOrderId, {
      channelCode: input.channelCode,
      externalOrderId: row.externalOrderId,
      orderDate: row.orderDate,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      shipToCity: row.shipToCity,
      shipToState: row.shipToState,
      shipToCountry: row.shipToCountry,
      shipToPostalCode: row.shipToPostalCode,
      source: "CSV_IMPORT",
      status: "RECEIVED",
      notes: row.notes,
      rawPayload: null,
      items: [item]
    });
  }
  return [...byOrder.values()];
}

export async function getMarketplaceOverview() {
  const [channels, listingsCount, ordersAgg, returnsAgg, recentOrders, recentReturns, activeListings] =
    await Promise.all([
      prisma.marketplaceChannel.findMany({ orderBy: { displayName: "asc" } }),
      prisma.marketplaceListing.groupBy({
        by: ["channelId", "status"],
        _count: { _all: true }
      }),
      prisma.marketplaceOrder.groupBy({
        by: ["channelId", "status"],
        _count: { _all: true }
      }),
      prisma.marketplaceReturn.groupBy({
        by: ["marketplaceOrderId", "status"],
        _count: { _all: true }
      }),
      prisma.marketplaceOrder.findMany({
        orderBy: { orderDate: "desc" },
        take: 8,
        include: marketplaceOrderInclude
      }),
      prisma.marketplaceReturn.findMany({
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: 8,
        include: marketplaceReturnInclude
      }),
      prisma.marketplaceListing.findMany({
        where: { status: "ACTIVE", isTracked: true },
        include: marketplaceListingInclude
      })
    ]);

  const listingStats = await recentStatsByListing(activeListings);

  return {
    channels: channels.map((channel) => {
      const listingCount = listingsCount
        .filter((row) => row.channelId === channel.id)
        .reduce((sum, row) => sum + row._count._all, 0);
      const activeCount = listingsCount
        .filter((row) => row.channelId === channel.id && row.status === "ACTIVE")
        .reduce((sum, row) => sum + row._count._all, 0);
      const orderCount = ordersAgg
        .filter((row) => row.channelId === channel.id)
        .reduce((sum, row) => sum + row._count._all, 0);
      const dispatchPending = ordersAgg
        .filter((row) => row.channelId === channel.id && ["RECEIVED", "CONFIRMED"].includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);
      const channelListingRows = activeListings.filter((row) => row.channelId === channel.id);
      const highRiskCount = channelListingRows.filter((row) => {
        const stats = listingStats.get(`${row.channelId}:${row.variantId}`);
        const available = Math.max(0, (row.variant.inventory?.onHand ?? 0) - (row.variant.inventory?.reserved ?? 0));
        return (stats?.soldQty ?? 0) >= Math.max(1, available);
      }).length;
      return {
        id: channel.id,
        code: channel.code,
        displayName: channel.displayName,
        isActive: channel.isActive,
        listingCount,
        activeListingCount: activeCount,
        orderCount,
        dispatchPending,
        highRiskCount
      };
    }),
    totals: {
      channels: channels.length,
      listings: listingsCount.reduce((sum, row) => sum + row._count._all, 0),
      orders: ordersAgg.reduce((sum, row) => sum + row._count._all, 0),
      returns: returnsAgg.reduce((sum, row) => sum + row._count._all, 0)
    },
    recentOrders: recentOrders.map(mapOrder),
    recentReturns: recentReturns.map(mapReturn)
  };
}

export async function listMarketplaceListings(params?: {
  channelCode?: MarketplaceChannelCodeInput;
  status?: "ACTIVE" | "PAUSED" | "DELISTED";
  search?: string;
}) {
  const rows = await prisma.marketplaceListing.findMany({
    where: {
      ...(params?.channelCode ? { channel: { code: params.channelCode } } : {}),
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.search
        ? {
            OR: [
              { variant: { sku: { contains: params.search, mode: "insensitive" } } },
              { variant: { productRel: { name: { contains: params.search, mode: "insensitive" } } } },
              { sellerSku: { contains: params.search, mode: "insensitive" } },
              { externalSku: { contains: params.search, mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: [{ updatedAt: "desc" }],
    include: marketplaceListingInclude
  });
  const stats = await recentStatsByListing(rows);
  return {
    items: rows.map((row) => mapListing(row, stats.get(`${row.channelId}:${row.variantId}`)))
  };
}

export async function upsertMarketplaceListing(input: MarketplaceListingInput) {
  const channel = await getChannelByCode(input.channelCode);
  const variantId =
    input.variantId ??
    (
      await prisma.productVariant.findUnique({
        where: { sku: String(input.sku).trim() },
        select: { id: true }
      })
    )?.id;
  if (!variantId) {
    throw Object.assign(new Error(`Variant not found for SKU ${input.sku ?? input.variantId}`), {
      statusCode: 404,
      code: "NOT_FOUND"
    });
  }
  const data = {
    listingId: normalizeText(input.listingId),
    externalSku: normalizeText(input.externalSku),
    sellerSku: normalizeText(input.sellerSku),
    status: input.status ?? "ACTIVE",
    isTracked: input.isTracked ?? true,
    notes: normalizeText(input.notes),
    lastSyncedAt: new Date()
  };
  const row = await prisma.marketplaceListing.upsert({
    where: {
      channelId_variantId: {
        channelId: channel.id,
        variantId
      }
    },
    create: {
      channelId: channel.id,
      variantId,
      ...data
    },
    update: data,
    include: marketplaceListingInclude
  });
  const stats = await recentStatsByListing([row]);
  return mapListing(row, stats.get(`${row.channelId}:${row.variantId}`));
}

export async function patchMarketplaceListing(id: string, input: MarketplaceListingPatchInput) {
  const row = await prisma.marketplaceListing.update({
    where: { id },
    data: {
      ...(input.listingId !== undefined ? { listingId: normalizeText(input.listingId) } : {}),
      ...(input.externalSku !== undefined ? { externalSku: normalizeText(input.externalSku) } : {}),
      ...(input.sellerSku !== undefined ? { sellerSku: normalizeText(input.sellerSku) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.isTracked !== undefined ? { isTracked: input.isTracked } : {}),
      ...(input.notes !== undefined ? { notes: normalizeText(input.notes) } : {}),
      lastSyncedAt: new Date()
    },
    include: marketplaceListingInclude
  });
  const stats = await recentStatsByListing([row]);
  return mapListing(row, stats.get(`${row.channelId}:${row.variantId}`));
}

export async function listMarketplaceOrders(params?: {
  channelCode?: MarketplaceChannelCodeInput;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
}) {
  const rows = await prisma.marketplaceOrder.findMany({
    where: {
      ...(params?.channelCode ? { channel: { code: params.channelCode } } : {}),
      ...(params?.status ? { status: params.status as MarketplaceOrderStatus } : {}),
      ...(params?.search
        ? {
            OR: [
              { externalOrderId: { contains: params.search, mode: "insensitive" } },
              { customerName: { contains: params.search, mode: "insensitive" } },
              { customerEmail: { contains: params.search, mode: "insensitive" } },
              { items: { some: { skuSnapshot: { contains: params.search, mode: "insensitive" } } } }
            ]
          }
        : {}),
      ...(params?.from || params?.to
        ? {
            orderDate: {
              ...(startFromDate(params.from) ? { gte: startFromDate(params.from) } : {}),
              ...(endToDate(params.to) ? { lte: endToDate(params.to) } : {})
            }
          }
        : {})
    },
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    include: marketplaceOrderInclude
  });
  return { items: rows.map(mapOrder) };
}

export async function createMarketplaceOrder(input: MarketplaceOrderCreateInput) {
  const channel = await getChannelByCode(input.channelCode);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceOrder.findUnique({
      where: {
        channelId_externalOrderId: {
          channelId: channel.id,
          externalOrderId: input.externalOrderId
        }
      }
    });
    if (existing) {
      throw Object.assign(new Error(`Order ${input.externalOrderId} already exists for ${channel.displayName}`), {
        statusCode: 409,
        code: "DUPLICATE"
      });
    }

    const resolvedItems = [];
    for (const item of input.items) {
      const variant = await tx.productVariant.findUnique({
        where: { sku: item.sku },
        include: { productRel: true }
      });
      resolvedItems.push({
        variantId: variant?.id ?? null,
        skuSnapshot: item.sku,
        productNameSnapshot: item.productName ?? variant?.productRel.name ?? null,
        quantity: item.quantity,
        unitPriceInPaise: item.unitPriceInPaise ?? null,
        lineTotalInPaise:
          item.unitPriceInPaise !== undefined && item.unitPriceInPaise !== null
            ? item.unitPriceInPaise * item.quantity
            : null
      });
    }

    const row = await tx.marketplaceOrder.create({
      data: {
        channelId: channel.id,
        externalOrderId: input.externalOrderId,
        orderDate: parseDateInput(input.orderDate),
        customerName: normalizeText(input.customerName),
        customerEmail: normalizeText(input.customerEmail),
        customerPhone: normalizeText(input.customerPhone),
        shipToCity: normalizeText(input.shipToCity),
        shipToState: normalizeText(input.shipToState),
        shipToCountry: normalizeText(input.shipToCountry),
        shipToPostalCode: normalizeText(input.shipToPostalCode),
        status: input.status ?? "RECEIVED",
        source: input.source ?? "MANUAL",
        notes: normalizeText(input.notes),
        rawPayload: input.rawPayload ?? undefined,
        items: { create: resolvedItems }
      },
      include: marketplaceOrderInclude
    });
    return mapOrder(row);
  });
}

export async function createMarketplaceReturn(input: MarketplaceReturnCreateInput) {
  const row = await prisma.marketplaceReturn.create({
    data: {
      marketplaceOrderId: input.marketplaceOrderId,
      marketplaceOrderItemId: input.marketplaceOrderItemId ?? null,
      quantity: input.quantity,
      reason: normalizeText(input.reason),
      status: input.status ?? "REQUESTED",
      receivedAt: input.receivedAt ? parseDateInput(input.receivedAt) : null,
      refundedAmountInPaise: input.refundedAmountInPaise ?? null,
      restockedToZoho: input.restockedToZoho ?? false,
      notes: normalizeText(input.notes),
      rawPayload: input.rawPayload ?? undefined
    },
    include: marketplaceReturnInclude
  });
  return mapReturn(row);
}

export async function listMarketplaceReturns(params?: {
  channelCode?: MarketplaceChannelCodeInput;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
}) {
  const rows = await prisma.marketplaceReturn.findMany({
    where: {
      ...(params?.channelCode ? { marketplaceOrder: { channel: { code: params.channelCode } } } : {}),
      ...(params?.status ? { status: params.status as MarketplaceReturnStatus } : {}),
      ...(params?.search
        ? {
            OR: [
              { reason: { contains: params.search, mode: "insensitive" } },
              { marketplaceOrder: { externalOrderId: { contains: params.search, mode: "insensitive" } } },
              { marketplaceOrderItem: { skuSnapshot: { contains: params.search, mode: "insensitive" } } }
            ]
          }
        : {}),
      ...(params?.from || params?.to
        ? {
            OR: [
              {
                receivedAt: {
                  ...(startFromDate(params.from) ? { gte: startFromDate(params.from) } : {}),
                  ...(endToDate(params.to) ? { lte: endToDate(params.to) } : {})
                }
              },
              {
                receivedAt: null,
                marketplaceOrder: {
                  orderDate: {
                    ...(startFromDate(params.from) ? { gte: startFromDate(params.from) } : {}),
                    ...(endToDate(params.to) ? { lte: endToDate(params.to) } : {})
                  }
                }
              }
            ]
          }
        : {})
    },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    include: marketplaceReturnInclude
  });
  return { items: rows.map(mapReturn) };
}

export async function importMarketplaceOrders(input: MarketplaceOrdersImportInput) {
  const parsed = parseMarketplaceOrdersCsv(input.channelCode, input.csvText);
  const orders = aggregateRowsByOrder(input, parsed);
  let imported = 0;
  let duplicates = 0;
  let unresolvedItems = 0;

  for (const order of orders) {
    try {
      const created = await createMarketplaceOrder(order);
      unresolvedItems += created.items.filter((item) => !item.variantId).length;
      imported++;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "DUPLICATE") {
        duplicates++;
        continue;
      }
      logger.error("marketplace_import_order_failed", {
        channelCode: input.channelCode,
        externalOrderId: order.externalOrderId,
        err
      });
      throw err;
    }
  }

  return {
    parsedRows: parsed.length,
    importedOrders: imported,
    duplicateOrders: duplicates,
    unresolvedItems
  };
}

export async function createMarketplaceEmailEvent(input: MarketplaceEmailIngestInput) {
  const channel = await getChannelByCode(input.channelCode);
  const row = await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "EMAIL_NOTIFICATION",
      source: "EMAIL",
      dedupeKey: normalizeText(input.dedupeKey),
      rawPayload: {
        subject: input.subject,
        bodyText: input.bodyText,
        metadata: input.metadata ?? null
      }
    }
  });
  return {
    id: row.id,
    channelCode: channel.code,
    eventType: row.eventType,
    source: row.source,
    dedupeKey: row.dedupeKey,
    processedAt: row.processedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export async function listMarketplaceInbox(params?: { channelCode?: MarketplaceChannelCodeInput; limit?: number }) {
  const rows = await prisma.marketplaceEventLog.findMany({
    where: {
      ...(params?.channelCode ? { channel: { code: params.channelCode } } : {}),
      source: "EMAIL"
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, params?.limit ?? 50)),
    include: { channel: true }
  });

  return {
    items: rows.map((row) => ({
      id: row.id,
      channel: {
        id: row.channel.id,
        code: row.channel.code,
        displayName: row.channel.displayName
      },
      eventType: row.eventType,
      source: row.source,
      dedupeKey: row.dedupeKey,
      processedAt: row.processedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      rawPayload: row.rawPayload
    }))
  };
}

export async function getMarketplaceAnalytics(params?: {
  from?: string;
  to?: string;
  channelCode?: MarketplaceChannelCodeInput;
}) {
  const where = {
    ...(params?.channelCode ? { channel: { code: params.channelCode } } : {}),
    ...(params?.from || params?.to
      ? {
          orderDate: {
            ...(startFromDate(params.from) ? { gte: startFromDate(params.from) } : {}),
            ...(endToDate(params.to) ? { lte: endToDate(params.to) } : {})
          }
        }
      : {})
  } satisfies Prisma.MarketplaceOrderWhereInput;

  const [orders, returns, channels] = await Promise.all([
    prisma.marketplaceOrder.findMany({ where, include: marketplaceOrderInclude }),
    prisma.marketplaceReturn.findMany({
      where: {
        marketplaceOrder: where
      },
      include: marketplaceReturnInclude
    }),
    prisma.marketplaceChannel.findMany({ orderBy: { displayName: "asc" } })
  ]);

  const byChannel = channels.map((channel) => {
    const channelOrders = orders.filter((order) => order.channelId === channel.id);
    const channelReturns = returns.filter((ret) => ret.marketplaceOrder.channelId === channel.id);
    const unitsSold = channelOrders.reduce(
      (sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0),
      0
    );
    const orderValueInPaise = channelOrders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (n, item) => n + (item.lineTotalInPaise ?? (item.unitPriceInPaise ?? 0) * item.quantity),
          0
        ),
      0
    );
    const returnQty = channelReturns.reduce((sum, ret) => sum + ret.quantity, 0);
    const refundValueInPaise = channelReturns.reduce((sum, ret) => sum + (ret.refundedAmountInPaise ?? 0), 0);
    return {
      channelId: channel.id,
      code: channel.code,
      displayName: channel.displayName,
      orders: channelOrders.length,
      unitsSold,
      orderValueInPaise,
      returns: channelReturns.length,
      returnQty,
      refundValueInPaise,
      pendingDispatch: channelOrders.filter((o) => ["RECEIVED", "CONFIRMED"].includes(o.status)).length
    };
  });

  const skuAgg = new Map<string, { sku: string; productName: string | null; unitsSold: number; orderValueInPaise: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const key = item.skuSnapshot;
      const cur = skuAgg.get(key) ?? {
        sku: item.skuSnapshot,
        productName: item.variant?.productRel.name ?? item.productNameSnapshot ?? null,
        unitsSold: 0,
        orderValueInPaise: 0
      };
      cur.unitsSold += item.quantity;
      cur.orderValueInPaise += item.lineTotalInPaise ?? (item.unitPriceInPaise ?? 0) * item.quantity;
      skuAgg.set(key, cur);
    }
  }

  return {
    totals: {
      orders: orders.length,
      returns: returns.length,
      unitsSold: orders.reduce(
        (sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0),
        0
      ),
      refundValueInPaise: returns.reduce((sum, ret) => sum + (ret.refundedAmountInPaise ?? 0), 0)
    },
    byChannel,
    topSkus: [...skuAgg.values()]
      .sort((a, b) => b.unitsSold - a.unitsSold || b.orderValueInPaise - a.orderValueInPaise)
      .slice(0, 20)
  };
}
