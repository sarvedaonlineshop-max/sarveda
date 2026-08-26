/**
 * Launch cutover: archive pre-launch orders + marketplace ops; keep SRV-ACCT-* live.
 *
 *   npx tsx scripts/launch-orders-cutover.ts              # dry-run manifest
 *   npx tsx scripts/launch-orders-cutover.ts --apply      # execute (BACK UP DB FIRST)
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { classifyOrderForCutover } from "../src/modules/admin/live-order-filter";
import {
  legacyDedupeKeyD2C,
  legacyDedupeKeyMarketplace,
  marketplaceOverlapsD2C
} from "../src/modules/admin/launch-order-rules";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.resolve(__dirname, "../../data/compare/launch-cutover-backups");
const prisma = new PrismaClient();

const orderInclude = {
  items: true,
  addresses: true,
  payments: { include: { refunds: true } },
  shipments: true,
  invoice: true,
  statusHistory: true
} as const;

const mpInclude = {
  channel: true,
  items: true,
  returns: true
} as const;

async function deleteD2COrders(orderIds: string[]) {
  if (!orderIds.length) return;
  const ids = [...new Set(orderIds)];

  await prisma.accountingDocumentLink.deleteMany({
    where: { documentType: "ORDER", documentId: { in: ids } }
  });
  await prisma.accountingPostingEvent.deleteMany({
    where: { sourceType: "ORDER", sourceId: { in: ids } }
  });

  const requests = await prisma.orderServiceRequest.findMany({
    where: { orderId: { in: ids } },
    select: { id: true }
  });
  const requestIds = requests.map((r) => r.id);
  if (requestIds.length) {
    await prisma.orderServiceRequestPhoto.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.orderServiceRequestItem.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.orderServiceRequest.deleteMany({ where: { id: { in: requestIds } } });
  }

  await prisma.orderInventoryRestockEvent.deleteMany({ where: { orderId: { in: ids } } });

  const payments = await prisma.payment.findMany({ where: { orderId: { in: ids } }, select: { id: true } });
  const paymentIds = payments.map((p) => p.id);
  if (paymentIds.length) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
  }
  await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.shipment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderAddress.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.enrollment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
}

function d2cArchiveRow(order: Awaited<ReturnType<typeof prisma.order.findMany>>[number]) {
  const billing = order.addresses.find((a) => a.type === "BILLING") ?? null;
  const shipping = order.addresses.find((a) => a.type === "SHIPPING") ?? null;
  const pay = order.payments[0] ?? null;
  const items = order.items.map((i) => ({
    sku: i.skuSnapshot,
    name: i.nameSnapshot,
    qty: i.qtyOrdered,
    unitPriceInPaise: i.unitPriceInPaise,
    lineTotalInPaise: i.lineTotalInPaise
  }));

  return {
    dedupeKey: legacyDedupeKeyD2C(order.orderNumber),
    source: "D2C" as const,
    orderNumber: order.orderNumber,
    originalOrderId: order.id,
    customerName: shipping?.fullName ?? billing?.fullName ?? null,
    customerEmail: order.email,
    customerPhone: order.phone,
    billingAddress: billing,
    shippingAddress: shipping,
    status: order.status,
    paymentProvider: pay?.provider ?? null,
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise,
    shippingInPaise: order.shippingInPaise,
    taxInPaise: order.taxInPaise,
    grandTotalInPaise: order.grandTotalInPaise,
    orderDate: order.placedAt ?? order.createdAt,
    placedAt: order.placedAt,
    itemCount: order.items.reduce((s, i) => s + i.qtyOrdered, 0),
    linePreview: order.items.slice(0, 3).map((i) => i.nameSnapshot),
    items,
    payments: order.payments,
    shipments: order.shipments,
    wooCommerceId: order.wooCommerceId,
    zohoInvoiceId: order.zohoInvoiceId,
    zohoInvoiceNo: order.zohoInvoiceNo,
    notes: order.notes,
    rawSnapshot: order
  };
}

function mpGrandTotal(row: Awaited<ReturnType<typeof prisma.marketplaceOrder.findMany>>[number]) {
  return row.items.reduce((s, i) => s + (i.lineTotalInPaise ?? (i.unitPriceInPaise ?? 0) * i.quantity), 0);
}

function mpArchiveRow(row: Awaited<ReturnType<typeof prisma.marketplaceOrder.findMany>>[number]) {
  return {
    originalMarketplaceOrderId: row.id,
    channelId: row.channelId,
    channelCode: row.channel.code,
    externalOrderId: row.externalOrderId,
    orderDate: row.orderDate,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    shipToCity: row.shipToCity,
    shipToState: row.shipToState,
    shipToCountry: row.shipToCountry,
    shipToPostalCode: row.shipToPostalCode,
    status: row.status,
    source: row.source,
    grandTotalInPaise: mpGrandTotal(row),
    currency: "INR",
    items: row.items,
    returns: row.returns,
    rawPayload: row.rawPayload,
    notes: row.notes,
    dispatchedAt: row.dispatchedAt,
    deliveredAt: row.deliveredAt,
    cancelledAt: row.cancelledAt
  };
}

function mpLegacyOrderRow(
  row: Awaited<ReturnType<typeof prisma.marketplaceOrder.findMany>>[number]
) {
  const items = row.items.map((i) => ({
    sku: i.skuSnapshot,
    name: i.productNameSnapshot ?? i.skuSnapshot,
    qty: i.quantity,
    unitPriceInPaise: i.unitPriceInPaise,
    lineTotalInPaise: i.lineTotalInPaise
  }));
  const total = mpGrandTotal(row);

  return {
    dedupeKey: legacyDedupeKeyMarketplace(row.channel.code, row.externalOrderId),
    source: "MARKETPLACE" as const,
    channelCode: row.channel.code,
    externalOrderId: row.externalOrderId,
    originalMarketplaceOrderId: row.id,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    shippingAddress: {
      city: row.shipToCity,
      state: row.shipToState,
      country: row.shipToCountry,
      postalCode: row.shipToPostalCode
    },
    status: row.status,
    currency: "INR",
    subtotalInPaise: total,
    grandTotalInPaise: total,
    orderDate: row.orderDate,
    itemCount: row.items.reduce((s, i) => s + i.quantity, 0),
    linePreview: row.items.slice(0, 3).map((i) => i.productNameSnapshot ?? i.skuSnapshot),
    items,
    notes: row.notes,
    rawSnapshot: row
  };
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const allOrders = await prisma.order.findMany({
    where: { deletedAt: null },
    include: orderInclude,
    orderBy: { createdAt: "asc" }
  });

  const live: typeof allOrders = [];
  const archive: typeof allOrders = [];
  const del: typeof allOrders = [];

  for (const o of allOrders) {
    const bucket = classifyOrderForCutover(o);
    if (bucket === "live") live.push(o);
    else if (bucket === "archive") archive.push(o);
    else del.push(o);
  }

  const mpOrders = await prisma.marketplaceOrder.findMany({
    include: mpInclude,
    orderBy: { orderDate: "asc" }
  });

  const d2cKeySet = new Set<string>([
    ...archive.map((o) => o.orderNumber),
    ...archive.map((o) => legacyDedupeKeyD2C(o.orderNumber))
  ]);
  const d2cZohoIds = new Set(
    archive.map((o) => o.zohoInvoiceId).filter((x): x is string => Boolean(x))
  );

  const mpMerged: typeof mpOrders = [];
  const mpSkippedOverlap: typeof mpOrders = [];
  for (const mp of mpOrders) {
    const payload = (mp.rawPayload ?? {}) as { zohoInvoiceId?: string };
    if (
      marketplaceOverlapsD2C(
        { externalOrderId: mp.externalOrderId, channelCode: mp.channel.code },
        d2cKeySet,
        d2cZohoIds,
        payload.zohoInvoiceId ?? null
      )
    ) {
      mpSkippedOverlap.push(mp);
    } else {
      mpMerged.push(mp);
    }
  }

  const manifest = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    counts: {
      ordersLive: live.length,
      ordersArchive: archive.length,
      ordersDelete: del.length,
      marketplaceTotal: mpOrders.length,
      marketplaceMergedToLegacyOrders: mpMerged.length,
      marketplaceSkippedDedupe: mpSkippedOverlap.length,
      legacyMarketplaceArchiveRows: mpOrders.length
    },
    liveOrderNumbers: live.map((o) => o.orderNumber),
    archiveOrderNumbers: archive.map((o) => o.orderNumber),
    deleteOrderNumbers: del.map((o) => o.orderNumber),
    skippedMarketplaceExternalIds: mpSkippedOverlap.map((m) => ({
      channel: m.channel.code,
      externalOrderId: m.externalOrderId
    }))
  };

  console.log(JSON.stringify(manifest.counts, null, 2));
  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-manifest.json`), JSON.stringify(manifest, null, 2));

  if (!APPLY) {
    console.log("\nDry run. BACK UP DATABASE, then re-run with --apply");
    return;
  }

  // 1) Upsert D2C archives
  for (const o of archive) {
    const row = d2cArchiveRow(o);
    await prisma.legacyOrderArchive.upsert({
      where: { dedupeKey: row.dedupeKey },
      create: row,
      update: { ...row, migratedAt: new Date() }
    });
  }

  // 2) Upsert marketplace archives (full copy)
  for (const mp of mpOrders) {
    const row = mpArchiveRow(mp);
    await prisma.legacyMarketplaceOrderArchive.upsert({
      where: { originalMarketplaceOrderId: row.originalMarketplaceOrderId },
      create: row,
      update: { ...row, migratedAt: new Date() }
    });
  }

  // 3) Merge non-overlapping marketplace into unified legacy orders
  for (const mp of mpMerged) {
    const row = mpLegacyOrderRow(mp);
    await prisma.legacyOrderArchive.upsert({
      where: { dedupeKey: row.dedupeKey },
      create: row,
      update: { ...row, migratedAt: new Date() }
    });
  }

  // 4) Delete commerce test orders
  await deleteD2COrders(del.map((o) => o.id));

  // 5) Delete archived D2C from live table
  await deleteD2COrders(archive.map((o) => o.id));

  // 6) Clear live marketplace ops (archives retained)
  await prisma.marketplaceReturn.deleteMany({});
  await prisma.marketplaceOrderItem.deleteMany({});
  await prisma.marketplaceOrder.deleteMany({});

  console.log("\nCutover apply complete.");
  console.log(`Live orders remaining: ${live.length} (SRV-ACCT-* + post-cutover)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
