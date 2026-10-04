import { createReadStream, readdirSync, statfsSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import {
  accumulateRetention,
  istDayKey,
  retentionFromAccum,
  type TrafficDayKeep
} from "./servers.metrics";

const LOG_DIR = "/var/log/nginx";
const RECENT_FILES = [`${LOG_DIR}/access.log.1`, `${LOG_DIR}/access.log`];
const PERSIST_GAP_MS = 5 * 60 * 1000;

export type StorageStatus = {
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

let lastPersistAt = 0;
let backfillStarted = false;
let backfillDone = false;

function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

async function readPlainLines(path: string): Promise<string[]> {
  const lines: string[] = [];
  try {
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) lines.push(line);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") logger.warn("traffic log unreadable", { path, code });
  }
  return lines;
}

async function persistDays(days: TrafficDayKeep[]): Promise<void> {
  for (const day of days) {
    const when = dayDate(day.day);
    const ips = day.visits.map((visit) => visit.clientIp);
    await prisma.$transaction(
      async (tx) => {
        await tx.trafficDay.upsert({
          where: { day: when },
          create: {
            day: when,
            people: day.people,
            storefrontPageLoads: day.storefrontPageLoads,
            missingPages: day.missingPages,
            checkoutPeople: day.checkoutPeople,
            checkoutOpens: day.checkoutOpens,
            cartAdds: day.cartAdds,
            ordersConfirmed: day.ordersConfirmed
          },
          update: {
            people: day.people,
            storefrontPageLoads: day.storefrontPageLoads,
            missingPages: day.missingPages,
            checkoutPeople: day.checkoutPeople,
            checkoutOpens: day.checkoutOpens,
            cartAdds: day.cartAdds,
            ordersConfirmed: day.ordersConfirmed
          }
        });
        if (ips.length === 0) {
          await tx.checkoutVisit.deleteMany({ where: { day: when } });
        } else {
          await tx.checkoutVisit.deleteMany({ where: { day: when, clientIp: { notIn: ips } } });
        }
        for (const visit of day.visits) {
          const row = await tx.checkoutVisit.upsert({
            where: { day_clientIp: { day: when, clientIp: visit.clientIp } },
            create: {
              day: when,
              clientIp: visit.clientIp,
              firstAt: visit.firstAt,
              lastAt: visit.lastAt,
              utm: visit.utm,
              bought: visit.bought
            },
            update: {
              firstAt: visit.firstAt,
              lastAt: visit.lastAt,
              utm: visit.utm,
              bought: visit.bought
            }
          });
          await tx.checkoutVisitItem.deleteMany({ where: { visitId: row.id } });
          if (visit.items.length > 0) {
            await tx.checkoutVisitItem.createMany({
              data: visit.items.map((item) => ({ visitId: row.id, slug: item.slug, inCart: item.inCart }))
            });
          }
        }
      },
      { timeout: 60_000 }
    );
  }
}

/** Save the two newest web logs. Older days stay as they were written from the compressed logs. */
export async function persistRecentTraffic(lines: Iterable<string>): Promise<void> {
  if (!backfillDone) return;
  const now = Date.now();
  if (now - lastPersistAt < PERSIST_GAP_MS) return;
  lastPersistAt = now;
  try {
    const days = retentionFromAccum(await accumulateRetention(lines));
    await persistDays(days);
    await recordStorageSample();
  } catch (err) {
    lastPersistAt = 0;
    logger.warn("traffic retention persist failed", { err });
  }
}

async function backfillLogs(): Promise<void> {
  const acc = new Map();
  let names: string[] = [];
  try {
    names = readdirSync(LOG_DIR);
  } catch {
    return;
  }
  const gzipped = names
    .filter((name) => /^access\.log\.\d+\.gz$/.test(name))
    .sort((a, b) => Number(a.match(/\.(\d+)\.gz$/)?.[1] ?? 0) - Number(b.match(/\.(\d+)\.gz$/)?.[1] ?? 0));
  for (const name of gzipped) {
    const rl = createInterface({
      input: createReadStream(`${LOG_DIR}/${name}`).pipe(createGunzip()),
      crlfDelay: Infinity
    });
    await accumulateRetention(rl, acc);
  }
  for (const path of RECENT_FILES) {
    await accumulateRetention(await readPlainLines(path), acc);
  }
  await persistDays(retentionFromAccum(acc));
  await recordStorageSample();
  lastPersistAt = Date.now();
  logger.info("traffic retention backfill done", { days: acc.size });
}

/** One pass over the compressed web logs still on disk. Later refreshes only update the open logs. */
export function startTrafficRetention(): void {
  if (backfillStarted) return;
  backfillStarted = true;
  void backfillLogs()
    .catch((err) => {
      logger.error("traffic retention backfill failed", { err });
    })
    .finally(() => {
      backfillDone = true;
    });
}

function diskBytes(): { used: number; total: number; free: number } {
  const stat = statfsSync("/");
  const bsize = Number(stat.bsize);
  const total = Number(stat.blocks) * bsize;
  const free = Number(stat.bavail) * bsize;
  const used = (Number(stat.blocks) - Number(stat.bfree)) * bsize;
  return { used, total, free };
}

async function databaseBytes(): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ bytes: bigint }>>`
    SELECT pg_database_size(current_database()) AS bytes
  `;
  const bytes = rows[0]?.bytes;
  if (bytes == null) return null;
  return Number(bytes);
}

async function recordStorageSample(): Promise<void> {
  const day = dayDate(istDayKey(new Date()));
  const existing = await prisma.storageDay.findUnique({ where: { day } });
  if (existing) return;
  const disk = diskBytes();
  const database = await databaseBytes();
  if (database == null) return;
  try {
    await prisma.storageDay.create({
      data: {
        day,
        diskUsedBytes: BigInt(disk.used),
        diskTotalBytes: BigInt(disk.total),
        databaseBytes: BigInt(database)
      }
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "P2002") throw err;
  }
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (Math.abs(mb) >= 100) return `${Math.round(mb)} MB`;
  return `${Math.round(mb * 10) / 10} MB`;
}

function storageNote(input: {
  databaseBytes: number | null;
  growthPerDay: number | null;
  sampleDays: number;
  historyDays: number;
}): string {
  if (input.databaseBytes == null) {
    return "Disk size is available. Database size could not be read.";
  }
  const db = formatMb(input.databaseBytes);
  if (input.growthPerDay == null || input.sampleDays < 2) {
    return `The database is ${db}. Checkout history adds well under 1 MB a month. Growth per day appears here after one more day. The free space is tens of gigabytes, so the database will not fill this disk soon.`;
  }
  const perDay = formatMb(input.growthPerDay);
  return `The database is ${db} and changed about ${perDay} per day across the samples kept here. Checkout history is ${input.historyDays} day${input.historyDays === 1 ? "" : "s"} and stays small. The free space is tens of gigabytes, so the database will not fill this disk soon.`;
}

export async function readStorageStatus(): Promise<StorageStatus> {
  const disk = diskBytes();
  const percent = disk.used + disk.free > 0 ? Math.round((disk.used / (disk.used + disk.free)) * 100) : 0;
  let database: number | null = null;
  let historyDays = 0;
  let oldestDay: string | null = null;
  let newestDay: string | null = null;
  let checkoutVisitsKept = 0;
  let growthPerDay: number | null = null;
  let sampleDays = 0;
  try {
    database = await databaseBytes();
    const [days, visits, samples] = await Promise.all([
      prisma.trafficDay.findMany({ orderBy: { day: "asc" }, select: { day: true } }),
      prisma.checkoutVisit.count(),
      prisma.storageDay.findMany({ orderBy: { day: "asc" } })
    ]);
    historyDays = days.length;
    oldestDay = days[0] ? days[0].day.toISOString().slice(0, 10) : null;
    newestDay = days.length > 0 ? days[days.length - 1]!.day.toISOString().slice(0, 10) : null;
    checkoutVisitsKept = visits;
    sampleDays = samples.length;
    if (samples.length >= 2) {
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const span = Math.max(1, Math.round((last.day.getTime() - first.day.getTime()) / 86_400_000));
      growthPerDay = Number(last.databaseBytes - first.databaseBytes) / span;
    }
  } catch (err) {
    logger.warn("storage status read failed", { err });
  }
  return {
    diskUsedBytes: disk.used,
    diskTotalBytes: disk.total,
    diskFreeBytes: disk.free,
    diskUsedPercent: percent,
    databaseBytes: database,
    historyDays,
    oldestDay,
    newestDay,
    checkoutVisitsKept,
    databaseGrowthPerDayBytes: growthPerDay,
    note: storageNote({ databaseBytes: database, growthPerDay, sampleDays, historyDays })
  };
}
