import { MarketplaceReturnStatus, Prisma } from "@prisma/client";
import { gunzipSync } from "node:zlib";

import { amazonEnv, isAmazonSpConfigured } from "../../../config/amazon";
import { prisma } from "../../../config/db";
import { logger } from "../../../config/logger";
import { getAmazonSpApiBaseUrl } from "../../../config/amazon";
import { getAmazonSpAccessToken } from "./amazon-sp-auth";
import {
  listAmazonRefundFinancialEvents,
  type AmazonChargeComponent,
  type AmazonShipmentEvent,
  type AmazonShipmentItem
} from "./amazon-sp-client";

type ReportProcessingStatus = "CANCELLED" | "DONE" | "FATAL" | "IN_PROGRESS" | "IN_QUEUE";

type ReportDocumentPayload = {
  reportDocumentId: string;
  url: string;
  compressionAlgorithm?: "GZIP" | string;
};

function requireAmazon() {
  if (!isAmazonSpConfigured()) {
    throw Object.assign(new Error("Amazon SP-API is not configured."), {
      statusCode: 503,
      code: "AMAZON_NOT_CONFIGURED"
    });
  }
}

async function spFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAmazonSpAccessToken();
  const res = await fetch(new URL(path, getAmazonSpApiBaseUrl()).toString(), {
    ...init,
    headers: {
      Accept: "application/json",
      "content-type": "application/json",
      "user-agent": "SarvedaMarketplaceHub/1.0 (Language=Node.js)",
      "x-amz-access-token": token,
      ...(init?.headers ?? {})
    }
  });
  const body = (await res.json().catch(() => ({}))) as
    | T
    | { errors?: Array<{ code?: string; message?: string }> };
  if (!res.ok) {
    const errorBody = body as { errors?: Array<{ code?: string; message?: string }> };
    const first = errorBody.errors?.[0];
    throw Object.assign(new Error(first?.message ?? `Amazon SP-API error (${res.status})`), {
      statusCode: res.status >= 500 ? 502 : 400,
      code: first?.code ?? "AMAZON_API_ERROR"
    });
  }
  return body as T;
}

function normalizeHeader(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function parseTabDelimited(text: string): Array<Record<string, string>> {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx]?.trim() ?? "";
    });
    return row;
  });
}

function amountToPaise(value?: string): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function intValue(value?: string): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

async function createReport(reportType: string, dataStartTime: string, dataEndTime?: string) {
  const data = await spFetch<{ reportId: string }>("/reports/2021-06-30/reports", {
    method: "POST",
    body: JSON.stringify({
      reportType,
      marketplaceIds: [amazonEnv.AMAZON_SP_MARKETPLACE_ID],
      dataStartTime,
      ...(dataEndTime ? { dataEndTime } : {})
    })
  });
  return data.reportId;
}

async function getReport(reportId: string) {
  return spFetch<{
    reportId: string;
    processingStatus: ReportProcessingStatus;
    reportDocumentId?: string;
  }>(`/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`, { method: "GET" });
}

async function getReportDocument(reportDocumentId: string) {
  return spFetch<ReportDocumentPayload>(
    `/reports/2021-06-30/documents/${encodeURIComponent(reportDocumentId)}`,
    { method: "GET" }
  );
}

async function waitForReportDocumentId(reportId: string) {
  // FBA returns reports can queue longer than MFN reports.
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i += 1) {
    const report = await getReport(reportId);
    if (report.processingStatus === "DONE" && report.reportDocumentId) {
      return report.reportDocumentId;
    }
    if (report.processingStatus === "CANCELLED" || report.processingStatus === "FATAL") {
      throw Object.assign(new Error(`Amazon report ${reportId} failed with ${report.processingStatus}`), {
        statusCode: 502,
        code: "AMAZON_REPORT_FAILED"
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw Object.assign(new Error(`Amazon report ${reportId} timed out`), {
    statusCode: 504,
    code: "AMAZON_REPORT_TIMEOUT"
  });
}

async function downloadReportRows(reportDocumentId: string) {
  const document = await getReportDocument(reportDocumentId);
  const res = await fetch(document.url);
  if (!res.ok) {
    throw Object.assign(new Error(`Amazon report download failed (${res.status})`), {
      statusCode: 502,
      code: "AMAZON_REPORT_DOWNLOAD_FAILED"
    });
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text =
    document.compressionAlgorithm === "GZIP"
      ? gunzipSync(bytes).toString("utf8")
      : Buffer.from(bytes).toString("utf8");
  return parseTabDelimited(text);
}

async function runFlatFileReport(reportType: string, dataStartTime: string, dataEndTime?: string) {
  requireAmazon();
  const reportId = await createReport(reportType, dataStartTime, dataEndTime);
  const documentId = await waitForReportDocumentId(reportId);
  return downloadReportRows(documentId);
}

function isoDaysAgo(daysBack: number) {
  const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function isoNowEndOfDay() {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Calendar-month windows (oldest first) for report/order pagination. */
export function buildAmazonMonthWindows(monthsBack: number): Array<{
  label: string;
  dataStartTime: string;
  dataEndTime: string;
}> {
  const windows: Array<{ label: string; dataStartTime: string; dataEndTime: string }> = [];
  const now = new Date();
  const count = Math.max(1, Math.min(36, monthsBack));
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59, 999));
    if (end.getTime() > now.getTime()) end.setTime(now.getTime());
    windows.push({
      label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
      dataStartTime: start.toISOString(),
      dataEndTime: end.toISOString()
    });
  }
  return windows;
}

/** Parse Amazon report dates (ISO, YYYY-MM-DD, or MM/DD/YYYY). */
export function parseAmazonReportDate(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms);

  const ymd = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
  }

  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mdy) {
    return new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
  }

  return null;
}

export async function syncAmazonListingsReport(_daysBack = 30) {
  // Listings report is a merchant snapshot; short start window is enough for SP-API.
  const rows = await runFlatFileReport(
    "GET_MERCHANT_LISTINGS_ALL_DATA",
    isoDaysAgo(30),
    isoNowEndOfDay()
  );
  const channel = await prisma.marketplaceChannel.findUnique({ where: { code: "AMAZON" } });
  if (!channel) throw new Error("Amazon marketplace channel not seeded");

  let created = 0;
  let updated = 0;
  let unresolved = 0;

  for (const row of rows) {
    const sellerSku = row.seller_sku || row.sku;
    if (!sellerSku) continue;
    const variant = await prisma.productVariant.findUnique({
      where: { sku: sellerSku },
      select: { id: true }
    });
    if (!variant) {
      unresolved += 1;
      continue;
    }
    const existing = await prisma.marketplaceListing.findUnique({
      where: {
        channelId_variantId: {
          channelId: channel.id,
          variantId: variant.id
        }
      },
      select: { id: true }
    });
    await prisma.marketplaceListing.upsert({
      where: {
        channelId_variantId: {
          channelId: channel.id,
          variantId: variant.id
        }
      },
      create: {
        channelId: channel.id,
        variantId: variant.id,
        listingId: row.listing_id || row.product_id || null,
        externalSku: row.product_id || row.asin_1 || null,
        sellerSku,
        status: row.status?.toLowerCase().includes("inactive") ? "PAUSED" : "ACTIVE",
        isTracked: true,
        notes: `Amazon listing sync · qty ${row.quantity || "?"} · price ${row.price || "?"}`,
        lastSyncedAt: new Date()
      },
      update: {
        listingId: row.listing_id || row.product_id || undefined,
        externalSku: row.product_id || row.asin_1 || undefined,
        sellerSku,
        status: row.status?.toLowerCase().includes("inactive") ? "PAUSED" : "ACTIVE",
        isTracked: true,
        notes: `Amazon listing sync · qty ${row.quantity || "?"} · price ${row.price || "?"}`,
        lastSyncedAt: new Date()
      }
    });
    if (existing) updated += 1;
    else created += 1;
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "amazon.listings.sync",
      source: "API",
      dedupeKey: `amazon-listings:${Date.now()}`,
      rawPayload: { rows: rows.length, created, updated, unresolved },
      processedAt: new Date()
    }
  });

  logger.info("Amazon listings sync completed", { rows: rows.length, created, updated, unresolved });
  return { rows: rows.length, created, updated, unresolved };
}

export async function syncAmazonReturnsReportWindow(dataStartTime: string, dataEndTime: string) {
  const mfn = await syncAmazonMfnReturnsWindow(dataStartTime, dataEndTime);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  let fba = { rows: 0, created: 0, updated: 0, unresolved: 0, dataStartTime, dataEndTime };
  try {
    fba = await syncAmazonFbaReturnsWindow(dataStartTime, dataEndTime);
  } catch (err) {
    // FBA report needs Amazon Fulfillment role; keep MFN results if FBA is unavailable.
    logger.warn("Amazon FBA returns window failed", {
      dataStartTime,
      dataEndTime,
      err: err instanceof Error ? err.message : String(err)
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));
  let returnless = { rows: 0, created: 0, updated: 0, unresolved: 0, dataStartTime, dataEndTime };
  try {
    returnless = await syncAmazonReturnlessRefundsWindow(dataStartTime, dataEndTime);
  } catch (err) {
    // Finances API needs Finance role; keep physical return results if unavailable.
    logger.warn("Amazon returnless refunds window failed", {
      dataStartTime,
      dataEndTime,
      err: err instanceof Error ? err.message : String(err)
    });
  }

  return {
    rows: mfn.rows + fba.rows + returnless.rows,
    created: mfn.created + fba.created + returnless.created,
    updated: mfn.updated + fba.updated + returnless.updated,
    unresolved: mfn.unresolved + fba.unresolved + returnless.unresolved,
    dataStartTime,
    dataEndTime,
    mfn,
    fba,
    returnless
  };
}

type AmazonReturnUpsertStats = {
  rows: number;
  created: number;
  updated: number;
  unresolved: number;
  dataStartTime: string;
  dataEndTime: string;
};

function pickRefundAmountPaise(row: Record<string, string>): number | null {
  const candidates = [
    row.refunded_amount,
    row.refund_amount,
    row.refund_amount_,
    row.safet_claim_reimbursement_amount,
    row.order_amount
  ];
  for (const value of candidates) {
    const paise = amountToPaise(value);
    if (paise != null && paise !== 0) return paise;
  }
  // Explicit zero is still a value; prefer null so we can fall back to order line total.
  for (const value of candidates) {
    const paise = amountToPaise(value);
    if (paise != null) return paise;
  }
  return null;
}

async function upsertAmazonReturnRow(input: {
  channelId: string;
  row: Record<string, string>;
  source: "MFN" | "FBA";
}): Promise<"created" | "updated" | "unresolved"> {
  const { channelId, row, source } = input;
  const externalOrderId = row.order_id || row.amazon_order_id;
  const order = externalOrderId
    ? await prisma.marketplaceOrder.findUnique({
        where: {
          channelId_externalOrderId: {
            channelId,
            externalOrderId
          }
        },
        include: { items: true }
      })
    : null;
  if (!order) return "unresolved";

  const sellerSku = row.merchant_sku || row.seller_sku || row.sku;
  const itemName = (row.item_name || row.product_name || "").trim();
  const quantity = intValue(row.return_quantity) ?? intValue(row.quantity) ?? 1;
  const orderItem =
    order.items.find((item) => sellerSku && item.skuSnapshot === sellerSku) ??
    order.items.find((item) => row.asin && item.skuSnapshot === row.asin) ??
    order.items.find(
      (item) =>
        itemName &&
        item.productNameSnapshot &&
        item.productNameSnapshot.toLowerCase() === itemName.toLowerCase()
    ) ??
    (order.items.length === 1 ? order.items[0] : null);

  const returnDate =
    parseAmazonReportDate(row.return_request_date) ??
    parseAmazonReportDate(row.return_date) ??
    parseAmazonReportDate(row.refund_date) ??
    parseAmazonReportDate(row.order_date) ??
    order.orderDate;

  const rma =
    row.rma_id ||
    row.amazon_rma_id ||
    row.license_plate_number ||
    row.lpn ||
    `${externalOrderId}:${sellerSku || orderItem?.skuSnapshot || "item"}:${returnDate.toISOString().slice(0, 10)}`;
  const dedupe = `${source}:${rma}`;

  const statusText = (
    row.return_request_status ||
    row.return_request_status_ ||
    row.status ||
    row.detailed_disposition ||
    row.resolution ||
    ""
  ).toLowerCase();
  const status: MarketplaceReturnStatus =
    statusText.includes("refund") || statusText.includes("reimburs")
      ? "REFUNDED"
      : statusText.includes("received") ||
          statusText.includes("approved") ||
          statusText.includes("completed") ||
          statusText.includes("sellable") ||
          statusText.includes("unit returned") ||
          statusText.includes("repackaged")
        ? "RECEIVED"
        : "REQUESTED";

  const fromReport = pickRefundAmountPaise(row);
  const fromOrderLine =
    orderItem?.lineTotalInPaise != null
      ? Math.round((orderItem.lineTotalInPaise / Math.max(1, orderItem.quantity)) * quantity)
      : null;
  const refundedAmountInPaise = fromReport ?? fromOrderLine;

  const existing = await prisma.marketplaceReturn.findFirst({
    where: {
      marketplaceOrderId: order.id,
      OR: [
        { notes: { contains: dedupe } },
        { notes: { contains: `Amazon RMA ${rma}` } },
        { notes: { contains: rma } }
      ]
    }
  });

  const payload = {
    marketplaceOrderId: order.id,
    marketplaceOrderItemId: orderItem?.id ?? null,
    quantity,
    reason: row.return_reason || row.return_reason_code || row.reason || itemName || null,
    status,
    receivedAt: returnDate,
    refundedAmountInPaise,
    restockedToZoho: false,
    notes: `Amazon ${source} RMA ${dedupe}`,
    rawPayload: { source, ...row } as Prisma.InputJsonValue
  };

  if (existing) {
    await prisma.marketplaceReturn.update({
      where: { id: existing.id },
      data: payload
    });
    return "updated";
  }
  await prisma.marketplaceReturn.create({ data: payload });
  return "created";
}

async function syncAmazonMfnReturnsWindow(dataStartTime: string, dataEndTime: string): Promise<AmazonReturnUpsertStats> {
  const rows = await runFlatFileReport(
    "GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE",
    dataStartTime,
    dataEndTime
  );
  const channel = await prisma.marketplaceChannel.findUnique({ where: { code: "AMAZON" } });
  if (!channel) throw new Error("Amazon marketplace channel not seeded");

  let created = 0;
  let updated = 0;
  let unresolved = 0;

  for (const row of rows) {
    const result = await upsertAmazonReturnRow({ channelId: channel.id, row, source: "MFN" });
    if (result === "created") created += 1;
    else if (result === "updated") updated += 1;
    else unresolved += 1;
  }

  logger.info("Amazon MFN returns window sync completed", {
    dataStartTime,
    dataEndTime,
    rows: rows.length,
    created,
    updated,
    unresolved,
    sampleHeaders: rows[0] ? Object.keys(rows[0]).slice(0, 25) : []
  });

  return { rows: rows.length, created, updated, unresolved, dataStartTime, dataEndTime };
}

async function syncAmazonFbaReturnsWindow(dataStartTime: string, dataEndTime: string): Promise<AmazonReturnUpsertStats> {
  const rows = await runFlatFileReport(
    "GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA",
    dataStartTime,
    dataEndTime
  );
  const channel = await prisma.marketplaceChannel.findUnique({ where: { code: "AMAZON" } });
  if (!channel) throw new Error("Amazon marketplace channel not seeded");

  let created = 0;
  let updated = 0;
  let unresolved = 0;

  for (const row of rows) {
    const result = await upsertAmazonReturnRow({ channelId: channel.id, row, source: "FBA" });
    if (result === "created") created += 1;
    else if (result === "updated") updated += 1;
    else unresolved += 1;
  }

  logger.info("Amazon FBA returns window sync completed", {
    dataStartTime,
    dataEndTime,
    rows: rows.length,
    created,
    updated,
    unresolved,
    sampleHeaders: rows[0] ? Object.keys(rows[0]).slice(0, 25) : []
  });

  return { rows: rows.length, created, updated, unresolved, dataStartTime, dataEndTime };
}

function currencyToPaise(amount?: { CurrencyCode?: string; CurrencyAmount?: number } | null): number | null {
  if (amount?.CurrencyAmount == null || !Number.isFinite(amount.CurrencyAmount)) return null;
  return Math.round(Math.abs(amount.CurrencyAmount) * 100);
}

function principalRefundPaise(charges?: AmazonChargeComponent[] | null): number {
  if (!charges?.length) return 0;
  let total = 0;
  for (const charge of charges) {
    const type = (charge.ChargeType ?? "").toLowerCase();
    // Principal is the item refund; include tax if present so UI total matches what buyer got.
    if (type === "principal" || type === "tax" || type === "goodwill" || type === "discount") {
      total += currencyToPaise(charge.ChargeAmount) ?? 0;
    }
  }
  if (total > 0) return total;
  // Fallback: sum all charge adjustments if typed principal is missing.
  for (const charge of charges) {
    total += currencyToPaise(charge.ChargeAmount) ?? 0;
  }
  return total;
}

async function upsertReturnlessRefundItem(input: {
  channelId: string;
  amazonOrderId: string;
  postedDate: Date;
  item: AmazonShipmentItem;
  eventKind: "REFUND" | "GUARANTEE_CLAIM" | "CHARGEBACK";
}): Promise<"created" | "updated" | "unresolved" | "skipped"> {
  const { channelId, amazonOrderId, postedDate, item, eventKind } = input;
  const order = await prisma.marketplaceOrder.findUnique({
    where: {
      channelId_externalOrderId: {
        channelId,
        externalOrderId: amazonOrderId
      }
    },
    include: { items: true }
  });
  if (!order) return "unresolved";

  const sellerSku = item.SellerSKU?.trim() || null;
  const quantity = Math.max(1, item.QuantityShipped ?? 1);
  const refundedAmountInPaise = principalRefundPaise(item.ItemChargeAdjustmentList);
  if (refundedAmountInPaise <= 0 && !sellerSku) return "skipped";

  const orderItem =
    order.items.find((row) => sellerSku && row.skuSnapshot === sellerSku) ??
    (order.items.length === 1 ? order.items[0] : null);

  const amount =
    refundedAmountInPaise > 0
      ? refundedAmountInPaise
      : orderItem?.lineTotalInPaise != null
        ? Math.round((orderItem.lineTotalInPaise / Math.max(1, orderItem.quantity)) * quantity)
        : null;

  const day = postedDate.toISOString().slice(0, 10);
  const dedupe = `RETURNLESS:${eventKind}:${amazonOrderId}:${sellerSku || item.OrderAdjustmentItemId || "item"}:${day}`;

  // If a physical return already exists for this order+sku, enrich its refund amount instead of duplicating.
  const physical = await prisma.marketplaceReturn.findFirst({
    where: {
      marketplaceOrderId: order.id,
      AND: [
        {
          OR: [{ notes: null }, { notes: { not: { contains: "RETURNLESS:" } } }]
        },
        ...(sellerSku
          ? [
              {
                OR: [
                  { marketplaceOrderItem: { is: { skuSnapshot: sellerSku } } },
                  { notes: { contains: sellerSku } }
                ]
              }
            ]
          : [])
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  if (physical) {
    await prisma.marketplaceReturn.update({
      where: { id: physical.id },
      data: {
        status: "REFUNDED",
        refundedAmountInPaise: amount ?? physical.refundedAmountInPaise,
        receivedAt: physical.receivedAt ?? postedDate,
        notes: physical.notes?.includes("returnless refund linked")
          ? physical.notes
          : `${physical.notes || "Amazon return"} · returnless refund linked ${dedupe}`,
        rawPayload: {
          ...(typeof physical.rawPayload === "object" && physical.rawPayload && !Array.isArray(physical.rawPayload)
            ? (physical.rawPayload as object)
            : {}),
          returnlessRefund: item
        } as Prisma.InputJsonValue
      }
    });
    return "updated";
  }

  const existing = await prisma.marketplaceReturn.findFirst({
    where: {
      marketplaceOrderId: order.id,
      notes: { contains: dedupe }
    }
  });

  const payload = {
    marketplaceOrderId: order.id,
    marketplaceOrderItemId: orderItem?.id ?? null,
    quantity,
    reason: `Amazon returnless ${eventKind.toLowerCase().replace(/_/g, " ")}`,
    status: "REFUNDED" as MarketplaceReturnStatus,
    receivedAt: postedDate,
    refundedAmountInPaise: amount,
    restockedToZoho: false,
    notes: `Amazon RETURNLESS RMA ${dedupe}`,
    rawPayload: { source: "RETURNLESS", eventKind, item } as Prisma.InputJsonValue
  };

  if (existing) {
    await prisma.marketplaceReturn.update({ where: { id: existing.id }, data: payload });
    return "updated";
  }
  await prisma.marketplaceReturn.create({ data: payload });
  return "created";
}

async function ingestShipmentRefundEvents(
  channelId: string,
  events: AmazonShipmentEvent[],
  eventKind: "REFUND" | "GUARANTEE_CLAIM" | "CHARGEBACK",
  stats: { rows: number; created: number; updated: number; unresolved: number }
) {
  for (const event of events) {
    const amazonOrderId = event.AmazonOrderId?.trim();
    if (!amazonOrderId) {
      stats.unresolved += 1;
      continue;
    }
    const postedDate = event.PostedDate ? new Date(event.PostedDate) : new Date();
    const items = event.ShipmentItemAdjustmentList?.length
      ? event.ShipmentItemAdjustmentList
      : event.ShipmentItemList ?? [];

    if (items.length === 0) {
      // Order-level refund with no line items — still record one returnless row.
      const result = await upsertReturnlessRefundItem({
        channelId,
        amazonOrderId,
        postedDate,
        eventKind,
        item: {
          SellerSKU: undefined,
          QuantityShipped: 1,
          ItemChargeAdjustmentList: []
        }
      });
      stats.rows += 1;
      if (result === "created") stats.created += 1;
      else if (result === "updated") stats.updated += 1;
      else if (result === "unresolved") stats.unresolved += 1;
      continue;
    }

    for (const item of items) {
      const result = await upsertReturnlessRefundItem({
        channelId,
        amazonOrderId,
        postedDate,
        item,
        eventKind
      });
      stats.rows += 1;
      if (result === "created") stats.created += 1;
      else if (result === "updated") stats.updated += 1;
      else if (result === "unresolved") stats.unresolved += 1;
    }
  }
}

/**
 * Returnless refunds (and guarantee claims / chargebacks) via Finances API.
 * These never appear in FBA/MFN return reports.
 */
async function syncAmazonReturnlessRefundsWindow(
  dataStartTime: string,
  dataEndTime: string
): Promise<AmazonReturnUpsertStats> {
  const channel = await prisma.marketplaceChannel.findUnique({ where: { code: "AMAZON" } });
  if (!channel) throw new Error("Amazon marketplace channel not seeded");

  const finance = await listAmazonRefundFinancialEvents({
    postedAfter: dataStartTime,
    postedBefore: dataEndTime,
    maxPages: 15
  });

  const stats = { rows: 0, created: 0, updated: 0, unresolved: 0 };
  await ingestShipmentRefundEvents(channel.id, finance.refundEvents, "REFUND", stats);
  await ingestShipmentRefundEvents(channel.id, finance.guaranteeClaimEvents, "GUARANTEE_CLAIM", stats);
  await ingestShipmentRefundEvents(channel.id, finance.chargebackEvents, "CHARGEBACK", stats);

  // ChargeRefundEventList is order-agnostic in some payloads; skip unless we can attach later.
  if (finance.chargeRefundEvents.length > 0) {
    logger.info("Amazon ChargeRefundEventList seen (not order-linked; skipped)", {
      count: finance.chargeRefundEvents.length,
      dataStartTime,
      dataEndTime
    });
  }

  logger.info("Amazon returnless refunds window sync completed", {
    dataStartTime,
    dataEndTime,
    refundEvents: finance.refundEvents.length,
    guaranteeClaims: finance.guaranteeClaimEvents.length,
    chargebacks: finance.chargebackEvents.length,
    ...stats
  });

  return { ...stats, dataStartTime, dataEndTime };
}

/** Month-by-month returns sync — Amazon return reports are unreliable for long ranges. */
export async function syncAmazonReturnsReport(monthsBack = 24) {
  const channel = await prisma.marketplaceChannel.findUnique({ where: { code: "AMAZON" } });
  if (!channel) throw new Error("Amazon marketplace channel not seeded");

  const windows = buildAmazonMonthWindows(monthsBack);
  let rows = 0;
  let created = 0;
  let updated = 0;
  let unresolved = 0;
  const months: Array<{ month: string; rows: number; created: number; updated: number; unresolved: number; error?: string }> =
    [];

  for (const window of windows) {
    try {
      const result = await syncAmazonReturnsReportWindow(window.dataStartTime, window.dataEndTime);
      rows += result.rows;
      created += result.created;
      updated += result.updated;
      unresolved += result.unresolved;
      months.push({
        month: window.label,
        rows: result.rows,
        created: result.created,
        updated: result.updated,
        unresolved: result.unresolved
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Amazon returns month window failed", { month: window.label, err: message });
      months.push({
        month: window.label,
        rows: 0,
        created: 0,
        updated: 0,
        unresolved: 0,
        error: message
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "amazon.returns.sync",
      source: "API",
      dedupeKey: `amazon-returns:${Date.now()}`,
      rawPayload: { monthsBack, rows, created, updated, unresolved, months },
      processedAt: new Date()
    }
  });

  logger.info("Amazon returns sync completed", { monthsBack, rows, created, updated, unresolved });
  return { rows, created, updated, unresolved, months };
}
