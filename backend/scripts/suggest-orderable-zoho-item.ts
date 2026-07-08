/**
 * Suggest purchasable products whose SKU matches an active Zoho item WITH stock,
 * so you can place a test order and watch the count move in Zoho.
 *
 * Usage (needs DATABASE_URL + Zoho env in backend/.env):
 *   cd ~/sarveda/backend && npx tsx scripts/suggest-orderable-zoho-item.ts
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { shopCatalogProductWhere, shopCatalogVariantSkuWhere } from "../src/utils/shop-catalog";
import { fetchAllActiveZohoItems } from "../src/modules/zoho/zoho-sync-audit";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

async function main() {
  console.log("\n=== Orderable + Zoho-synced items ===\n");

  const zohoItems = await fetchAllActiveZohoItems();
  const zohoBySku = new Map(zohoItems.map((i) => [i.sku, i]));

  const variants = await prisma.productVariant.findMany({
    where: {
      ...shopCatalogVariantSkuWhere,
      status: "ACTIVE",
      productRel: { ...shopCatalogProductWhere, status: "ACTIVE" }
    },
    select: {
      sku: true,
      saleInPaise: true,
      mrpInPaise: true,
      inventory: { select: { onHand: true, reserved: true } },
      productRel: { select: { name: true, slug: true } }
    }
  });

  const candidates = variants
    .map((v) => {
      const z = zohoBySku.get(v.sku);
      if (!z) return null;
      const onHand = v.inventory?.onHand ?? 0;
      const reserved = v.inventory?.reserved ?? 0;
      return {
        name: v.productRel.name,
        slug: v.productRel.slug,
        sku: v.sku,
        priceInr: (v.saleInPaise || v.mrpInPaise) / 100,
        localAvailable: onHand - reserved,
        zohoStock: z.stockOnHand
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    // Buyable now AND Zoho has units to decrement, prefer matching counts (cleanest demo)
    .filter((c) => c.localAvailable > 0 && c.zohoStock > 0)
    .sort((a, b) => {
      const aMatch = a.localAvailable === a.zohoStock ? 0 : 1;
      const bMatch = b.localAvailable === b.zohoStock ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.zohoStock - b.zohoStock;
    });

  if (candidates.length === 0) {
    console.log("No purchasable variant currently matches an in-stock Zoho item.");
    console.log(`(Zoho active items: ${zohoItems.length}, active shop variants: ${variants.length})`);
    console.log("Tip: run 'Sync all from Zoho' in admin, or push an item to Zoho first.\n");
    return;
  }

  const base = (process.env.SITE_URL ?? "https://sarveda-demo.xyz").replace(/\/$/, "");
  console.log(`Found ${candidates.length} orderable + synced variant(s). Top picks:\n`);
  for (const c of candidates.slice(0, 10)) {
    const flag = c.localAvailable === c.zohoStock ? "  ✓ counts match" : "  (counts differ)";
    console.log(`• ${c.name}`);
    console.log(`    SKU: ${c.sku}  |  ₹${c.priceInr}  |  site avail ${c.localAvailable}  |  Zoho ${c.zohoStock}${flag}`);
    console.log(`    ${base}/product/${c.slug}`);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
