import { execFile } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import os from "node:os";
import type { Request, Response } from "express";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { getRedisConnection } from "../../config/redisConnection";
import { startOfTodayIstUtc, summarizeAccessLines } from "./servers.metrics";

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
    traffic.people === null
      ? "Visitor counts start once the web log records the shopper address. Failure counts cover all of today."
      : "People are distinct shopper addresses since the web log started recording them. One person on two networks counts twice. Failure counts cover all of today.";

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
