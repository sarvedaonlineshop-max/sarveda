import { execFile } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import os from "node:os";
import type { Request, Response } from "express";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { getRedisConnection } from "../../config/redisConnection";
import { z } from "zod";

import { detailAccessLines, startOfTodayIstUtc, summarizeAccessLines, type AccessDetail } from "./servers.metrics";

const execFileAsync = promisify(execFile);

export const SERVERS_DASHBOARD_EMAIL = "partha@sarveda.com";

const LOG_FILES = ["/var/log/nginx/access.log", "/var/log/nginx/access.log.1"];
const PROCESS_NAMES = ["sarveda-frontend-preview", "sarveda-backend"];
const CACHE_MS = 30_000;

type ProcessRow = {
  name: string;
  status: string;
  cpuPercent: number | null;
  memoryMb: number | null;
  restarts: number | null;
  uptimeSeconds: number | null;
  pid: number | null;
};

type Snapshot = {
  generatedAt: string;
  dayStartIst: string;
  traffic: ReturnType<typeof summarizeAccessLines> & { note: string };
  processes: ProcessRow[];
  health: { status: "ok" | "degraded"; database: "ok" | "error"; redis: "ok" | "error" };
  machine: {
    cpuPercent: number | null;
    load1: number;
    load5: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
  };
};

let cache: { at: number; data: Snapshot } | null = null;

export function isServersDashboardEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SERVERS_DASHBOARD_EMAIL;
}

async function readLines(path: string): Promise<string[]> {
  const lines: string[] = [];
  try {
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) lines.push(line);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") logger.warn("servers log unreadable", { path, code });
  }
  return lines;
}

async function cpuPercent(): Promise<number | null> {
  try {
    const read = () => {
      const line = readFileSync("/proc/stat", "utf8").split("\n")[0] ?? "";
      const parts = line.trim().split(/\s+/).slice(1).map(Number);
      const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
      const total = parts.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
      return { idle, total };
    };
    const a = read();
    await new Promise((r) => setTimeout(r, 200));
    const b = read();
    const total = b.total - a.total;
    const idle = b.idle - a.idle;
    if (total <= 0) return null;
    return Math.round((1 - idle / total) * 1000) / 10;
  } catch {
    return null;
  }
}

async function processRows(): Promise<ProcessRow[]> {
  let raw = "";
  try {
    const result = await execFileAsync("pm2", ["jlist"], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 });
    raw = result.stdout;
  } catch {
    return PROCESS_NAMES.map((name) => ({
      name,
      status: "unknown",
      cpuPercent: null,
      memoryMb: null,
      restarts: null,
      uptimeSeconds: null,
      pid: null
    }));
  }

  let list: Array<{
    name?: string;
    pid?: number;
    monit?: { cpu?: number; memory?: number };
    pm2_env?: { status?: string; restart_time?: number; pm_uptime?: number };
  }> = [];
  try {
    list = JSON.parse(raw) as typeof list;
  } catch {
    list = [];
  }

  const byName = new Map(list.map((row) => [row.name, row]));
  const now = Date.now();
  return PROCESS_NAMES.map((name) => {
    const row = byName.get(name);
    if (!row) {
      return {
        name,
        status: "missing",
        cpuPercent: null,
        memoryMb: null,
        restarts: null,
        uptimeSeconds: null,
        pid: null
      };
    }
    const up = row.pm2_env?.pm_uptime;
    return {
      name,
      status: row.pm2_env?.status ?? "unknown",
      cpuPercent: typeof row.monit?.cpu === "number" ? row.monit.cpu : null,
      memoryMb: typeof row.monit?.memory === "number" ? Math.round(row.monit.memory / (1024 * 1024)) : null,
      restarts: typeof row.pm2_env?.restart_time === "number" ? row.pm2_env.restart_time : null,
      uptimeSeconds: typeof up === "number" ? Math.max(0, Math.round((now - up) / 1000)) : null,
      pid: typeof row.pid === "number" ? row.pid : null
    };
  });
}

async function health(): Promise<Snapshot["health"]> {
  let database: "ok" | "error" = "error";
  let redis: "ok" | "error" = "error";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    database = "error";
  }
  try {
    const client = getRedisConnection();
    if (client) {
      await client.ping();
      redis = "ok";
    }
  } catch {
    redis = "error";
  }
  return { database, redis, status: database === "ok" && redis === "ok" ? "ok" : "degraded" };
}

async function buildSnapshot(): Promise<Snapshot> {
  const start = startOfTodayIstUtc();
  const chunks = await Promise.all(LOG_FILES.map((path) => readLines(path)));
  const traffic = summarizeAccessLines(chunks.flat(), start);
  const [processes, healthRow, cpu] = await Promise.all([processRows(), health(), cpuPercent()]);
  const total = os.totalmem();
  const free = os.freemem();
  const [load1, load5] = os.loadavg();
  const note =
    (traffic.people === null
      ? "Visitor counts start once the web log records the shopper address. "
      : "People are distinct shopper addresses since the web log started recording them. One person on two networks counts twice. ") +
    `Server failures are only requests that found the shop or the API stopped, in ${traffic.shopOutages} stop${traffic.shopOutages === 1 ? "" : "s"} today. A slow picture is not counted.`;

  return {
    generatedAt: new Date().toISOString(),
    dayStartIst: start.toISOString(),
    traffic: { ...traffic, note },
    processes,
    health: healthRow,
    machine: {
      cpuPercent: cpu,
      load1: Math.round(load1 * 100) / 100,
      load5: Math.round(load5 * 100) / 100,
      memoryUsedMb: Math.round((total - free) / (1024 * 1024)),
      memoryTotalMb: Math.round(total / (1024 * 1024))
    }
  };
}

const detailViewSchema = z.enum(["people", "storefront", "missing", "outages"]);
type VisitorPlace = { country: string; place: string };
const placeByIp = new Map<string, VisitorPlace>();
let detailCache: { at: number; data: AccessDetail } | null = null;

function formatPlace(row: {
  status?: string;
  country?: string;
  regionName?: string;
  city?: string;
}): VisitorPlace {
  const country = row.status === "success" && row.country ? row.country : "Unknown";
  const city = row.city?.trim() ?? "";
  const region = row.regionName?.trim() ?? "";
  let place = country;
  if (city && region && city.toLowerCase() !== region.toLowerCase()) place = `${city}, ${region}`;
  else if (city) place = city;
  else if (region) place = region;
  if (place !== country && country !== "Unknown" && country !== "India") place = `${place}, ${country}`;
  return { country, place };
}

async function lookupCountries(ips: string[]): Promise<void> {
  const pending = ips.filter((ip) => !placeByIp.has(ip));
  for (let i = 0; i < pending.length; i += 100) {
    const batch = pending.slice(i, i + 100);
    try {
      const res = await fetch("http://ip-api.com/batch?fields=status,country,regionName,city,query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;
      const rows = (await res.json()) as Array<{
        status?: string;
        country?: string;
        regionName?: string;
        city?: string;
        query?: string;
      }>;
      for (const row of rows) {
        if (!row.query) continue;
        placeByIp.set(row.query, formatPlace(row));
      }
    } catch (err) {
      logger.warn("servers country lookup failed", { err });
    }
  }
  for (const ip of pending) {
    if (!placeByIp.has(ip)) placeByIp.set(ip, { country: "Unknown", place: "Unknown" });
  }
}

async function loadDetail(): Promise<AccessDetail> {
  if (detailCache && Date.now() - detailCache.at < 60_000) return detailCache.data;
  const start = startOfTodayIstUtc();
  const chunks = await Promise.all(LOG_FILES.map((path) => readLines(path)));
  const data = detailAccessLines(chunks.flat(), start);
  detailCache = { at: Date.now(), data };
  return data;
}

export async function serversDetail(req: Request, res: Response) {
  const parsed = detailViewSchema.safeParse(req.query.view);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Unknown detail", code: "BAD_REQUEST" });
    return;
  }
  try {
    const data = await loadDetail();
    if (parsed.data === "people") {
      await lookupCountries(data.people.map((row) => row.ip));
      res.json({
        success: true,
        data: {
          view: "people",
          people: data.people.map((row) => ({ ...row, country: placeByIp.get(row.ip)?.country ?? "Unknown" }))
        }
      });
      return;
    }
    if (parsed.data === "storefront") {
      await lookupCountries(data.storefront.map((row) => row.ip));
      res.json({
        success: true,
        data: {
          view: "storefront",
          storefront: data.storefront.map((row) => ({
            ...row,
            country: placeByIp.get(row.ip)?.country ?? "Unknown",
            place: placeByIp.get(row.ip)?.place ?? "Unknown"
          }))
        }
      });
      return;
    }
    if (parsed.data === "missing") {
      res.json({ success: true, data: { view: "missing", missing: data.missing } });
      return;
    }
    res.json({ success: true, data: { view: "outages", outages: data.outages } });
  } catch (err) {
    logger.error("servers detail failed", { err });
    res.status(500).json({ success: false, error: "Could not read server detail", code: "SERVERS_DETAIL_FAILED" });
  }
}

export async function serversDashboard(_req: Request, res: Response) {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      res.json({ success: true, data: cache.data });
      return;
    }
    const data = await buildSnapshot();
    cache = { at: Date.now(), data };
    res.json({ success: true, data });
  } catch (err) {
    logger.error("servers dashboard failed", { err });
    res.status(500).json({ success: false, error: "Could not read server status", code: "SERVERS_STATUS_FAILED" });
  }
}
