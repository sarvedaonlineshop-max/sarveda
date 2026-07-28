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

async function spGet<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
  const token = await getAmazonSpAccessToken();
  const url = new URL(path, getAmazonSpApiBaseUrl());
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-amz-access-token": token,
      Accept: "application/json",
      "user-agent": "SarvedaMarketplaceHub/1.0 (Language=Node.js)"
    }
  });

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
  } while (nextToken && page < maxPages);

  if (nextToken) {
    logger.warn("Amazon orders sync hit page cap; remaining pages skipped", {
      maxPages,
      fetched: all.length
    });
  }
  return all;
}
