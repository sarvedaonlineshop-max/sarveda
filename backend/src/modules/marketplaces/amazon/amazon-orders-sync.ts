import { MarketplaceOrderStatus, Prisma } from "@prisma/client";
import type { z } from "zod";

import { isAmazonSpConfigured, amazonEnv } from "../../../config/amazon";
import { prisma } from "../../../config/db";
import { logger } from "../../../config/logger";
import type { amazonOrdersSyncSchema } from "../marketplaces.schemas";
import { listAllAmazonOrders, listAmazonOrderItems, getRestrictedDataToken, getOrderWithPII, type AmazonOrder, type AmazonOrderItem } from "./amazon-sp-client";
import {
  buildAmazonMonthWindows,
  syncAmazonListingsReport,
  syncAmazonReturnsReportWindow
} from "./amazon-reports";

type SyncInput = z.infer<typeof amazonOrdersSyncSchema>;

const DEFAULT_OPEN_STATUSES = ["Unshipped", "PartiallyShipped", "Pending"];
let syncRunning = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mapAmazonStatus(orderStatus?: string): MarketplaceOrderStatus {
  switch ((orderStatus ?? "").toLowerCase()) {
    case "shipped":
      return "DISPATCHED";
    case "canceled":
    case "cancelled":
    case "unfulfillable":
      return "CANCELLED";
    case "unshipped":
    case "partiallyshipped":
      return "CONFIRMED";
    case "pending":
    case "pendingavailability":
    case "invoiceunconfirmed":
    default:
      return "RECEIVED";
  }
}

function amountToPaise(amount?: string): number | null {
  if (!amount) return null;
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function createdAfterIso(input: SyncInput): string {
  if (input.createdAfter) return input.createdAfter;
  const days = input.daysBack ?? 730;
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Amazon rejects CreatedAfter too close to now sometimes; floor to second.
  d.setMilliseconds(0);
  return d.toISOString();
}

async function resolveVariantId(
  tx: Prisma.TransactionClient,
  channelId: string,
  sellerSku: string | undefined,
  asin: string | undefined
): Promise<string | null> {
  const sku = sellerSku?.trim();
  if (sku) {
    const bySku = await tx.productVariant.findUnique({
      where: { sku },
      select: { id: true }
    });
    if (bySku) return bySku.id;

    const byListingSku = await tx.marketplaceListing.findFirst({
      where: {
        channelId,
        OR: [{ sellerSku: sku }, { externalSku: sku }]
      },
      select: { variantId: true }
    });
    if (byListingSku) return byListingSku.variantId;
  }

  if (asin?.trim()) {
    const byAsin = await tx.marketplaceListing.findFirst({
      where: {
        channelId,
        OR: [{ listingId: asin.trim() }, { externalSku: asin.trim() }]
      },
      select: { variantId: true }
    });
    if (byAsin) return byAsin.variantId;
  }

  return null;
}

async function upsertAmazonOrder(channelId: string, order: AmazonOrder, items: AmazonOrderItem[]) {
  const externalOrderId = order.AmazonOrderId;
  const status = mapAmazonStatus(order.OrderStatus);
  const orderDate = new Date(order.PurchaseDate ?? order.LastUpdateDate ?? Date.now());
  const ship = order.ShippingAddress;
  const buyer = order.BuyerInfo;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceOrder.findUnique({
      where: {
        channelId_externalOrderId: { channelId, externalOrderId }
      },
      include: { items: true }
    });

    const resolvedItems: Array<{
      variantId: string | null;
      skuSnapshot: string;
      productNameSnapshot: string | null;
      quantity: number;
      unitPriceInPaise: number | null;
      lineTotalInPaise: number | null;
    }> = [];

    for (const item of items) {
      const qty = Math.max(1, item.QuantityOrdered ?? 1);
      const lineTotal = amountToPaise(item.ItemPrice?.Amount);
      const unit =
        lineTotal !== null && qty > 0 ? Math.round(lineTotal / qty) : null;
      const skuSnapshot = (item.SellerSKU ?? item.ASIN ?? "UNKNOWN").trim() || "UNKNOWN";
      const variantId = await resolveVariantId(tx, channelId, item.SellerSKU, item.ASIN);
      resolvedItems.push({
        variantId,
        skuSnapshot,
        productNameSnapshot: item.Title?.trim() || null,
        quantity: qty,
        unitPriceInPaise: unit,
        lineTotalInPaise: lineTotal
      });
    }

    const orderData = {
      orderDate,
      customerName: buyer?.BuyerName?.trim() || ship?.Name?.trim() || null,
      customerEmail: buyer?.BuyerEmail?.trim() || null,
      customerPhone: ship?.Phone?.trim() || null,
      shipToCity: ship?.City?.trim() || null,
      shipToState: ship?.StateOrRegion?.trim() || null,
      shipToCountry: ship?.CountryCode?.trim() || null,
      shipToPostalCode: ship?.PostalCode?.trim() || null,
      status,
      source: "API" as const,
      rawPayload: { order, items } as Prisma.InputJsonValue,
      notes: [
        order.FulfillmentChannel ? `Fulfillment: ${order.FulfillmentChannel}` : null,
        order.SalesChannel ? `Channel: ${order.SalesChannel}` : null,
        order.OrderStatus ? `Amazon status: ${order.OrderStatus}` : null
      ]
        .filter(Boolean)
        .join(" · "),
      dispatchedAt: status === "DISPATCHED" ? new Date(order.LastUpdateDate ?? Date.now()) : null,
      cancelledAt: status === "CANCELLED" ? new Date(order.LastUpdateDate ?? Date.now()) : null
    };

    if (!existing) {
      await tx.marketplaceOrder.create({
        data: {
          channelId,
          externalOrderId,
          ...orderData,
          items: { create: resolvedItems }
        }
      });
      return { action: "created" as const, unresolvedItems: resolvedItems.filter((i) => !i.variantId).length };
    }

    await tx.marketplaceOrder.update({
      where: { id: existing.id },
      data: orderData
    });

    // Refresh line items when Amazon returns a fuller set than we have (first sync often empty).
    if (resolvedItems.length > 0 && (existing.items.length === 0 || existing.items.length !== resolvedItems.length)) {
      await tx.marketplaceOrderItem.deleteMany({ where: { marketplaceOrderId: existing.id } });
      await tx.marketplaceOrderItem.createMany({
        data: resolvedItems.map((item) => ({
          marketplaceOrderId: existing.id,
          ...item
        }))
      });
    }

    return { action: "updated" as const, unresolvedItems: resolvedItems.filter((i) => !i.variantId).length };
  });
}

export function getAmazonConnectionStatus() {
  return {
    configured: isAmazonSpConfigured(),
    marketplaceId: amazonEnv.AMAZON_SP_MARKETPLACE_ID,
    region: amazonEnv.AMAZON_SP_REGION,
    autoSyncEnabled: true,
    syncRunning,
    missing: [
      !amazonEnv.AMAZON_SP_CLIENT_ID ? "AMAZON_SP_CLIENT_ID" : null,
      !amazonEnv.AMAZON_SP_CLIENT_SECRET ? "AMAZON_SP_CLIENT_SECRET" : null,
      !amazonEnv.AMAZON_SP_REFRESH_TOKEN ? "AMAZON_SP_REFRESH_TOKEN" : null
    ].filter(Boolean) as string[]
  };
}

export async function syncAmazonOrders(input: SyncInput = {}) {
  if (!isAmazonSpConfigured()) {
    throw Object.assign(
      new Error(
        "Amazon SP-API is not configured. Set AMAZON_SP_CLIENT_ID, AMAZON_SP_CLIENT_SECRET, and AMAZON_SP_REFRESH_TOKEN on the backend."
      ),
      { statusCode: 503, code: "AMAZON_NOT_CONFIGURED" }
    );
  }

  const channel = await prisma.marketplaceChannel.findUnique({ where: { code: "AMAZON" } });
  if (!channel) {
    throw Object.assign(new Error("Amazon marketplace channel not seeded"), {
      statusCode: 404,
      code: "NOT_FOUND"
    });
  }

  const createdAfter = createdAfterIso(input);
  const orderStatuses =
    input.orderStatuses && input.orderStatuses.length > 0
      ? input.orderStatuses
      : input.includeShipped
        ? undefined
        : DEFAULT_OPEN_STATUSES;

  const amazonOrders = await listAllAmazonOrders({
    createdAfter,
    createdBefore: input.createdBefore,
    orderStatuses,
    maxPages: input.maxPages ?? 20
  });

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Enrich orders with buyer PII via Restricted Data Token (batches of 5)
  const RDT_BATCH = 5;
  for (let i = 0; i < amazonOrders.length; i += RDT_BATCH) {
    const batch = amazonOrders.slice(i, i + RDT_BATCH);
    const ids = batch.map((o) => o.AmazonOrderId);
    const rdtToken = await getRestrictedDataToken(ids);
    if (rdtToken) {
      for (let j = 0; j < batch.length; j++) {
        const enriched = await getOrderWithPII(batch[j].AmazonOrderId, rdtToken);
        if (enriched) {
          if (enriched.BuyerInfo) batch[j].BuyerInfo = enriched.BuyerInfo;
          if (enriched.ShippingAddress) batch[j].ShippingAddress = enriched.ShippingAddress;
        }
        await delay(2000);
      }
    }
    await delay(3000);
  }

  let created = 0;
  let updated = 0;
  let unresolvedItems = 0;
  let errors = 0;
  const messages: string[] = [];

  for (const order of amazonOrders) {
    try {
      const items = await listAmazonOrderItems(order.AmazonOrderId);
      const result = await upsertAmazonOrder(channel.id, order, items);
      if (result.action === "created") created += 1;
      else updated += 1;
      unresolvedItems += result.unresolvedItems;
      await delay(2000);
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : "unknown error";
      messages.push(`${order.AmazonOrderId}: ${msg}`);
      logger.error("Amazon order upsert failed", { amazonOrderId: order.AmazonOrderId, err: msg });
    }
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "amazon.orders.sync",
      source: "API",
      dedupeKey: `amazon-sync:${createdAfter}:${Date.now()}`,
      rawPayload: {
        createdAfter,
        createdBefore: input.createdBefore ?? null,
        orderStatuses: orderStatuses ?? "ALL",
        fetched: amazonOrders.length,
        created,
        updated,
        unresolvedItems,
        errors,
        messages: messages.slice(0, 20)
      },
      processedAt: new Date()
    }
  });

  logger.info("Amazon orders sync completed", {
    fetched: amazonOrders.length,
    created,
    updated,
    unresolvedItems,
    errors,
    createdAfter,
    createdBefore: input.createdBefore ?? null
  });

  return {
    configured: true,
    createdAfter,
    createdBefore: input.createdBefore ?? null,
    orderStatuses: orderStatuses ?? null,
    fetched: amazonOrders.length,
    created,
    updated,
    unresolvedItems,
    errors,
    messages: messages.slice(0, 20)
  };
}

/**
 * Full marketplace sync: listings once, then orders+returns month-by-month
 * to avoid SP-API 504 / quota failures on wide date ranges.
 */
export async function syncAmazonMarketplace(input: SyncInput = {}) {
  const monthsBack =
    input.monthsBack ??
    (input.daysBack != null ? Math.max(1, Math.ceil(input.daysBack / 30)) : 24);
  const maxPagesPerMonth = input.maxPagesPerMonth ?? input.maxPages ?? 10;
  const includeShipped = input.includeShipped ?? true;
  const windows = buildAmazonMonthWindows(monthsBack);

  logger.info("Amazon marketplace sync starting (month-by-month)", {
    monthsBack,
    maxPagesPerMonth,
    windows: windows.length
  });

  const listings = await syncAmazonListingsReport();

  const months: Array<{
    month: string;
    ordersFetched: number;
    ordersCreated: number;
    ordersUpdated: number;
    ordersErrors: number;
    returnsRows: number;
    returnsCreated: number;
    returnsUpdated: number;
    returnsUnresolved: number;
    error?: string;
  }> = [];

  for (const window of windows) {
    try {
      const orders = await syncAmazonOrders({
        createdAfter: window.dataStartTime,
        createdBefore: window.dataEndTime,
        includeShipped,
        orderStatuses: input.orderStatuses,
        maxPages: maxPagesPerMonth
      });
      await sleep(2000);
      const returns = await syncAmazonReturnsReportWindow(window.dataStartTime, window.dataEndTime);
      months.push({
        month: window.label,
        ordersFetched: orders.fetched,
        ordersCreated: orders.created,
        ordersUpdated: orders.updated,
        ordersErrors: orders.errors,
        returnsRows: returns.rows,
        returnsCreated: returns.created,
        returnsUpdated: returns.updated,
        returnsUnresolved: returns.unresolved
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Amazon month window failed", { month: window.label, err: message });
      months.push({
        month: window.label,
        ordersFetched: 0,
        ordersCreated: 0,
        ordersUpdated: 0,
        ordersErrors: 1,
        returnsRows: 0,
        returnsCreated: 0,
        returnsUpdated: 0,
        returnsUnresolved: 0,
        error: message
      });
    }
    await sleep(2500);
  }

  const orders = {
    configured: true as const,
    createdAfter: windows[0]?.dataStartTime ?? new Date().toISOString(),
    createdBefore: windows[windows.length - 1]?.dataEndTime ?? null,
    orderStatuses: null as string[] | null,
    fetched: months.reduce((sum, m) => sum + m.ordersFetched, 0),
    created: months.reduce((sum, m) => sum + m.ordersCreated, 0),
    updated: months.reduce((sum, m) => sum + m.ordersUpdated, 0),
    unresolvedItems: 0,
    errors: months.reduce((sum, m) => sum + m.ordersErrors, 0),
    messages: months.filter((m) => m.error).map((m) => `${m.month}: ${m.error}`).slice(0, 20),
    monthsProcessed: months.length
  };

  const returns = {
    rows: months.reduce((sum, m) => sum + m.returnsRows, 0),
    created: months.reduce((sum, m) => sum + m.returnsCreated, 0),
    updated: months.reduce((sum, m) => sum + m.returnsUpdated, 0),
    unresolved: months.reduce((sum, m) => sum + m.returnsUnresolved, 0),
    monthsProcessed: months.length
  };

  const channel = await prisma.marketplaceChannel.findUnique({ where: { code: "AMAZON" } });
  if (channel) {
    await prisma.marketplaceEventLog.create({
      data: {
        channelId: channel.id,
        eventType: "amazon.marketplace.sync",
        source: "API",
        dedupeKey: `amazon-marketplace:${Date.now()}`,
        rawPayload: { monthsBack, maxPagesPerMonth, listings, orders, returns, months },
        processedAt: new Date()
      }
    });
  }

  logger.info("Amazon marketplace sync completed", {
    monthsBack,
    ordersFetched: orders.fetched,
    returnsRows: returns.rows,
    monthErrors: months.filter((m) => m.error).length
  });

  return { listings, orders, returns, months };
}

/** Fire-and-forget sync so admin UI does not hit gateway timeout. */
export function startAmazonMarketplaceSync(input: SyncInput = {}) {
  if (syncRunning) {
    return { started: false, message: "Amazon sync already running in the background." };
  }
  if (!isAmazonSpConfigured()) {
    throw Object.assign(
      new Error(
        "Amazon SP-API is not configured. Set AMAZON_SP_CLIENT_ID, AMAZON_SP_CLIENT_SECRET, and AMAZON_SP_REFRESH_TOKEN on the backend."
      ),
      { statusCode: 503, code: "AMAZON_NOT_CONFIGURED" }
    );
  }

  const monthsBack =
    input.monthsBack ??
    (input.daysBack != null ? Math.max(1, Math.ceil(input.daysBack / 30)) : 24);

  syncRunning = true;
  void (async () => {
    try {
      await syncAmazonMarketplace(input);
    } catch (err) {
      logger.error("amazon_background_sync_failed", { err });
    } finally {
      syncRunning = false;
    }
  })();

  return {
    started: true,
    message:
      "Amazon sync started in the background (month by month). Refresh Listings/Orders/Returns in a few minutes.",
    monthsBack,
    maxPagesPerMonth: input.maxPagesPerMonth ?? input.maxPages ?? 10
  };
}

export function isAmazonMarketplaceSyncRunning() {
  return syncRunning;
}
