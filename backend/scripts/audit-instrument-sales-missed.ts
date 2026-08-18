import path from "path";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const missed = await prisma.$queryRaw<
    { kind: string; name: string; sku: string; dtext: string; qty: number }[]
  >(Prisma.sql`
    SELECT
      CASE
        WHEN COALESCE(TRIM(l."itemName"),'') = '' AND COALESCE(TRIM(l.sku),'') = '' THEN 'blank-name'
        WHEN l."itemName" ~ '^B0[A-Z0-9]+$' THEN 'asin'
        ELSE 'other'
      END AS kind,
      COALESCE(l."itemName",'') AS name,
      COALESCE(l.sku,'') AS sku,
      LEFT(COALESCE(l."itemDesc",''), 180) AS dtext,
      SUM(l.quantity)::float AS qty
    FROM "ZohoHistoricalInvoiceLine" l
    JOIN "ZohoHistoricalInvoice" i ON i.id = l."invoiceId"
    WHERE i.status NOT IN ('void','draft')
      AND (
        (COALESCE(TRIM(l."itemName"),'') = '' AND COALESCE(TRIM(l.sku),'') = '')
        OR l."itemName" ~ '^B0[A-Z0-9]+$'
      )
      AND (
        COALESCE(l."itemDesc",'') ILIKE '%pangi%'
        OR COALESCE(l."itemDesc",'') ILIKE '%kenari%'
        OR COALESCE(l."itemDesc",'') ILIKE '%asalato%'
        OR COALESCE(l."itemDesc",'') ILIKE '%aslatua%'
        OR COALESCE(l."itemDesc",'') ILIKE '%kashaka%'
        OR COALESCE(l."itemDesc",'') ILIKE '%rainstick%'
        OR COALESCE(l."itemDesc",'') ILIKE '%rain stick%'
        OR COALESCE(l."itemDesc",'') ILIKE '%shamanic drum%'
        OR COALESCE(l."itemDesc",'') ILIKE '%ocean drum%'
        OR COALESCE(l."itemDesc",'') ILIKE '%egg shaker%'
        OR COALESCE(l."itemDesc",'') ILIKE '%wooden maracas%'
        OR COALESCE(l."itemDesc",'') ILIKE '%wooden shaker%'
        OR COALESCE(l."itemDesc",'') ILIKE '%den den%'
        OR COALESCE(l."itemDesc",'') ILIKE '%spin/twist%'
        OR COALESCE(l."itemDesc",'') ILIKE '%didger%'
        OR COALESCE(l."itemDesc",'') ILIKE '%digeredoo%'
        OR COALESCE(l."itemDesc",'') ILIKE '%tambourine%'
        OR COALESCE(l."itemDesc",'') ILIKE '%caxixi%'
      )
    GROUP BY 1,2,3,4
    ORDER BY kind, qty DESC
  `);

  console.log("=== missed via desc (blank name or ASIN) ===");
  let tot = 0;
  for (const r of missed) {
    tot += r.qty;
    console.log(r.kind.padEnd(12), String(Math.round(r.qty)).padStart(4), r.name || "—", "|", r.dtext.replace(/\s+/g, " ").slice(0, 110));
  }
  console.log("TOTAL", Math.round(tot));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
