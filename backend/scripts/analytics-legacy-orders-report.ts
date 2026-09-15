/**
 * Build analytics JSON from LegacyOrderArchive (D2C / old orders) for canvas.
 *
 * Usage:
 *   npx tsx scripts/analytics-legacy-orders-report.ts [--days=30] [--out=/tmp/legacy-orders-analytics.json]
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = Math.max(1, Number(daysArg?.slice("--days=".length) || 30));
const outArg = process.argv.find((a) => a.startsWith("--out="));
const outPath = path.resolve(
  outArg?.slice("--out=".length) || `/tmp/legacy-orders-analytics-${days}d.json`
);

const PAID_STATUSES = new Set([
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED", // safety
  "FULFILLED"
]);

type Attr = {
  sourceType?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

function isPaidAds(attr: Attr | null | undefined, sessionEntry?: string): boolean {
  const st = String(attr?.sourceType ?? "").toLowerCase();
  const us = String(attr?.utmSource ?? "").toLowerCase();
  const um = String(attr?.utmMedium ?? "")
    .toLowerCase()
    .replace(/\s/g, "");
  const uc = String(attr?.utmCampaign ?? "").toLowerCase();
  const se = String(sessionEntry ?? "").toLowerCase();

  if (um.includes("cpc") || um === "ppc" || um === "paid" || um === "paidsocial" || um === "display") {
    return true;
  }
  if (st === "utm" && (us === "google" || us === "ig" || us === "fb" || us === "facebook" || us === "instagram" || us === "an")) {
    return true;
  }
  if (uc.includes("google_cpc") || se.includes("gad_source") || se.includes("gclid=") || se.includes("fbclid=")) {
    return true;
  }
  return false;
}

function channelLabel(attr: Attr | null | undefined, paid: boolean): string {
  const st = String(attr?.sourceType ?? "").toLowerCase();
  const us = String(attr?.utmSource ?? "").toLowerCase();
  if (paid) {
    if (us === "google" || us.includes("google")) return "Paid · Google";
    if (["ig", "fb", "facebook", "instagram", "an", "msg"].includes(us)) return "Paid · Meta";
    return "Paid · Other";
  }
  if (st === "organic") return "Organic search";
  if (st === "typein" || st === "direct") return "Direct";
  if (st === "referral") return "Referral";
  if (st === "utm") return `UTM · ${attr?.utmSource || "other"}`;
  if (!st) return "Unknown";
  return st;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function labelDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

async function main() {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.legacyOrderArchive.findMany({
    where: {
      source: "D2C",
      orderDate: { gte: start, lte: end },
      status: { in: [...PAID_STATUSES] }
    },
    select: {
      orderNumber: true,
      orderDate: true,
      status: true,
      currency: true,
      grandTotalInPaise: true,
      rawSnapshot: true
    },
    orderBy: { orderDate: "asc" }
  });

  const byDay = new Map<string, { orders: number; revenueMinor: number }>();
  // Fill empty days
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    byDay.set(ymd(new Date(t)), { orders: 0, revenueMinor: 0 });
  }

  let paidAds = 0;
  let nonPaid = 0;
  let paidRev = 0;
  let nonPaidRev = 0;
  const channels = new Map<string, { orders: number; revenueMinor: number }>();
  let inrOrders = 0;
  let usdOrders = 0;
  let inrMinor = 0;
  let usdMinor = 0;
  let withAttr = 0;

  for (const r of rows) {
    const day = ymd(r.orderDate);
    const bucket = byDay.get(day) ?? { orders: 0, revenueMinor: 0 };
    bucket.orders += 1;
    bucket.revenueMinor += r.grandTotalInPaise;
    byDay.set(day, bucket);

    const snap = (r.rawSnapshot ?? {}) as Record<string, unknown>;
    const attr = (snap.attribution as Attr | undefined) ?? null;
    const sessionEntry =
      typeof snap === "object" && snap && "meta" in snap
        ? undefined
        : undefined;
    // session entry may live under rawSnapshot from gap import only in attribution fields
    if (attr?.sourceType || attr?.utmSource || attr?.utmMedium) withAttr += 1;

    const paid = isPaidAds(attr);
    const ch = channelLabel(attr, paid);
    const c = channels.get(ch) ?? { orders: 0, revenueMinor: 0 };
    c.orders += 1;
    c.revenueMinor += r.grandTotalInPaise;
    channels.set(ch, c);

    if (paid) {
      paidAds += 1;
      paidRev += r.grandTotalInPaise;
    } else {
      nonPaid += 1;
      nonPaidRev += r.grandTotalInPaise;
    }

    if (r.currency === "USD") {
      usdOrders += 1;
      usdMinor += r.grandTotalInPaise;
    } else {
      inrOrders += 1;
      inrMinor += r.grandTotalInPaise;
    }
  }

  const daysSeries = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      label: labelDay(date),
      orders: v.orders,
      revenue: v.revenueMinor / 100
    }));

  const totalOrders = rows.length;
  const totalRev = rows.reduce((s, r) => s + r.grandTotalInPaise, 0) / 100;
  const peak = daysSeries.reduce((a, b) => (b.revenue > a.revenue ? b : a), daysSeries[0]);

  const channelRows = [...channels.entries()]
    .map(([label, v]) => ({
      label,
      orders: v.orders,
      revenue: v.revenueMinor / 100
    }))
    .sort((a, b) => b.orders - a.orders);

  const report = {
    generatedAt: new Date().toISOString(),
    source: "LegacyOrderArchive D2C",
    windowDays: days,
    start: start.toISOString(),
    end: end.toISOString(),
    totals: {
      orders: totalOrders,
      revenueApproxInrUnits: totalRev,
      inrOrders,
      usdOrders,
      inrRevenue: inrMinor / 100,
      usdRevenue: usdMinor / 100,
      withAttribution: withAttr,
      withoutAttribution: totalOrders - withAttr
    },
    paidVsOrganic: {
      paidAds: { orders: paidAds, revenue: paidRev / 100 },
      nonPaid: { orders: nonPaid, revenue: nonPaidRev / 100 }
    },
    channels: channelRows,
    days: daysSeries,
    peakDay: peak
      ? { date: peak.date, label: peak.label, orders: peak.orders, revenue: peak.revenue }
      : null
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, totals: report.totals, paidVsOrganic: report.paidVsOrganic }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
