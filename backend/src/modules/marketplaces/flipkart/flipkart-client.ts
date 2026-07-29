import { FLIPKART_API_BASE } from "../../../config/flipkart";
import { logger } from "../../../config/logger";
import { getFlipkartAccessToken } from "./flipkart-auth";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fkFetch<T>(
  path: string,
  opts: {
    method?: "GET" | "POST";
    body?: unknown;
    fullUrl?: string;
  } = {}
): Promise<T> {
  const token = await getFlipkartAccessToken();
  const url = opts.fullUrl ?? `${FLIPKART_API_BASE}${path}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 429 && attempt < 3) {
      const wait = 3000 * Math.pow(2, attempt);
      logger.warn("Flipkart API throttled, retrying", { path, attempt, waitMs: wait });
      await sleep(wait);
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as T & {
      errors?: Array<{ code?: string; message?: string }>;
    };

    if (!res.ok) {
      const first = body.errors?.[0];
      logger.error("Flipkart API request failed", {
        path,
        status: res.status,
        code: first?.code,
        message: first?.message,
      });
      throw Object.assign(
        new Error(first?.message ?? `Flipkart API error (${res.status})`),
        { statusCode: res.status >= 500 ? 502 : 400, code: first?.code ?? "FLIPKART_API_ERROR" }
      );
    }
    return body;
  }
  throw new Error(`Flipkart API: exhausted retries for ${path}`);
}

// --- Shipments (Orders) ---

export type FlipkartOrderItem = {
  orderItemId?: string;
  orderId?: string;
  listingId?: string;
  fsn?: string;
  sku?: string;
  quantity?: number;
  orderDate?: string;
  cancellationDate?: string;
  cancellationReason?: string;
  priceComponents?: {
    sellingPrice?: number;
    totalPrice?: number;
    shippingCharge?: number;
    customerPrice?: number;
    flipkartDiscount?: number;
  };
  status?: string;
  title?: string;
};

export type FlipkartShipment = {
  shipmentId?: string;
  dispatchByDate?: string;
  dispatchAfterDate?: string;
  updatedAt?: string;
  hold?: boolean;
  locationId?: string;
  orderItems?: FlipkartOrderItem[];
};

export type FlipkartShipmentDetail = {
  orderId?: string;
  shipmentId?: string;
  deliveryAddress?: {
    firstName?: string;
    lastName?: string;
    pincode?: string;
    city?: string;
    stateName?: string;
    addressLine1?: string;
    contactNumber?: string;
  };
  billingAddress?: {
    firstName?: string;
    lastName?: string;
    pincode?: string;
    city?: string;
    stateName?: string;
  };
};

type ShipmentsFilterResponse = {
  shipments?: FlipkartShipment[];
  hasMore?: boolean;
  nextPageUrl?: string;
};

export async function filterShipments(
  type: "preDispatch" | "postDispatch" | "cancelled",
  opts: {
    states?: string[];
    orderDateFrom?: string;
    orderDateTo?: string;
    pageSize?: number;
  } = {}
): Promise<ShipmentsFilterResponse> {
  const filter: Record<string, unknown> = { type };
  if (opts.states?.length) filter.states = opts.states;
  if (opts.orderDateFrom || opts.orderDateTo) {
    filter.orderDate = {
      from: opts.orderDateFrom,
      to: opts.orderDateTo,
    };
  }

  const pagination = { pageSize: opts.pageSize ?? 20 };

  return fkFetch<ShipmentsFilterResponse>("/v3/shipments/filter/", {
    method: "POST",
    body: { filter, pagination },
  });
}

export async function fetchAllShipments(
  type: "preDispatch" | "postDispatch" | "cancelled",
  opts: { orderDateFrom?: string; orderDateTo?: string; states?: string[]; maxPages?: number } = {}
): Promise<FlipkartShipment[]> {
  const maxPages = opts.maxPages ?? 50;
  const all: FlipkartShipment[] = [];
  let nextUrl: string | undefined;
  let page = 0;

  // First page
  const first = await filterShipments(type, {
    states: opts.states,
    orderDateFrom: opts.orderDateFrom,
    orderDateTo: opts.orderDateTo,
  });
  all.push(...(first.shipments ?? []));
  nextUrl = first.hasMore ? first.nextPageUrl : undefined;
  page = 1;

  while (nextUrl && page < maxPages) {
    await sleep(2000);
    page++;
    const data = await fkFetch<ShipmentsFilterResponse>("", { method: "GET", fullUrl: nextUrl });
    all.push(...(data.shipments ?? []));
    nextUrl = data.hasMore ? data.nextPageUrl : undefined;
  }

  return all;
}

export async function getShipmentDetails(shipmentIds: string[]): Promise<FlipkartShipmentDetail[]> {
  if (!shipmentIds.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < shipmentIds.length; i += 25) {
    chunks.push(shipmentIds.slice(i, i + 25));
  }

  const results: FlipkartShipmentDetail[] = [];
  for (const chunk of chunks) {
    const data = await fkFetch<{ shipments?: FlipkartShipmentDetail[] }>(
      `/v3/shipments/${chunk.join(",")}`
    );
    results.push(...(data.shipments ?? []));
    await sleep(2000);
  }
  return results;
}

// --- Returns ---

export type FlipkartReturn = {
  returnId?: string;
  orderId?: string;
  orderItemId?: string;
  sku?: string;
  fsn?: string;
  listingId?: string;
  quantity?: number;
  returnReason?: string;
  returnSubReason?: string;
  returnType?: string;
  status?: string;
  createdAt?: string;
  completedDate?: string;
  source?: string;
  shipmentId?: string;
  title?: string;
};

type ReturnsResponse = {
  returnItems?: FlipkartReturn[];
  hasMore?: boolean;
  nextUrl?: string;
};

export async function fetchAllReturns(
  source: "customer_return" | "courier_return",
  opts: { createdAfter?: string; createdBefore?: string; maxPages?: number } = {}
): Promise<FlipkartReturn[]> {
  const maxPages = opts.maxPages ?? 50;
  const all: FlipkartReturn[] = [];
  let page = 0;

  const params = new URLSearchParams({ source });
  if (opts.createdAfter) params.set("createdAfter", opts.createdAfter);
  if (opts.createdBefore) params.set("createdBefore", opts.createdBefore);

  let nextUrl: string | undefined = `/v2/returns?${params.toString()}`;

  while (nextUrl && page < maxPages) {
    page++;
    const useFullUrl: boolean = nextUrl.startsWith("http");
    const resp: ReturnsResponse = await fkFetch<ReturnsResponse>(
      useFullUrl ? "" : nextUrl,
      useFullUrl ? { fullUrl: nextUrl } : {}
    );
    all.push(...(resp.returnItems ?? []));
    nextUrl = resp.hasMore ? resp.nextUrl : undefined;
    if (nextUrl) await sleep(2000);
  }

  return all;
}
