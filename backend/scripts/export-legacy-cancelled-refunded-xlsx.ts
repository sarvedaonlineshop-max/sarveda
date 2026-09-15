/**
 * Export cancelled/refunded LegacyOrderArchive (D2C) last N days → Excel.
 *
 * Usage: npx tsx scripts/export-legacy-cancelled-refunded-xlsx.ts [--days=30] [--out=/tmp/file.xlsx]
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = Math.max(1, Number(daysArg?.slice("--days=".length) || 30));
const outArg = process.argv.find((a) => a.startsWith("--out="));
const outPath = path.resolve(
  outArg?.slice("--out=".length) ||
    `/tmp/old-orders-cancelled-refunded-${days}d.xlsx`
);

type DumpOrder = {
  wooCommerceId: number;
  postModified?: string;
};

function fmtIst(d: Date | string | null | undefined): string {
  if (!d) return "";
  const raw = typeof d === "string" ? d : d.toISOString();
  // Woo dump times are usually IST wall-clock without TZ: "2026-08-20 14:31:02"
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(d)) {
    return d + " IST";
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return String(d);
  return (
    dt.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " IST"
  );
}

function loadModifiedMap(): Map<number, string> {
  const map = new Map<number, string>();
  const candidates = [
    "/tmp/do_woo_orders_legacy_gap.json",
    "/tmp/do_woo_orders_full.json",
    "/tmp/do_woo_orders.json",
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      const orders: DumpOrder[] = Array.isArray(raw) ? raw : raw.orders || [];
      for (const o of orders) {
        if (o?.wooCommerceId && o.postModified) {
          map.set(o.wooCommerceId, o.postModified);
        }
      }
      console.log(`dump ${p}: ${orders.length} orders → map size ${map.size}`);
    } catch (e) {
      console.warn(`skip dump ${p}`, e);
    }
  }
  return map;
}

async function main() {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const modifiedById = loadModifiedMap();

  const rows = await prisma.legacyOrderArchive.findMany({
    where: {
      source: "D2C",
      status: { in: ["CANCELLED", "REFUNDED"] },
      orderDate: { gte: start, lt: end },
    },
    orderBy: { orderDate: "desc" },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sarveda";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Cancelled & Refunded", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Order ID", key: "orderId", width: 12 },
    { header: "Order Number", key: "orderNumber", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Order Date", key: "orderDate", width: 24 },
    { header: "Cancelled / Refunded At", key: "cancelledAt", width: 28 },
    { header: "Products Opted", key: "products", width: 72 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Order Total", key: "total", width: 14 },
    { header: "Customer Name", key: "customer", width: 24 },
    { header: "Customer Email", key: "email", width: 32 },
  ];
  sheet.getRow(1).font = { bold: true };

  let totalInr = 0;
  let totalUsd = 0;
  let cancelled = 0;
  let refunded = 0;
  let withTs = 0;

  for (const r of rows) {
    const items = Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : [];
    const products =
      items
        .map((i) => {
          const name = String(i.name || "Item");
          const sku = i.sku ? ` [${i.sku}]` : "";
          const qty = (i.qty as number) ?? 1;
          return `${name}${sku} x${qty}`;
        })
        .join(" | ") ||
      (r.linePreview || []).join(" | ");

    const wooId =
      r.wooCommerceId ??
      (r.externalOrderId && /^\d+$/.test(r.externalOrderId)
        ? Number(r.externalOrderId)
        : null);
    const rawMod = wooId != null ? modifiedById.get(wooId) : undefined;
    let cancelledAt = "";
    if (rawMod) {
      cancelledAt = fmtIst(rawMod);
      withTs += 1;
    } else {
      cancelledAt = "Not archived (status only)";
    }

    const totalMajor = (r.grandTotalInPaise || 0) / 100;
    if ((r.currency || "INR").toUpperCase() === "USD") totalUsd += totalMajor;
    else totalInr += totalMajor;
    if (r.status === "CANCELLED") cancelled += 1;
    else refunded += 1;

    sheet.addRow({
      orderId: wooId ?? r.externalOrderId ?? "",
      orderNumber: r.orderNumber || "",
      status: r.status,
      orderDate: fmtIst(r.orderDate),
      cancelledAt,
      products,
      currency: r.currency,
      total: totalMajor,
      customer: r.customerName || "",
      email: r.customerEmail || "",
    });
  }

  sheet.getColumn("total").numFmt = "#,##0.00";

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "m", width: 42 },
    { header: "Value", key: "v", width: 36 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRow({
    m: "Window (by order date)",
    v: `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
  });
  summary.addRow({ m: "Source", v: "LegacyOrderArchive · D2C (old Woo)" });
  summary.addRow({ m: "Cancelled orders", v: cancelled });
  summary.addRow({ m: "Refunded orders", v: refunded });
  summary.addRow({ m: "Total cancelled + refunded orders", v: rows.length });
  summary.addRow({ m: "TOTAL CANCELLED AMOUNT (INR)", v: Math.round(totalInr * 100) / 100 });
  summary.addRow({ m: "TOTAL CANCELLED AMOUNT (USD)", v: Math.round(totalUsd * 100) / 100 });
  summary.addRow({
    m: "Cancel timestamps available",
    v: `${withTs} / ${rows.length} (from Woo post_modified dumps)`,
  });
  summary.getRow(6).font = { bold: true };
  summary.getCell("B6").numFmt = "₹#,##0.00";
  summary.getCell("B7").numFmt = "$#,##0.00";

  await workbook.xlsx.writeFile(outPath);
  console.log(
    JSON.stringify(
      {
        outPath,
        rows: rows.length,
        cancelled,
        refunded,
        totalInr: Math.round(totalInr * 100) / 100,
        totalUsd: Math.round(totalUsd * 100) / 100,
        withCancelTs: withTs,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
