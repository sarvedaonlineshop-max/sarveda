import { MarketplaceOrderStatus, MarketplaceReturnStatus, Prisma } from "@prisma/client";

import { etsyEnv, isEtsyConfigured } from "../../../config/etsy";
import { prisma } from "../../../config/db";
import { logger } from "../../../config/logger";
import {
  buildMonthWindows,
  fetchActiveEtsyListings,
  fetchEtsyReceiptsForWindow,
  fetchReceiptTransactions,
  type EtsyListing,
  type EtsyReceipt,
  type EtsyRefund,
  type MonthWindow
} from "./etsy-client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let syncRunning = false;

function amountToPaise(value?: { amount?: number; divisor?: number } | number | string | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Math.round(value * 100);
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }
  if (typeof value.amount === "number") {
    const divisor = value.divisor || 100;
    return Math.round((value.amount / divisor) * 100);
  }
  return null;
}

function firstSku(raw?: string | string[] | null): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.find(Boolean)?.trim() || null;
  return raw.trim() || null;
}

function listingSkus(row: EtsyListing): string[] {
  const out = new Set<string>();
  for (const sku of row.sku ?? []) {
    const trimmed = sku?.trim();
    if (trimmed) out.add(trimmed);
  }
  for (const product of row.inventory?.products ?? []) {
    const trimmed = product.sku?.trim();
    if (trimmed) out.add(trimmed);
  }
  return Array.from(out);
}

function mapEtsyOrderStatus(row: EtsyReceipt): MarketplaceOrderStatus {
  const status = (row.status ?? "").toLowerCase();
  if (status.includes("cancel")) return "CANCELLED";
  if (status.includes("complete")) return "DELIVERED";
  if (row.is_shipped) return "DISPATCHED";
  if (row.is_paid) return "CONFIRMED";
  return "RECEIVED";
}

function mapRefundStatus(refund: EtsyRefund): MarketplaceReturnStatus {
  return amountToPaise(refund.amount) ? "REFUNDED" : "REQUESTED";
}

async function ensureEtsyChannel() {
  if (!isEtsyConfigured()) {
    throw Object.assign(
      new Error("Etsy API is not configured. Set ETSY_API_KEY, ETSY_REFRESH_TOKEN, and ETSY_SHOP_ID."),
      { statusCode: 503, code: "ETSY_NOT_CONFIGURED" }
    );
  }

  let channel = await prisma.marketplaceChannel.findUnique({ where: { code: "ETSY" } });
  if (!channel) {
    channel = await prisma.marketplaceChannel.create({
      data: { code: "ETSY", displayName: "Etsy", isActive: true }
    });
  }
  return channel;
}

async function resolveVariantId(
  channelId: string,
  sku?: string | null,
  listingId?: number | null
) {
  if (sku) {
    const exact = await prisma.productVariant.findUnique({ where: { sku }, select: { id: true } });
    if (exact) return exact.id;

    const listingBySku = await prisma.marketplaceListing.findFirst({
      where: {
        channelId,
        OR: [{ sellerSku: sku }, { externalSku: sku }, { listingId: sku }]
      },
      select: { variantId: true }
    });
    if (listingBySku) return listingBySku.variantId;

    // Case-insensitive SKU fallback (small catalogs only).
    const loose = await prisma.productVariant.findFirst({
      where: { sku: { equals: sku, mode: "insensitive" } },
      select: { id: true }
    });
    if (loose) return loose.id;
  }

  if (listingId != null) {
    const listing = await prisma.marketplaceListing.findFirst({
      where: { channelId, listingId: String(listingId) },
      select: { variantId: true }
    });
    if (listing) return listing.variantId;
  }

  return null;
}

export async function syncEtsyListings() {
  const channel = await ensureEtsyChannel();
  const rows = await fetchActiveEtsyListings();
  let created = 0;
  let updated = 0;
  let unresolved = 0;

  for (const row of rows) {
    const skus = listingSkus(row);
    let matched = false;

    for (const sku of skus) {
      const variantId = await resolveVariantId(channel.id, sku, row.listing_id);
      if (!variantId) continue;

      const existing = await prisma.marketplaceListing.findUnique({
        where: { channelId_variantId: { channelId: channel.id, variantId } },
        select: { id: true }
      });

      const price = amountToPaise(row.price);
      await prisma.marketplaceListing.upsert({
        where: { channelId_variantId: { channelId: channel.id, variantId } },
        create: {
          channelId: channel.id,
          variantId,
          listingId: row.listing_id ? String(row.listing_id) : null,
          externalSku: row.listing_id ? String(row.listing_id) : null,
          sellerSku: sku,
          status: row.state?.toLowerCase().includes("active") ? "ACTIVE" : "PAUSED",
          isTracked: true,
          notes: `Etsy listing sync · ${row.title ?? ""} · qty ${row.quantity ?? "?"} · price ${price != null ? price / 100 : "?"}`,
          lastSyncedAt: new Date()
        },
        update: {
          listingId: row.listing_id ? String(row.listing_id) : undefined,
          externalSku: row.listing_id ? String(row.listing_id) : undefined,
          sellerSku: sku,
          status: row.state?.toLowerCase().includes("active") ? "ACTIVE" : "PAUSED",
          isTracked: true,
          notes: `Etsy listing sync · ${row.title ?? ""} · qty ${row.quantity ?? "?"} · price ${price != null ? price / 100 : "?"}`,
          lastSyncedAt: new Date()
        }
      });

      if (existing) updated += 1;
      else created += 1;
      matched = true;
      break;
    }

    if (!matched) unresolved += 1;
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "etsy.listings.sync",
      source: "API",
      dedupeKey: `etsy-listings:${Date.now()}`,
      rawPayload: { rows: rows.length, created, updated, unresolved },
      processedAt: new Date()
    }
  });

  logger.info("Etsy listings sync completed", { rows: rows.length, created, updated, unresolved });
  return { rows: rows.length, created, updated, unresolved };
}

async function upsertReceiptOrder(channelId: string, receipt: EtsyReceipt) {
  const externalOrderId = receipt.receipt_id ? String(receipt.receipt_id) : `ETSY-${Date.now()}`;
  const orderDate = new Date((receipt.created_timestamp ?? Date.now() / 1000) * 1000);
  const txns = receipt.transactions?.length
    ? receipt.transactions
    : receipt.receipt_id
      ? await fetchReceiptTransactions(receipt.receipt_id)
      : [];

  let unresolvedItems = 0;
  const resolvedItems: Array<{
    variantId: string | null;
    skuSnapshot: string;
    productNameSnapshot: string | null;
    quantity: number;
    unitPriceInPaise: number | null;
    lineTotalInPaise: number | null;
  }> = [];

  for (const txn of txns) {
    const qty = Math.max(1, txn.quantity ?? 1);
    const sku = firstSku(txn.sku) ?? (txn.listing_id ? String(txn.listing_id) : "UNKNOWN");
    const variantId = await resolveVariantId(channelId, sku, txn.listing_id);
    if (!variantId) unresolvedItems += 1;
    const unit = amountToPaise(txn.price);
    resolvedItems.push({
      variantId,
      skuSnapshot: sku,
      productNameSnapshot: txn.title?.trim() || null,
      quantity: qty,
      unitPriceInPaise: unit,
      lineTotalInPaise: unit != null ? unit * qty : null
    });
  }

  const orderData = {
    orderDate,
    customerName: receipt.name?.trim() || null,
    customerEmail: receipt.buyer_email?.trim() || null,
    customerPhone: null as string | null,
    shipToCity: receipt.city?.trim() || null,
    shipToState: receipt.state?.trim() || null,
    shipToCountry: receipt.country_iso?.trim() || null,
    shipToPostalCode: receipt.zip?.trim() || null,
    status: mapEtsyOrderStatus(receipt),
    source: "API" as const,
    rawPayload: { receipt, transactions: txns } as Prisma.InputJsonValue,
    notes: [
      receipt.status ? `Etsy status: ${receipt.status}` : null,
      receipt.is_paid != null ? `Paid: ${receipt.is_paid}` : null,
      receipt.is_shipped != null ? `Shipped: ${receipt.is_shipped}` : null
    ]
      .filter(Boolean)
      .join(" | ") || null
  };

  let action: "created" | "updated" = "created";
  await prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceOrder.findUnique({
      where: { channelId_externalOrderId: { channelId, externalOrderId } }
    });

    if (existing) {
      await tx.marketplaceOrder.update({ where: { id: existing.id }, data: orderData });
      await tx.marketplaceOrderItem.deleteMany({ where: { marketplaceOrderId: existing.id } });
      for (const item of resolvedItems) {
        await tx.marketplaceOrderItem.create({
          data: { marketplaceOrderId: existing.id, ...item }
        });
      }
      action = "updated";
    } else {
      const order = await tx.marketplaceOrder.create({
        data: { channelId, externalOrderId, ...orderData }
      });
      for (const item of resolvedItems) {
        await tx.marketplaceOrderItem.create({
          data: { marketplaceOrderId: order.id, ...item }
        });
      }
    }
  });

  return { action, unresolvedItems, receiptId: externalOrderId };
}

async function upsertReceiptReturns(channelId: string, receipt: EtsyReceipt) {
  const receiptId = receipt.receipt_id ? String(receipt.receipt_id) : null;
  if (!receiptId) return { created: 0, updated: 0 };

  const order = await prisma.marketplaceOrder.findUnique({
    where: { channelId_externalOrderId: { channelId, externalOrderId: receiptId } },
    include: { items: true }
  });
  if (!order) return { created: 0, updated: 0 };

  const receiptDate =
    receipt.created_timestamp != null
      ? new Date(receipt.created_timestamp * 1000)
      : order.orderDate;

  const resolveOrderItemId = (refund: EtsyRefund) => {
    const txns = receipt.transactions ?? [];
    if (refund.transaction_id != null) {
      const txn = txns.find((t) => t.transaction_id === refund.transaction_id);
      const sku = firstSku(txn?.sku);
      if (sku) {
        const bySku = order.items.find((item) => item.skuSnapshot === sku);
        if (bySku) return bySku.id;
      }
      if (txn?.title) {
        const byTitle = order.items.find(
          (item) => item.productNameSnapshot && item.productNameSnapshot === txn.title
        );
        if (byTitle) return byTitle.id;
      }
    }
    return order.items[0]?.id ?? null;
  };

  let created = 0;
  let updated = 0;
  const refunds = receipt.refunds ?? [];

  for (const refund of refunds) {
    const dedupe = refund.refund_id
      ? String(refund.refund_id)
      : `${receiptId}:${refund.transaction_id}:${refund.created_timestamp ?? receipt.created_timestamp}`;
    const existing = await prisma.marketplaceReturn.findFirst({
      where: { marketplaceOrderId: order.id, notes: { contains: dedupe } }
    });

    const eventDate =
      refund.created_timestamp != null
        ? new Date(refund.created_timestamp * 1000)
        : receipt.updated_timestamp != null
          ? new Date(receipt.updated_timestamp * 1000)
          : receiptDate;

    const payload = {
      marketplaceOrderId: order.id,
      marketplaceOrderItemId: resolveOrderItemId(refund),
      quantity: 1,
      reason: refund.reason?.trim() || "Etsy refund",
      status: mapRefundStatus(refund),
      receivedAt: eventDate,
      refundedAmountInPaise: amountToPaise(refund.amount),
      restockedToZoho: false,
      notes: `Etsy refund ${dedupe}`,
      rawPayload: refund as Prisma.InputJsonValue
    };

    if (existing) {
      await prisma.marketplaceReturn.update({ where: { id: existing.id }, data: payload });
      updated += 1;
    } else {
      await prisma.marketplaceReturn.create({ data: payload });
      created += 1;
    }
  }

  if ((receipt.status ?? "").toLowerCase().includes("cancel") && refunds.length === 0) {
    const dedupe = `cancel:${receiptId}`;
    const existing = await prisma.marketplaceReturn.findFirst({
      where: { marketplaceOrderId: order.id, notes: { contains: dedupe } }
    });
    const eventDate =
      receipt.updated_timestamp != null
        ? new Date(receipt.updated_timestamp * 1000)
        : receiptDate;
    const payload = {
      marketplaceOrderId: order.id,
      marketplaceOrderItemId: order.items[0]?.id ?? null,
      quantity: Math.max(1, order.items.reduce((sum, item) => sum + item.quantity, 0)),
      reason: "Etsy canceled receipt",
      status: "REQUESTED" as MarketplaceReturnStatus,
      receivedAt: eventDate,
      refundedAmountInPaise: amountToPaise(receipt.grandtotal),
      restockedToZoho: false,
      notes: `Etsy refund ${dedupe}`,
      rawPayload: receipt as Prisma.InputJsonValue
    };
    if (existing) {
      await prisma.marketplaceReturn.update({ where: { id: existing.id }, data: payload });
      updated += 1;
    } else {
      await prisma.marketplaceReturn.create({ data: payload });
      created += 1;
    }
  }

  return { created, updated };
}

async function syncMonthWindow(channelId: string, window: MonthWindow, maxPages: number) {
  const receipts = await fetchEtsyReceiptsForWindow(window, maxPages);
  let ordersCreated = 0;
  let ordersUpdated = 0;
  let unresolvedItems = 0;
  let orderErrors = 0;
  let returnsCreated = 0;
  let returnsUpdated = 0;

  for (const receipt of receipts) {
    try {
      const orderResult = await upsertReceiptOrder(channelId, receipt);
      if (orderResult.action === "created") ordersCreated += 1;
      else ordersUpdated += 1;
      unresolvedItems += orderResult.unresolvedItems;

      const returnResult = await upsertReceiptReturns(channelId, receipt);
      returnsCreated += returnResult.created;
      returnsUpdated += returnResult.updated;
      await sleep(200);
    } catch (err) {
      orderErrors += 1;
      logger.error("Etsy month receipt upsert failed", {
        month: window.label,
        receiptId: receipt.receipt_id,
        err: err instanceof Error ? err.message : String(err)
      });
    }
  }

  logger.info("Etsy month sync completed", {
    month: window.label,
    fetched: receipts.length,
    ordersCreated,
    ordersUpdated,
    returnsCreated,
    returnsUpdated,
    orderErrors
  });

  return {
    month: window.label,
    fetched: receipts.length,
    ordersCreated,
    ordersUpdated,
    returnsCreated,
    returnsUpdated,
    unresolvedItems,
    orderErrors
  };
}

export async function syncEtsyMarketplace(opts: { monthsBack?: number; maxPagesPerMonth?: number } = {}) {
  const monthsBack = Math.max(1, Math.min(36, opts.monthsBack ?? 24));
  const maxPagesPerMonth = Math.max(1, Math.min(20, opts.maxPagesPerMonth ?? 10));
  const channel = await ensureEtsyChannel();
  const windows = buildMonthWindows(monthsBack);

  const listings = await syncEtsyListings();

  const months: Array<Awaited<ReturnType<typeof syncMonthWindow>>> = [];
  for (const window of windows) {
    try {
      months.push(await syncMonthWindow(channel.id, window, maxPagesPerMonth));
    } catch (err) {
      logger.error("Etsy month window failed", {
        month: window.label,
        err: err instanceof Error ? err.message : String(err)
      });
      months.push({
        month: window.label,
        fetched: 0,
        ordersCreated: 0,
        ordersUpdated: 0,
        returnsCreated: 0,
        returnsUpdated: 0,
        unresolvedItems: 0,
        orderErrors: 1
      });
    }
    await sleep(1500);
  }

  const orders = {
    fetched: months.reduce((sum, m) => sum + m.fetched, 0),
    created: months.reduce((sum, m) => sum + m.ordersCreated, 0),
    updated: months.reduce((sum, m) => sum + m.ordersUpdated, 0),
    unresolvedItems: months.reduce((sum, m) => sum + m.unresolvedItems, 0),
    errors: months.reduce((sum, m) => sum + m.orderErrors, 0),
    monthsProcessed: months.length
  };

  const returns = {
    rows: months.reduce((sum, m) => sum + m.fetched, 0),
    created: months.reduce((sum, m) => sum + m.returnsCreated, 0),
    updated: months.reduce((sum, m) => sum + m.returnsUpdated, 0),
    unresolved: 0
  };

  await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "etsy.marketplace.sync",
      source: "API",
      dedupeKey: `etsy-marketplace:${Date.now()}`,
      rawPayload: { monthsBack, maxPagesPerMonth, listings, orders, returns, months },
      processedAt: new Date()
    }
  });

  return { listings, orders, returns, months };
}

/** Fire-and-forget sync so admin UI does not hit gateway timeout. */
export function startEtsyMarketplaceSync(opts: { monthsBack?: number; maxPagesPerMonth?: number } = {}) {
  if (syncRunning) {
    return { started: false, message: "Etsy sync already running in the background." };
  }
  if (!isEtsyConfigured()) {
    throw Object.assign(
      new Error("Etsy API is not configured. Set ETSY_API_KEY, ETSY_REFRESH_TOKEN, and ETSY_SHOP_ID."),
      { statusCode: 503, code: "ETSY_NOT_CONFIGURED" }
    );
  }

  syncRunning = true;
  void (async () => {
    try {
      await syncEtsyMarketplace(opts);
    } catch (err) {
      logger.error("etsy_background_sync_failed", { err });
    } finally {
      syncRunning = false;
    }
  })();

  return {
    started: true,
    message: "Etsy sync started in the background. Refresh Listings/Orders/Returns in a few minutes.",
    monthsBack: opts.monthsBack ?? 24,
    maxPagesPerMonth: opts.maxPagesPerMonth ?? 10
  };
}

export function getEtsyConnectionStatus() {
  return {
    configured: isEtsyConfigured(),
    shopId: etsyEnv.ETSY_SHOP_ID,
    autoSyncEnabled: true,
    syncRunning,
    missing: [
      !etsyEnv.ETSY_API_KEY ? "ETSY_API_KEY" : null,
      !etsyEnv.ETSY_REFRESH_TOKEN ? "ETSY_REFRESH_TOKEN" : null,
      !etsyEnv.ETSY_SHOP_ID ? "ETSY_SHOP_ID" : null
    ].filter(Boolean) as string[]
  };
}
