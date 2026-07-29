import { MarketplaceOrderStatus, MarketplaceReturnStatus, Prisma } from "@prisma/client";

import { isFlipkartConfigured } from "../../../config/flipkart";
import { prisma } from "../../../config/db";
import { logger } from "../../../config/logger";
import {
  fetchAllShipments,
  fetchAllReturns,
  getShipmentDetails,
  type FlipkartShipment,
  type FlipkartReturn,
} from "./flipkart-client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mapFlipkartOrderStatus(shipmentType: string, itemStatus?: string): MarketplaceOrderStatus {
  if (shipmentType === "cancelled") return "CANCELLED";
  const s = (itemStatus ?? "").toUpperCase();
  if (s.includes("DELIVER")) return "DELIVERED";
  if (s.includes("SHIP") || s.includes("PICKUP")) return "DISPATCHED";
  if (s.includes("PACK") || s.includes("READY")) return "CONFIRMED";
  if (s.includes("CANCEL")) return "CANCELLED";
  return "RECEIVED";
}

function mapFlipkartReturnStatus(status?: string): MarketplaceReturnStatus {
  const s = (status ?? "").toUpperCase();
  if (s.includes("COMPLETE") || s.includes("REFUND")) return "REFUNDED";
  if (s.includes("REJECT")) return "REJECTED";
  if (s.includes("APPROV")) return "RECEIVED";
  return "REQUESTED";
}

function amountToPaise(amount?: number): number | null {
  if (amount == null || isNaN(amount)) return null;
  return Math.round(amount * 100);
}

async function resolveVariantId(
  tx: Prisma.TransactionClient,
  channelId: string,
  sku?: string,
  listingId?: string
): Promise<string | null> {
  if (sku) {
    const listing = await tx.marketplaceListing.findFirst({
      where: { channelId, variant: { sku } },
      select: { variantId: true },
    });
    if (listing) return listing.variantId;

    const variant = await tx.productVariant.findUnique({
      where: { sku },
      select: { id: true },
    });
    if (variant) return variant.id;
  }
  return null;
}

async function ensureFlipkartChannel(): Promise<string> {
  if (!isFlipkartConfigured()) {
    throw Object.assign(
      new Error("Flipkart API is not configured. Set FLIPKART_API_KEY and FLIPKART_API_SECRET."),
      { statusCode: 503, code: "FLIPKART_NOT_CONFIGURED" }
    );
  }

  let channel = await prisma.marketplaceChannel.findUnique({ where: { code: "FLIPKART" } });
  if (!channel) {
    channel = await prisma.marketplaceChannel.create({
      data: {
        code: "FLIPKART",
        displayName: "Flipkart",
        isActive: true,
      },
    });
  }
  return channel.id;
}

// --- Orders sync ---

export async function syncFlipkartOrders(opts: { daysBack?: number; maxPages?: number } = {}) {
  const channelId = await ensureFlipkartChannel();
  const daysBack = opts.daysBack ?? 730;
  const from = new Date(Date.now() - daysBack * 86400000).toISOString();
  const to = new Date().toISOString();

  const allShipments: FlipkartShipment[] = [];

  for (const type of ["preDispatch", "postDispatch", "cancelled"] as const) {
    const states =
      type === "preDispatch"
        ? ["APPROVED", "PACKING_IN_PROGRESS", "PACKED", "READY_TO_DISPATCH"]
        : type === "postDispatch"
          ? ["SHIPPED", "DELIVERED", "PICKUP_COMPLETE"]
          : undefined;

    const shipments = await fetchAllShipments(type, {
      orderDateFrom: from,
      orderDateTo: to,
      states,
      maxPages: opts.maxPages ?? 50,
    });

    for (const s of shipments) {
      (s as FlipkartShipment & { _type: string })._type = type;
    }
    allShipments.push(...shipments);
    await sleep(3000);
  }

  // Fetch delivery details for customer info
  const shipmentIds = allShipments
    .map((s) => s.shipmentId)
    .filter((id): id is string => Boolean(id));

  const detailsMap = new Map<string, Awaited<ReturnType<typeof getShipmentDetails>>[number]>();
  if (shipmentIds.length) {
    const details = await getShipmentDetails(shipmentIds);
    for (const d of details) {
      if (d.shipmentId) detailsMap.set(d.shipmentId, d);
    }
  }

  let created = 0;
  let updated = 0;
  let errors = 0;
  const messages: string[] = [];

  for (const shipment of allShipments) {
    try {
      const shipmentType = ((shipment as FlipkartShipment & { _type?: string })._type ?? "preDispatch");
      const items = shipment.orderItems ?? [];
      if (!items.length) continue;

      const firstItem = items[0];
      const externalOrderId = firstItem.orderId ?? shipment.shipmentId ?? `FK-${Date.now()}`;
      const orderDate = new Date(firstItem.orderDate ?? Date.now());
      const detail = shipment.shipmentId ? detailsMap.get(shipment.shipmentId) : undefined;
      const addr = detail?.deliveryAddress;

      const customerName = addr
        ? [addr.firstName, addr.lastName].filter(Boolean).join(" ") || null
        : null;

      const status = mapFlipkartOrderStatus(shipmentType, items[0].status);

      const totalValue = items.reduce(
        (sum, item) => sum + (amountToPaise(item.priceComponents?.totalPrice) ?? 0) * (item.quantity ?? 1),
        0
      );

      await prisma.$transaction(async (tx) => {
        const existing = await tx.marketplaceOrder.findUnique({
          where: { channelId_externalOrderId: { channelId, externalOrderId } },
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
          const qty = Math.max(1, item.quantity ?? 1);
          const lineTotal = amountToPaise(item.priceComponents?.totalPrice);
          const unit = amountToPaise(item.priceComponents?.sellingPrice);
          const skuSnapshot = (item.sku ?? item.listingId ?? "UNKNOWN").trim();
          const variantId = await resolveVariantId(tx, channelId, item.sku);
          resolvedItems.push({
            variantId,
            skuSnapshot,
            productNameSnapshot: item.title?.trim() || null,
            quantity: qty,
            unitPriceInPaise: unit,
            lineTotalInPaise: lineTotal ? lineTotal * qty : null,
          });
        }

        const orderData = {
          orderDate,
          customerName,
          customerEmail: null as string | null,
          customerPhone: addr?.contactNumber?.trim() || null,
          shipToCity: addr?.city?.trim() || null,
          shipToState: addr?.stateName?.trim() || null,
          shipToCountry: "IN",
          shipToPostalCode: addr?.pincode?.trim() || null,
          status,
          source: "API" as const,
          rawPayload: { shipment, detail } as Prisma.InputJsonValue,
          notes: [
            shipment.shipmentId ? `Shipment: ${shipment.shipmentId}` : null,
            shipmentType ? `Type: ${shipmentType}` : null,
          ]
            .filter(Boolean)
            .join(" | ") || null,
          totalItems: resolvedItems.reduce((s, i) => s + i.quantity, 0),
          totalValueInPaise: totalValue,
        };

        if (existing) {
          await tx.marketplaceOrder.update({
            where: { id: existing.id },
            data: orderData,
          });
          updated++;
        } else {
          const newOrder = await tx.marketplaceOrder.create({
            data: {
              channelId,
              externalOrderId,
              ...orderData,
            },
          });
          for (const ri of resolvedItems) {
            await tx.marketplaceOrderItem.create({
              data: { marketplaceOrderId: newOrder.id, ...ri },
            });
          }
          created++;
        }
      });
      await sleep(500);
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : "unknown";
      messages.push(`${shipment.shipmentId}: ${msg}`);
      logger.error("Flipkart order upsert failed", { shipmentId: shipment.shipmentId, err: msg });
    }
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId,
      eventType: "flipkart.orders.sync",
      source: "API",
      dedupeKey: `flipkart-orders-sync:${from}:${Date.now()}`,
      rawPayload: {
        daysBack: opts.daysBack ?? 730,
        fetched: allShipments.length,
        created,
        updated,
        errors,
        messages: messages.slice(0, 20),
      },
      processedAt: new Date(),
    },
  });

  logger.info("Flipkart orders sync completed", { fetched: allShipments.length, created, updated, errors });

  return { fetched: allShipments.length, created, updated, errors, messages: messages.slice(0, 20) };
}

// --- Returns sync ---

export async function syncFlipkartReturns(opts: { daysBack?: number; maxPages?: number } = {}) {
  const channelId = await ensureFlipkartChannel();
  const daysBack = opts.daysBack ?? 730;
  const createdAfter = new Date(Date.now() - daysBack * 86400000).toISOString();

  const allReturns: FlipkartReturn[] = [];

  for (const source of ["customer_return", "courier_return"] as const) {
    const returns = await fetchAllReturns(source, {
      createdAfter,
      maxPages: opts.maxPages ?? 50,
    });
    allReturns.push(...returns);
    await sleep(3000);
  }

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const ret of allReturns) {
    try {
      const dedupe = ret.returnId ?? `${ret.orderId}:${ret.sku}:${ret.createdAt}`;

      const order = ret.orderId
        ? await prisma.marketplaceOrder.findFirst({
            where: { channelId, externalOrderId: ret.orderId },
            include: { items: true },
          })
        : null;

      if (!order) {
        logger.warn("Flipkart return skipped — no matching order", { returnId: ret.returnId, orderId: ret.orderId });
        continue;
      }

      const orderItem = ret.sku
        ? order.items.find((i) => i.skuSnapshot === ret.sku) ?? null
        : null;

      const existing = await prisma.marketplaceReturn.findFirst({
        where: { marketplaceOrderId: order.id, notes: { contains: dedupe } },
      });

      const returnData = {
        marketplaceOrderId: order.id,
        marketplaceOrderItemId: orderItem?.id ?? null,
        quantity: Math.max(1, ret.quantity ?? 1),
        reason: [ret.returnReason, ret.returnSubReason].filter(Boolean).join(" — ") || null,
        status: mapFlipkartReturnStatus(ret.status),
        refundedAmountInPaise: null as number | null,
        restockedToZoho: false,
        notes: `Flipkart return ${dedupe}`,
        rawPayload: ret as unknown as Prisma.InputJsonValue,
      };

      if (existing) {
        await prisma.marketplaceReturn.update({ where: { id: existing.id }, data: returnData });
        updated++;
      } else {
        await prisma.marketplaceReturn.create({ data: returnData });
        created++;
      }
    } catch (err) {
      errors++;
      logger.error("Flipkart return upsert failed", { returnId: ret.returnId, err });
    }
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId,
      eventType: "flipkart.returns.sync",
      source: "API",
      dedupeKey: `flipkart-returns-sync:${createdAfter}:${Date.now()}`,
      rawPayload: { daysBack, fetched: allReturns.length, created, updated, errors },
      processedAt: new Date(),
    },
  });

  logger.info("Flipkart returns sync completed", { fetched: allReturns.length, created, updated, errors });

  return { fetched: allReturns.length, created, updated, errors };
}

// --- Combined sync ---

export async function syncFlipkartMarketplace(opts: { daysBack?: number; maxPages?: number } = {}) {
  const orders = await syncFlipkartOrders(opts);
  const returns = await syncFlipkartReturns(opts);
  return { orders, returns };
}

export function getFlipkartConnectionStatus() {
  return {
    configured: isFlipkartConfigured(),
    autoSyncEnabled: true,
    missing: [
      !flipkartEnv.FLIPKART_API_KEY ? "FLIPKART_API_KEY" : null,
      !flipkartEnv.FLIPKART_API_SECRET ? "FLIPKART_API_SECRET" : null,
    ].filter(Boolean) as string[],
  };
}

import { flipkartEnv } from "../../../config/flipkart";
