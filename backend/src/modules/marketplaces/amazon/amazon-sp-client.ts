import { amazonEnv, getAmazonSpApiBaseUrl } from "../../../config/amazon";
import { logger } from "../../../config/logger";
import { getAmazonSpAccessToken } from "./amazon-sp-auth";

export type AmazonOrder = {
  AmazonOrderId: string;
  PurchaseDate?: string;
  LastUpdateDate?: string;
  OrderStatus?: string;
  FulfillmentChannel?: string;
  SalesChannel?: string;
  OrderTotal?: { CurrencyCode?: string; Amount?: string };
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
  ShippingAddress?: {
    Name?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
    Phone?: string;
  };
  BuyerInfo?: {
    BuyerEmail?: string;
    BuyerName?: string;
  };
  EarliestShipDate?: string;
  LatestShipDate?: string;
};

export type AmazonOrderItem = {
  ASIN?: string;
  SellerSKU?: string;
  Title?: string;
  QuantityOrdered?: number;
  QuantityShipped?: number;
  ItemPrice?: { CurrencyCode?: string; Amount?: string };
  OrderItemId?: string;
};

type SpApiErrorBody = {
  errors?: Array<{ code?: string; message?: string; details?: string }>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function spFetch<T>(
  path: string,
  opts: { query?: Record<string, string | undefined>; accessToken?: string; retries?: number } = {}
): Promise<T> {
  const token = opts.accessToken ?? (await getAmazonSpAccessToken());
  const url = new URL(path, getAmazonSpApiBaseUrl());
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    }
  }

  const maxRetries = opts.retries ?? 4;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-amz-access-token": token,
        Accept: "application/json",
        "user-agent": "SarvedaMarketplaceHub/1.0 (Language=Node.js)"
      }
    });

    if (res.status === 429 && attempt < maxRetries) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 30000);
      logger.warn("Amazon SP-API throttled, retrying", { path, attempt, waitMs: wait });
      await sleep(wait);
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as T & SpApiErrorBody;
    if (!res.ok) {
      const first = body.errors?.[0];
      logger.error("Amazon SP-API request failed", {
        path,
        status: res.status,
        code: first?.code,
        message: first?.message
      });
      throw Object.assign(
        new Error(first?.message ?? `Amazon SP-API error (${res.status})`),
        { statusCode: res.status >= 500 ? 502 : 400, code: first?.code ?? "AMAZON_API_ERROR" }
      );
    }
    return body;
  }

  throw new Error(`Amazon SP-API: exhausted retries for ${path}`);
}

async function spGet<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
  return spFetch<T>(path, { query });
}

/**
 * Request a Restricted Data Token for accessing buyer PII on orders.
 * Returns the RDT access token string, or null if the call fails
 * (e.g. app doesn't have the role yet).
 */
export async function getRestrictedDataToken(orderIds: string[]): Promise<string | null> {
  try {
    const token = await getAmazonSpAccessToken();
    const baseUrl = getAmazonSpApiBaseUrl();

    const restrictedResources = orderIds.map((id) => ({
      method: "GET" as const,
      path: `/orders/v0/orders/${id}`,
      dataElements: ["buyerInfo", "shippingAddress"]
    }));

    const rdtUrl = new URL("/tokens/2021-03-01/restrictedDataToken", baseUrl).toString();
    const rdtBody = JSON.stringify({ restrictedResources });
    const rdtHeaders = {
      "x-amz-access-token": token,
      "Content-Type": "application/json",
      "user-agent": "SarvedaMarketplaceHub/1.0 (Language=Node.js)"
    };

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(rdtUrl, { method: "POST", headers: rdtHeaders, body: rdtBody });

      if (res.status === 429 && attempt < 3) {
        const wait = 3000 * Math.pow(2, attempt);
        logger.warn("RDT throttled, retrying", { attempt, waitMs: wait });
        await sleep(wait);
        continue;
      }

      const data = (await res.json().catch(() => ({}))) as {
        restrictedDataToken?: string;
        errors?: Array<{ code?: string; message?: string }>;
      };

      if (!res.ok || !data.restrictedDataToken) {
        logger.warn("RDT request failed — buyer PII will be unavailable", {
          status: res.status,
          error: data.errors?.[0]?.message
        });
        return null;
      }

      return data.restrictedDataToken;
    }

    return null;
  } catch (err) {
    logger.warn("RDT request threw — buyer PII will be unavailable", { err });
    return null;
  }
}

/**
 * Fetch a single order with RDT token to get buyer PII fields.
 */
export async function getOrderWithPII(orderId: string, rdtToken: string): Promise<AmazonOrder | null> {
  try {
    const data = await spFetch<{ payload?: AmazonOrder }>(
      `/orders/v0/orders/${encodeURIComponent(orderId)}`,
      { accessToken: rdtToken }
    );
    return data.payload ?? null;
  } catch {
    return null;
  }
}

export async function listAmazonOrders(params: {
  createdAfter: string;
  createdBefore?: string;
  orderStatuses?: string[];
  nextToken?: string;
}): Promise<{ orders: AmazonOrder[]; nextToken?: string }> {
  const query: Record<string, string | undefined> = {
    MarketplaceIds: amazonEnv.AMAZON_SP_MARKETPLACE_ID,
    CreatedAfter: params.createdAfter,
    CreatedBefore: params.createdBefore,
    OrderStatuses: params.orderStatuses?.length ? params.orderStatuses.join(",") : undefined,
    NextToken: params.nextToken
  };

  const data = await spGet<{
    payload?: { Orders?: AmazonOrder[]; NextToken?: string };
  }>("/orders/v0/orders", query);

  return {
    orders: data.payload?.Orders ?? [],
    nextToken: data.payload?.NextToken
  };
}

export async function listAmazonOrderItems(amazonOrderId: string): Promise<AmazonOrderItem[]> {
  const items: AmazonOrderItem[] = [];
  let nextToken: string | undefined;

  do {
    const data = await spGet<{
      payload?: { OrderItems?: AmazonOrderItem[]; NextToken?: string };
    }>(`/orders/v0/orders/${encodeURIComponent(amazonOrderId)}/orderItems`, {
      NextToken: nextToken
    });
    items.push(...(data.payload?.OrderItems ?? []));
    nextToken = data.payload?.NextToken;
  } while (nextToken);

  return items;
}

/** Fetch all pages for a date window (caps pages to avoid runaway sync). */
export async function listAllAmazonOrders(params: {
  createdAfter: string;
  createdBefore?: string;
  orderStatuses?: string[];
  maxPages?: number;
}): Promise<AmazonOrder[]> {
  const maxPages = params.maxPages ?? 20;
  const all: AmazonOrder[] = [];
  let nextToken: string | undefined;
  let page = 0;

  do {
    page += 1;
    const batch = await listAmazonOrders({
      createdAfter: params.createdAfter,
      createdBefore: params.createdBefore,
      orderStatuses: params.orderStatuses,
      nextToken
    });
    all.push(...batch.orders);
    nextToken = batch.nextToken;
    if (nextToken) await sleep(3000);
  } while (nextToken && page < maxPages);

  if (nextToken) {
    logger.warn("Amazon orders sync hit page cap; remaining pages skipped", {
      maxPages,
      fetched: all.length
    });
  }
  return all;
}

export type AmazonCurrency = {
  CurrencyCode?: string;
  CurrencyAmount?: number;
};

export type AmazonChargeComponent = {
  ChargeType?: string;
  ChargeAmount?: AmazonCurrency;
};

export type AmazonShipmentItem = {
  SellerSKU?: string;
  OrderItemId?: string;
  OrderAdjustmentItemId?: string;
  QuantityShipped?: number;
  ItemChargeAdjustmentList?: AmazonChargeComponent[];
  ItemChargeList?: AmazonChargeComponent[];
};

export type AmazonShipmentEvent = {
  AmazonOrderId?: string;
  SellerOrderId?: string;
  MarketplaceName?: string;
  PostedDate?: string;
  ShipmentItemList?: AmazonShipmentItem[];
  ShipmentItemAdjustmentList?: AmazonShipmentItem[];
};

export type AmazonChargeRefundEvent = {
  PostedDate?: string;
  ReasonCode?: string;
  ReasonCodeDescription?: string;
  ChargeRefundTransactions?: Array<{
    ChargeAmount?: AmazonCurrency;
    ChargeType?: string;
  }>;
};

/** Finances API — refund / returnless refund events for a posted-date window. */
export async function listAmazonRefundFinancialEvents(params: {
  postedAfter: string;
  postedBefore: string;
  maxPages?: number;
}): Promise<{
  refundEvents: AmazonShipmentEvent[];
  guaranteeClaimEvents: AmazonShipmentEvent[];
  chargebackEvents: AmazonShipmentEvent[];
  chargeRefundEvents: AmazonChargeRefundEvent[];
}> {
  const maxPages = params.maxPages ?? 20;
  const refundEvents: AmazonShipmentEvent[] = [];
  const guaranteeClaimEvents: AmazonShipmentEvent[] = [];
  const chargebackEvents: AmazonShipmentEvent[] = [];
  const chargeRefundEvents: AmazonChargeRefundEvent[] = [];
  let nextToken: string | undefined;
  let page = 0;

  do {
    page += 1;
    const data = await spGet<{
      payload?: {
        FinancialEvents?: {
          RefundEventList?: AmazonShipmentEvent[];
          GuaranteeClaimEventList?: AmazonShipmentEvent[];
          ChargebackEventList?: AmazonShipmentEvent[];
          ChargeRefundEventList?: AmazonChargeRefundEvent[];
        };
        NextToken?: string;
      };
    }>("/finances/v0/financialEvents", {
      PostedAfter: params.postedAfter,
      PostedBefore: params.postedBefore,
      MaxResultsPerPage: "100",
      NextToken: nextToken
    });

    const events = data.payload?.FinancialEvents;
    if (events?.RefundEventList?.length) refundEvents.push(...events.RefundEventList);
    if (events?.GuaranteeClaimEventList?.length) {
      guaranteeClaimEvents.push(...events.GuaranteeClaimEventList);
    }
    if (events?.ChargebackEventList?.length) chargebackEvents.push(...events.ChargebackEventList);
    if (events?.ChargeRefundEventList?.length) {
      chargeRefundEvents.push(...events.ChargeRefundEventList);
    }

    nextToken = data.payload?.NextToken;
    if (nextToken) await sleep(2000);
  } while (nextToken && page < maxPages);

  if (nextToken) {
    logger.warn("Amazon financial events hit page cap", {
      maxPages,
      refundEvents: refundEvents.length
    });
  }

  return { refundEvents, guaranteeClaimEvents, chargebackEvents, chargeRefundEvents };
}
