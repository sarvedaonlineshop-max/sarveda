import { getApiBase } from "@/lib/api";
import { AdminApiError } from "@/lib/admin-errors";

export type ServersSnapshot = {
  generatedAt: string;
  dayStartIst: string;
  traffic: {
    people: number | null;
    storefrontPeople: number | null;
    storefrontPageLoads: number;
    shopperHtml404: number;
    shopperFailedPeople: number | null;
    serverErrors: number;
    shopOutages: number;
    scanner404: number;
    linesWithClientIp: number;
    topShopper404: Array<{ path: string; count: number }>;
    note: string;
  };
  processes: Array<{
    name: string;
    status: string;
    cpuPercent: number | null;
    memoryMb: number | null;
    restarts: number | null;
    uptimeSeconds: number | null;
    pid: number | null;
  }>;
  health: { status: "ok" | "degraded"; database: "ok" | "error"; redis: "ok" | "error" };
  machine: {
    cpuPercent: number | null;
    load1: number;
    load5: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
  };
  storage?: {
    diskUsedBytes: number;
    diskTotalBytes: number;
    diskFreeBytes: number;
    diskUsedPercent: number;
    databaseBytes: number | null;
    historyDays: number;
    oldestDay: string | null;
    newestDay: string | null;
    checkoutVisitsKept: number;
    databaseGrowthPerDayBytes: number | null;
    note: string;
  };
};

export type ServersDetail =
  | {
      view: "people";
      people: Array<{ ip: string; country: string; utm: string | null; pages: string[] }>;
    }
  | {
      view: "storefront";
      storefront: Array<{
        ip: string;
        utm: string | null;
        firstAt: string;
        lastAt: string;
        products: string[];
        productCount: number;
        pages?: string[];
        cartProducts?: string[];
        addedToCart: boolean;
        checkout: boolean;
        bought: boolean;
        audience: "human" | "bot";
        note: string | null;
        country: string;
        place?: string;
      }>;
    }
  | { view: "missing"; missing: Array<{ path: string; utm: string | null; at: string }> }
  | { view: "outages"; outages: Array<{ from: string; to: string; requests: number; reason: string }> };

/** Furthest step only, so a buyer is not also counted as cart or checkout. */
export function storefrontStage(row: { bought: boolean; checkout: boolean; addedToCart: boolean }): "bought" | "checkout" | "cart" | "other" {
  if (row.bought) return "bought";
  if (row.checkout) return "checkout";
  if (row.addedToCart) return "cart";
  return "other";
}

export async function fetchServersDetail(view: ServersDetail["view"]): Promise<ServersDetail> {
  const res = await fetch(`${getApiBase()}/api/admin/servers/detail?view=${view}`, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: ServersDetail;
    error?: string;
    code?: string;
  };
  if (!res.ok || json.success === false || !json.data) {
    throw new AdminApiError(json.error?.trim() || `Request failed (${res.status})`, {
      status: res.status,
      code: json.code
    });
  }
  return json.data;
}

export type VisitorToday = {
  people: number | null;
  storefrontPeople: number | null;
  storefrontPageLoads: number;
};

export async function fetchVisitorDetail(view: "people" | "storefront"): Promise<ServersDetail> {
  const res = await fetch(`${getApiBase()}/api/admin/visitors/today/detail?view=${view}`, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: ServersDetail;
    error?: string;
    code?: string;
  };
  if (!res.ok || json.success === false || !json.data) {
    throw new AdminApiError(json.error?.trim() || `Request failed (${res.status})`, {
      status: res.status,
      code: json.code
    });
  }
  return json.data;
}

export async function fetchVisitorToday(): Promise<VisitorToday> {
  const res = await fetch(`${getApiBase()}/api/admin/visitors/today`, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: VisitorToday;
    error?: string;
    code?: string;
  };
  if (!res.ok || json.success === false || !json.data) {
    throw new AdminApiError(json.error?.trim() || `Request failed (${res.status})`, {
      status: res.status,
      code: json.code
    });
  }
  return json.data;
}

export async function fetchServersSnapshot(): Promise<ServersSnapshot> {
  const res = await fetch(`${getApiBase()}/api/admin/servers`, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: ServersSnapshot;
    error?: string;
    code?: string;
  };
  if (!res.ok || json.success === false || !json.data) {
    throw new AdminApiError(json.error?.trim() || `Request failed (${res.status})`, {
      status: res.status,
      code: json.code
    });
  }
  return json.data;
}
