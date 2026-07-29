import { ETSY_API_BASE, etsyEnv } from "../../../config/etsy";
import { logger } from "../../../config/logger";
import { getEtsyAccessToken } from "./etsy-auth";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const APP_HEADER = etsyEnv.ETSY_SHARED_SECRET
  ? `${etsyEnv.ETSY_API_KEY}:${etsyEnv.ETSY_SHARED_SECRET}`
  : etsyEnv.ETSY_API_KEY;

export type EtsyListing = {
  listing_id?: number;
  title?: string;
  state?: string;
  sku?: string[];
  quantity?: number;
  price?: { amount?: number; divisor?: number } | number | string;
  inventory?: {
    products?: Array<{
      sku?: string | null;
      offerings?: Array<{ quantity?: number; price?: { amount?: number; divisor?: number } }>;
    }>;
  };
};

export type EtsyReceipt = {
  receipt_id?: number;
  name?: string;
  buyer_email?: string | null;
  first_line?: string | null;
  second_line?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country_iso?: string | null;
  status?: string | null;
  is_paid?: boolean;
  is_shipped?: boolean;
  created_timestamp?: number;
  updated_timestamp?: number;
  grandtotal?: { amount?: number; divisor?: number } | number | string;
  transactions?: EtsyTransaction[];
  refunds?: EtsyRefund[];
};

export type EtsyTransaction = {
  transaction_id?: number;
  title?: string | null;
  listing_id?: number | null;
  quantity?: number;
  sku?: string | string[] | null;
  price?: { amount?: number; divisor?: number } | number | string;
};

export type EtsyRefund = {
  refund_id?: number;
  amount?: { amount?: number; divisor?: number } | number | string;
  reason?: string | null;
  created_timestamp?: number;
  transaction_id?: number | null;
};

export type MonthWindow = {
  label: string;
  minCreated: number;
  maxCreated: number;
};

async function etsyFetch<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const token = await getEtsyAccessToken();
  const url = new URL(`${ETSY_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "x-api-key": APP_HEADER
      }
    });

    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      const wait = 2500 * Math.pow(2, attempt);
      logger.warn("Etsy API throttled, retrying", { path, attempt, waitMs: wait, status: res.status });
      await sleep(wait);
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      logger.error("Etsy API request failed", { path, status: res.status, error: body.error });
      throw Object.assign(new Error(body.error ?? `Etsy API error (${res.status})`), {
        statusCode: res.status >= 500 ? 502 : 400,
        code: "ETSY_API_ERROR"
      });
    }
    return body;
  }

  throw new Error(`Etsy API: exhausted retries for ${path}`);
}

/** Build calendar-month windows ending at now, oldest first. */
export function buildMonthWindows(monthsBack: number): MonthWindow[] {
  const windows: MonthWindow[] = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59));
    if (end.getTime() > now.getTime()) end.setTime(now.getTime());
    windows.push({
      label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
      minCreated: Math.floor(start.getTime() / 1000),
      maxCreated: Math.floor(end.getTime() / 1000)
    });
  }
  return windows;
}

export async function fetchEtsyListingsByState(state: string, limit = 100): Promise<EtsyListing[]> {
  const all: EtsyListing[] = [];
  let offset = 0;

  while (true) {
    const data = await etsyFetch<{ results?: EtsyListing[] }>(
      `/shops/${encodeURIComponent(etsyEnv.ETSY_SHOP_ID)}/listings`,
      { state, limit, offset, includes: "Inventory" }
    );
    const rows = data.results ?? [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
    await sleep(800);
  }

  return all;
}

export async function fetchActiveEtsyListings(limit = 100): Promise<EtsyListing[]> {
  const states = ["active", "inactive", "sold_out"];
  const all: EtsyListing[] = [];
  for (const state of states) {
    try {
      const rows = await fetchEtsyListingsByState(state, limit);
      all.push(...rows);
    } catch (err) {
      logger.warn("Etsy listings state fetch failed", {
        state,
        err: err instanceof Error ? err.message : String(err)
      });
    }
    await sleep(500);
  }
  return all;
}

export async function fetchEtsyReceipts(opts: {
  limit?: number;
  offset?: number;
  minCreated?: number;
  maxCreated?: number;
} = {}): Promise<EtsyReceipt[]> {
  const data = await etsyFetch<{ results?: EtsyReceipt[] }>(
    `/shops/${encodeURIComponent(etsyEnv.ETSY_SHOP_ID)}/receipts`,
    {
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
      min_created: opts.minCreated,
      max_created: opts.maxCreated,
      includes: "Transactions,Refunds"
    }
  );
  return data.results ?? [];
}

export async function fetchEtsyReceiptsForWindow(
  window: MonthWindow,
  maxPages = 20
): Promise<EtsyReceipt[]> {
  const all: EtsyReceipt[] = [];
  const limit = 100;
  let offset = 0;
  let page = 0;

  while (page < maxPages) {
    page += 1;
    const rows = await fetchEtsyReceipts({
      limit,
      offset,
      minCreated: window.minCreated,
      maxCreated: window.maxCreated
    });
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
    await sleep(1200);
  }

  return all;
}

export async function fetchAllEtsyReceipts(maxPages = 50): Promise<EtsyReceipt[]> {
  const all: EtsyReceipt[] = [];
  const limit = 100;
  let offset = 0;
  let page = 0;

  while (page < maxPages) {
    page += 1;
    const rows = await fetchEtsyReceipts({ limit, offset });
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
    await sleep(1000);
  }

  return all;
}

export async function fetchReceiptTransactions(receiptId: number): Promise<EtsyTransaction[]> {
  const data = await etsyFetch<{ results?: EtsyTransaction[] }>(
    `/shops/${encodeURIComponent(etsyEnv.ETSY_SHOP_ID)}/receipts/${receiptId}/transactions`
  );
  return data.results ?? [];
}
