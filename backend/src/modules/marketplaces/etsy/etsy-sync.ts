import { MarketplaceOrderStatus, MarketplaceReturnStatus, Prisma } from "@prisma/client";

import { etsyEnv, isEtsyConfigured } from "../../../config/etsy";
import { prisma } from "../../../config/db";
import { logger } from "../../../config/logger";
import {
  fetchActiveEtsyListings,
  fetchAllEtsyReceipts,
  fetchReceiptTransactions,
  type EtsyListing,
  type EtsyReceipt,
  type EtsyRefund,
  type EtsyTransaction
} from "./etsy-client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  if (Array.isArray(raw)) return raw.find(Boolean)?.trim() ?? null;
  return raw.trim() || null;
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
  tx: Prisma.TransactionClient,
  channelId: string,
  sku?: string | null,
  listingId?: number | null
) {
  if (sku) {
    const listing = await tx.marketplaceListing.findFirst({
      where: { channelId, variant: { sku } },
      select: { variantId: true }
    });
    if (listing) return listing.variantId;

    const variant = await tx.productVariant.findUnique({ where: { sku }, select: { id: true } });
    if (variant) return variant.id;
  }

  if (listingId != null) {
    const listing = await tx.marketplaceListing.findFirst({
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
    const sku = firstSku(row.sku);
    if (!sku) {
      unresolved += 1;
      continue;
    }
    const variant = await prisma.productVariant.findUnique({
      where: { sku },
      select: { id: true }
    });
    if (!variant) {
      unresolved += 1;
      continue;
    }

    const existing = await prisma.marketplaceListing.findUnique({
      where: { channelId_variantId: { channelId: channel.id, variantId: variant.id } },
      select: { id: true }
    });

    const price = amountToPaise(row.price);
    await prisma.marketplaceListing.upsert({
      where: { channelId_variantId: { channelId: channel.id, variantId: variant.id } },
      create: {
        channelId: channel.id,
        variantId: variant.id,
        listingId: row.listing_id ? String(row.listing_id) : null,
        externalSku: row.listing_id ? String(row.listing_id) : null,
        sellerSku: sku,
        status: row.state?.toLowerCase().includes("active") ? "ACTIVE" : "PAUSED",
        isTracked: true,
        notes: `Etsy listing sync · qty ${row.quantity ?? "?"} · price ${price != null ? price / 100 : "?"}`,
        lastSyncedAt: new Date()
      },
      update: {
        listingId: row.listing_id ? String(row.listing_id) : undefined,
        externalSku: row.listing_id ? String(row.listing_id) : undefined,
        sellerSku: sku,
        status: row.state?.toLowerCase().includes("active") ? "ACTIVE" : "PAUSED",
        isTracked: true,
        notes: `Etsy listing sync · qty ${row.quantity ?? "?"} · price ${price != null ? price / 100 : "?"}`,
        lastSyncedAt: new Date()
      }
    });

    if (existing) updated += 1;
    else created += 1;
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

  return { rows: rows.length, created, updated, unresolved };
}

export async function syncEtsyOrders(opts: { maxPages?: number } = {}) {
  const channel = await ensureEtsyChannel();
  const receipts = await fetchAllEtsyReceipts(opts.maxPages ?? 50);
  let created = 0;
  let updated = 0;
  let unresolvedItems = 0;
  let errors = 0;
  const messages: string[] = [];

  for (const receipt of receipts) {
    try {
      const externalOrderId = receipt.receipt_id ? String(receipt.receipt_id) : `ETSY-${Date.now()}`;
      const orderDate = new Date((receipt.created_timestamp ?? Date.now() / 1000) * 1000);
      const txns = receipt.transactions?.length
        ? receipt.transactions
        : receipt.receipt_id
          ? await fetchReceiptTransactions(receipt.receipt_id)
          : [];

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
        const variantId = await resolveVariantId(prisma as unknown as Prisma.TransactionClient, channel.id, sku, txn.listing_id);
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
        ].filter(Boolean).join(" | ") || null
      };

      await prisma.$transaction(async (tx) => {
        const existing = await tx.marketplaceOrder.findUnique({
          where: { channelId_externalOrderId: { channelId: channel.id, externalOrderId } },
          include: { items: true }
        });

        if (existing) {
          await tx.marketplaceOrder.update({ where: { id: existing.id }, data: orderData });
          await tx.marketplaceOrderItem.deleteMany({ where: { marketplaceOrderId: existing.id } });
          for (const item of resolvedItems) {
            await tx.marketplaceOrderItem.create({
              data: { marketplaceOrderId: existing.id, ...item }
            });
          }
          updated += 1;
        } else {
          const order = await tx.marketplaceOrder.create({
            data: { channelId: channel.id, externalOrderId, ...orderData }
          });
          for (const item of resolvedItems) {
            await tx.marketplaceOrderItem.create({
              data: { marketplaceOrderId: order.id, ...item }
            });
          }
          created += 1;
        }
      });
      await sleep(250);
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : "unknown error";
      messages.push(`${receipt.receipt_id ?? "unknown"}: ${msg}`);
      logger.error("Etsy order upsert failed", { receiptId: receipt.receipt_id, err: msg });
    }
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "etsy.orders.sync",
      source: "API",
      dedupeKey: `etsy-orders:${Date.now()}`,
      rawPayload: { fetched: receipts.length, created, updated, unresolvedItems, errors, messages: messages.slice(0, 20) },
      processedAt: new Date()
    }
  });

  return { fetched: receipts.length, created, updated, unresolvedItems, errors, messages: messages.slice(0, 20) };
}

export async function syncEtsyReturns(opts: { maxPages?: number } = {}) {
  const channel = await ensureEtsyChannel();
  const receipts = await fetchAllEtsyReceipts(opts.maxPages ?? 50);
  let created = 0;
  let updated = 0;
  let unresolved = 0;

  for (const receipt of receipts) {
    const receiptId = receipt.receipt_id ? String(receipt.receipt_id) : null;
    const order = receiptId
      ? await prisma.marketplaceOrder.findUnique({
          where: { channelId_externalOrderId: { channelId: channel.id, externalOrderId: receiptId } },
          include: { items: true }
        })
      : null;
    if (!order) continue;

    const refunds = receipt.refunds ?? [];
    for (const refund of refunds) {
      const dedupe = refund.refund_id ? String(refund.refund_id) : `${receiptId}:${refund.transaction_id}:${refund.created_timestamp}`;
      const existing = await prisma.marketplaceReturn.findFirst({
        where: { marketplaceOrderId: order.id, notes: { contains: dedupe } }
      });

      const payload = {
        marketplaceOrderId: order.id,
        marketplaceOrderItemId: null,
        quantity: 1,
        reason: refund.reason?.trim() || "Etsy refund",
        status: mapRefundStatus(refund),
        receivedAt: refund.created_timestamp ? new Date(refund.created_timestamp * 1000) : null,
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
      const payload = {
        marketplaceOrderId: order.id,
        marketplaceOrderItemId: null,
        quantity: Math.max(1, order.items.reduce((sum, item) => sum + item.quantity, 0)),
        reason: "Etsy canceled receipt",
        status: "REQUESTED" as MarketplaceReturnStatus,
        receivedAt: receipt.updated_timestamp ? new Date(receipt.updated_timestamp * 1000) : null,
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
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "etsy.returns.sync",
      source: "API",
      dedupeKey: `etsy-returns:${Date.now()}`,
      rawPayload: { fetched: receipts.length, created, updated, unresolved },
      processedAt: new Date()
    }
  });

  return { rows: receipts.length, created, updated, unresolved };
}

export async function syncEtsyMarketplace(opts: { maxPages?: number } = {}) {
  const listings = await syncEtsyListings();
  const orders = await syncEtsyOrders(opts);
  const returns = await syncEtsyReturns(opts);
  return { listings, orders, returns };
}

export function getEtsyConnectionStatus() {
  return {
    configured: isEtsyConfigured(),
    shopId: etsyEnv.ETSY_SHOP_ID,
    autoSyncEnabled: true,
    missing: [
      !etsyEnv.ETSY_API_KEY ? "ETSY_API_KEY" : null,
      !etsyEnv.ETSY_REFRESH_TOKEN ? "ETSY_REFRESH_TOKEN" : null,
      !etsyEnv.ETSY_SHOP_ID ? "ETSY_SHOP_ID" : null
    ].filter(Boolean) as string[]
  };
}
