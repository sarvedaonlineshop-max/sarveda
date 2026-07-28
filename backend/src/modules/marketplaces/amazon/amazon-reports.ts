import { MarketplaceReturnStatus, Prisma } from "@prisma/client";
import { gunzipSync } from "node:zlib";

import { amazonEnv, isAmazonSpConfigured } from "../../../config/amazon";
import { prisma } from "../../../config/db";
import { logger } from "../../../config/logger";
import { getAmazonSpApiBaseUrl } from "../../../config/amazon";
import { getAmazonSpAccessToken } from "./amazon-sp-auth";

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
  const maxAttempts = 30;
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
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

export async function syncAmazonListingsReport(daysBack = 30) {
  const rows = await runFlatFileReport(
    "GET_MERCHANT_LISTINGS_ALL_DATA",
    isoDaysAgo(Math.max(1, Math.min(60, daysBack))),
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

export async function syncAmazonReturnsReport(daysBack = 30) {
  const rows = await runFlatFileReport(
    "GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE",
    isoDaysAgo(Math.max(1, Math.min(60, daysBack))),
    isoNowEndOfDay()
  );
  const channel = await prisma.marketplaceChannel.findUnique({ where: { code: "AMAZON" } });
  if (!channel) throw new Error("Amazon marketplace channel not seeded");

  let created = 0;
  let updated = 0;
  let unresolved = 0;

  for (const row of rows) {
    const externalOrderId = row.order_id;
    const order = externalOrderId
      ? await prisma.marketplaceOrder.findUnique({
          where: {
            channelId_externalOrderId: {
              channelId: channel.id,
              externalOrderId
            }
          },
          include: { items: true }
        })
      : null;
    if (!order) {
      unresolved += 1;
      continue;
    }

    const sellerSku = row.merchant_sku || row.seller_sku;
    const quantity = intValue(row.return_quantity) ?? 1;
    const orderItem =
      order.items.find((item) => item.skuSnapshot === sellerSku) ??
      order.items.find((item) => row.asin && item.skuSnapshot === row.asin) ??
      null;
    const dedupe = row.rma_id || row.amazon_rma_id || `${externalOrderId}:${sellerSku}:${row.return_request_date}`;
    const statusText = (row.return_request_status || row.return_request_status_ || "").toLowerCase();
    const status: MarketplaceReturnStatus =
      statusText.includes("refunded")
        ? "REFUNDED"
        : statusText.includes("received") || statusText.includes("approved")
          ? "RECEIVED"
          : "REQUESTED";

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
      reason: row.return_reason || row.return_reason_code || null,
      status,
      receivedAt: row.return_request_date ? new Date(row.return_request_date) : null,
      refundedAmountInPaise: amountToPaise(row.refund_amount),
      restockedToZoho: false,
      notes: `Amazon RMA ${dedupe}`,
      rawPayload: row as Prisma.InputJsonValue
    };

    if (existing) {
      await prisma.marketplaceReturn.update({
        where: { id: existing.id },
        data: payload
      });
      updated += 1;
    } else {
      await prisma.marketplaceReturn.create({ data: payload });
      created += 1;
    }
  }

  await prisma.marketplaceEventLog.create({
    data: {
      channelId: channel.id,
      eventType: "amazon.returns.sync",
      source: "API",
      dedupeKey: `amazon-returns:${Date.now()}`,
      rawPayload: { rows: rows.length, created, updated, unresolved },
      processedAt: new Date()
    }
  });

  logger.info("Amazon returns sync completed", { rows: rows.length, created, updated, unresolved });
  return { rows: rows.length, created, updated, unresolved };
}
