/**
 * Compare Sarveda shop SKUs vs Zoho Books active item SKUs (exact string match).
 *
 * Usage on EC2 (needs DATABASE_URL + Zoho env in backend/.env):
 *   cd ~/sarveda/backend && npx tsx scripts/verify-zoho-sku-alignment.ts
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { shopCatalogProductWhere, shopCatalogVariantSkuWhere } from "../src/utils/shop-catalog";
import { fetchAllActiveZohoItems } from "../src/modules/zoho/zoho-sync-audit";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

function skuPattern(sku: string): string {
  if (sku.startsWith("woo-var-")) return "woo-var-*";
  if (sku.startsWith("woo-")) return "woo-*";
  if (sku.startsWith("COURSE-")) return "COURSE-*";
  if (sku.startsWith("EVENT-")) return "EVENT-*";
  return "explicit/other";
}

async function main() {
  console.log("\n=== Sarveda ↔ Zoho SKU alignment ===\n");

  const zohoItems = await fetchAllActiveZohoItems();
  const zohoBySku = new Map(zohoItems.map((i) => [i.sku, i]));

  const sarvedaVariants = await prisma.productVariant.findMany({
    where: { ...shopCatalogVariantSkuWhere, productRel: shopCatalogProductWhere },
    select: {
      sku: true,
      zohoItemId: true,
      productRel: { select: { name: true, wooCommerceId: true } }
    }
  });

  let matched = 0;
  let sarvedaOnly = 0;
  const sarvedaOnlyByPattern = new Map<string, number>();
  const matchedByPattern = new Map<string, number>();

  for (const v of sarvedaVariants) {
    const pat = skuPattern(v.sku);
    if (zohoBySku.has(v.sku)) {
      matched++;
      matchedByPattern.set(pat, (matchedByPattern.get(pat) ?? 0) + 1);
    } else {
      sarvedaOnly++;
      sarvedaOnlyByPattern.set(pat, (sarvedaOnlyByPattern.get(pat) ?? 0) + 1);
    }
  }

  const sarvedaSkuSet = new Set(sarvedaVariants.map((v) => v.sku));
  const zohoOnly = zohoItems.filter((i) => !sarvedaSkuSet.has(i.sku));

  console.log("Zoho active items (with SKU):     ", zohoItems.length);
  console.log("Sarveda shop variants:              ", sarvedaVariants.length);
  console.log("Exact SKU match (both systems):     ", matched);
  console.log("In Sarveda, SKU not in Zoho:        ", sarvedaOnly, "← dashboard “Not in Zoho”");
  console.log("In Zoho only (no Sarveda variant):  ", zohoOnly.length);

  console.log("\n--- Matched SKUs by Sarveda pattern ---");
  for (const [pat, n] of [...matchedByPattern.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pat}: ${n}`);
  }

  console.log("\n--- Not in Zoho by Sarveda pattern ---");
  for (const [pat, n] of [...sarvedaOnlyByPattern.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pat}: ${n}`);
  }

  console.log("\n--- Sample: Sarveda SKU not in Zoho ---");
  for (const v of sarvedaVariants.filter((x) => !zohoBySku.has(x.sku)).slice(0, 8)) {
    console.log(`  ${v.sku}  |  ${v.productRel.name.slice(0, 50)}`);
  }

  console.log("\n--- Sample: Zoho SKU with no Sarveda variant ---");
  for (const z of zohoOnly.slice(0, 8)) {
    console.log(`  ${z.sku}  |  ${z.name.slice(0, 50)}  |  stock ${z.stockOnHand}`);
  }

  console.log("\n--- Sample: Exact matches ---");
  for (const v of sarvedaVariants.filter((x) => zohoBySku.has(x.sku)).slice(0, 8)) {
    const z = zohoBySku.get(v.sku)!;
    console.log(`  ${v.sku}  |  Zoho stock ${z.stockOnHand}`);
  }

  console.log(`
Interpretation:
• Linking is EXACT SKU string only — no fuzzy match by product name.
• Most Sarveda variants use woo-var-{id} from migration; Zoho may use older/human SKUs.
• “Not in Zoho” does NOT always mean the product is missing in Zoho — often the SKU text differs.
• Fix options: (1) Push to Zoho creates items under Sarveda SKU, (2) rename Zoho item SKUs to match, (3) add a mapping table (future).
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
