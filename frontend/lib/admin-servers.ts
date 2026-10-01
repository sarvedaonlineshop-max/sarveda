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
};

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
