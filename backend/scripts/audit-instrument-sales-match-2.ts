/**
 * Second-pass audit: unnamed lines, ASINs, woo-var SKUs, den-den SKUs, pair qty.
 *   cd backend && npx tsx scripts/audit-instrument-sales-match-2.ts
 */
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const unnamed = await prisma.$queryRaw<
    { n: bigint; qty: number; sample_desc: string | null; sample_channel: string; status: string }[]
  >(Prisma.sql`
    SELECT COUNT(*)::bigint AS n,
           COALESCE(SUM(l.quantity),0)::float AS qty,
           MIN(LEFT(COALESCE(l."itemDesc",''), 120)) AS sample_desc,
           MIN(i."channelNormalized") AS sample_channel,
           i.status
    FROM "ZohoHistoricalInvoiceLine" l
    JOIN "ZohoHistoricalInvoice" i ON i.id = l."invoiceId"
    WHERE COALESCE(TRIM(l."itemName"), '') = ''
      AND COALESCE(TRIM(l.sku), '') = ''
    GROUP BY i.status
  `);
  console.log("\n=== EMPTY name+sku lines ===");
  console.log(unnamed);

  const unnamedDesc = await prisma.$queryRaw<{ desc: string; n: bigint; qty: number }[]>(Prisma.sql`
    SELECT LEFT(COALESCE(l."itemDesc",'(no desc)'), 160) AS desc,
           COUNT(*)::bigint AS n,
           COALESCE(SUM(l.quantity),0)::float AS qty
    FROM "ZohoHistoricalInvoiceLine" l
    JOIN "ZohoHistoricalInvoice" i ON i.id = l."invoiceId"
    WHERE COALESCE(TRIM(l."itemName"), '') = ''
      AND COALESCE(TRIM(l.sku), '') = ''
      AND i.status NOT IN ('void','draft')
    GROUP BY 1
    ORDER BY qty DESC
    LIMIT 25
  `);
  console.log("\n=== EMPTY name+sku by description ===");
  for (const r of unnamedDesc) {
    console.log(String(r.qty).padStart(6), String(r.n).padStart(5), r.desc.replace(/\s+/g, " ").slice(0, 140));
  }

  const asinRows = await prisma.$queryRaw<
    { name: string; sku: string; desc: string; qty: number; n: bigint; channel: string }[]
  >(Prisma.sql`
    SELECT l."itemName" AS name,
           COALESCE(l.sku,'') AS sku,
           LEFT(COALESCE(l."itemDesc",''), 140) AS desc,
           COALESCE(SUM(l.quantity),0)::float AS qty,
           COUNT(*)::bigint AS n,
           MIN(i."channelNormalized") AS channel
    FROM "ZohoHistoricalInvoiceLine" l
    JOIN "ZohoHistoricalInvoice" i ON i.id = l."invoiceId"
    WHERE i.status NOT IN ('void','draft')
      AND l."itemName" ~ '^B0[A-Z0-9]+$'
    GROUP BY 1,2,3
    ORDER BY qty DESC
    LIMIT 40
  `);
  console.log("\n=== ASIN lines with desc ===");
  for (const r of asinRows) {
    console.log(
      String(Math.round(r.qty)).padStart(4),
      r.channel.padEnd(16),
      r.name,
      "|",
      r.desc.replace(/\s+/g, " ").slice(0, 100)
    );
  }

  const extraSkus = await prisma.$queryRaw<{ name: string; sku: string; qty: number; n: bigint }[]>(Prisma.sql`
    SELECT COALESCE(l."itemName",'') AS name,
           COALESCE(l.sku,'') AS sku,
           COALESCE(SUM(l.quantity),0)::float AS qty,
           COUNT(*)::bigint AS n
    FROM "ZohoHistoricalInvoiceLine" l
    JOIN "ZohoHistoricalInvoice" i ON i.id = l."invoiceId"
    WHERE i.status NOT IN ('void','draft')
      AND (
        UPPER(COALESCE(l.sku,'')) IN ('MI-TD-RB','MI-RS-N','MI-KS-H','MI-KS-S','MI-KS-L','MI-TD-YY','MI-TWD')
        OR UPPER(COALESCE(l."itemName",'')) IN ('MI-TD-RB','MI-RS-N','MI-KS-H','MI-KS-S','MI-KS-L')
        OR COALESCE(l.sku,'') ILIKE 'woo-var-%'
        OR COALESCE(l."itemName",'') ILIKE 'woo-var-%'
      )
    GROUP BY 1,2
    ORDER BY qty DESC
  `);
  console.log("\n=== extra catalog SKUs / woo-var in Zoho ===");
  for (const r of extraSkus) console.log(String(r.qty).padStart(6), r.sku, "|", r.name);

  const den = await prisma.$queryRaw<{ name: string; sku: string; qty: number }[]>(Prisma.sql`
    SELECT COALESCE(l."itemName",'') AS name, COALESCE(l.sku,'') AS sku, COALESCE(SUM(l.quantity),0)::float AS qty
    FROM "ZohoHistoricalInvoiceLine" l
    JOIN "ZohoHistoricalInvoice" i ON i.id = l."invoiceId"
    WHERE i.status NOT IN ('void','draft')
      AND (
        COALESCE(l.sku,'') ILIKE 'MI-TD%'
        OR COALESCE(l.sku,'') ILIKE 'MI-TWD%'
        OR l."itemName" ILIKE '%den den%'
        OR l."itemName" ILIKE '%spin/twist%'
        OR l."itemName" ILIKE '%twist drum%'
      )
    GROUP BY 1,2
    ORDER BY qty DESC
  `);
  console.log("\n=== den-den / MI-TD* in Zoho ===");
  for (const r of den) console.log(String(r.qty).padStart(6), r.sku.padEnd(16), r.name);

  const statuses = await prisma.$queryRaw<{ status: string; n: bigint }[]>(Prisma.sql`
    SELECT status, COUNT(*)::bigint AS n FROM "ZohoHistoricalInvoice" GROUP BY 1 ORDER BY n DESC
  `);
  console.log("\n=== invoice statuses ===");
  console.log(statuses);

  const range = await prisma.$queryRaw<{ min: Date; max: Date; n: bigint }[]>(Prisma.sql`
    SELECT MIN("invoiceDate") AS min, MAX("invoiceDate") AS max, COUNT(*)::bigint AS n
    FROM "ZohoHistoricalInvoice" WHERE status NOT IN ('void','draft')
  `);
  console.log("\n=== date range ===", range);

  const asalatoPairs = await prisma.$queryRaw<{ name: string; sku: string; qty: number }[]>(Prisma.sql`
    SELECT COALESCE(l."itemName",'') AS name, COALESCE(l.sku,'') AS sku, COALESCE(SUM(l.quantity),0)::float AS qty
    FROM "ZohoHistoricalInvoiceLine" l
    JOIN "ZohoHistoricalInvoice" i ON i.id = l."invoiceId"
    WHERE i.status NOT IN ('void','draft')
      AND (
        l."itemName" ILIKE '%asalato%' OR l."itemName" ILIKE '%aslatua%' OR l."itemName" ILIKE '%kashaka%'
        OR l.sku ILIKE 'MI-AS%'
      )
    GROUP BY 1,2
    ORDER BY qty DESC
  `);
  console.log("\n=== asalato raw (pair vs single) ===");
  for (const r of asalatoPairs) console.log(String(r.qty).padStart(6), r.sku.padEnd(12), r.name);

  const fy = await prisma.$queryRaw<{ y: number; qty: number }[]>(Prisma.sql`
    SELECT EXTRACT(YEAR FROM i."invoiceDate")::int AS y, COALESCE(SUM(l.quantity),0)::float AS qty
    FROM "ZohoHistoricalInvoiceLine" l
    JOIN "ZohoHistoricalInvoice" i ON i.id = l."invoiceId"
    WHERE i.status NOT IN ('void','draft')
      AND l."itemName" ILIKE '%pangi%'
    GROUP BY 1 ORDER BY 1
  `);
  console.log("\n=== pangi units by calendar year ===", fy);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
