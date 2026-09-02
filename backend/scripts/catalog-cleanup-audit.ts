/**
 * Audit catalogHidden, accounting fixtures, course/event checkout products, and
 * inventory noise (inactive variants on shop inventory).
 *
 *   npx tsx scripts/catalog-cleanup-audit.ts
 *   npx tsx scripts/catalog-cleanup-audit.ts --json > /tmp/catalog-cleanup-audit.json
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import {
  isAccountingTestProductSku,
  isAccountingTestProductSlug
} from "../src/modules/admin/launch-order-rules";
import { shopInventoryWhere } from "../src/utils/shop-catalog";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const JSON_OUT = process.argv.includes("--json");
const REPO = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO, "docs/audit");

type Row = {
  slug: string;
  name: string;
  status: string;
  catalogHidden: boolean;
  productType: string;
  variantCount: number;
  skus: string[];
  reason: string;
};

async function main() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      catalogHidden: true,
      productType: true,
      wooCommerceId: true,
      variants: { select: { sku: true, status: true } }
    },
    orderBy: { slug: "asc" }
  });

  const hidden: Row[] = [];
  const accounting: Row[] = [];
  const courseCheckout: Row[] = [];
  const eventCheckout: Row[] = [];

  for (const p of products) {
    const skus = p.variants.map((v) => v.sku);
    const base = {
      slug: p.slug,
      name: p.name,
      status: p.status,
      catalogHidden: p.catalogHidden,
      productType: p.productType,
      variantCount: p.variants.length,
      skus
    };

    if (p.catalogHidden) {
      hidden.push({ ...base, reason: "catalogHidden=true" });
    }

    if (
      isAccountingTestProductSlug(p.slug) ||
      p.name.toLowerCase().includes("accounting test") ||
      p.variants.some((v) => isAccountingTestProductSku(v.sku))
    ) {
      accounting.push({
        ...base,
        reason: p.slug.startsWith("test-acc") || p.slug.startsWith("acct-prod")
          ? "accounting_test_slug"
          : skus.some((s) => isAccountingTestProductSku(s))
            ? "accounting_test_sku"
            : "accounting_test_name"
      });
    }

    if (p.slug.startsWith("course-checkout-")) {
      courseCheckout.push({
        ...base,
        reason: "Razorpay checkout stub (Course model); hidden from /shop; SKU COURSE-*"
      });
    }

    if (p.slug.startsWith("event-checkout-")) {
      eventCheckout.push({
        ...base,
        reason: "Razorpay checkout stub (Event model); hidden from /shop; SKU EVENT-*"
      });
    }
  }

  const shopInvTotal = await prisma.inventory.count({ where: shopInventoryWhere });
  const inactiveOnShopInv = await prisma.inventory.count({
    where: {
      ...shopInventoryWhere,
      variant: {
        ...(shopInventoryWhere.variant as object),
        status: "INACTIVE"
      }
    }
  });

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      products_total: products.length,
      catalog_hidden_products: hidden.length,
      accounting_test_products: accounting.length,
      course_checkout_products: courseCheckout.length,
      event_checkout_products: eventCheckout.length,
      shop_inventory_rows: shopInvTotal,
      shop_inventory_inactive_variants: inactiveOnShopInv,
      note_course_event:
        "Course/Event rows are NOT storefront catalog — they are hidden Product+Variant stubs so paid enrollments/bookings flow through the same Order/Payment/Razorpay pipeline as physical goods. Excluded from /shop and from admin inventory via COURSE-/EVENT- SKU filter."
    },
    catalog_hidden: hidden,
    accounting_test: accounting,
    course_checkout: courseCheckout,
    event_checkout: eventCheckout
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("=== Catalog cleanup audit ===\n");
  console.log("Summary:", JSON.stringify(report.summary, null, 2));
  console.log(`\n--- catalogHidden (${hidden.length}) ---`);
  for (const r of hidden) console.log(`  ${r.slug}  [${r.status}]  ${r.name}  skus=${r.skus.join(",")}`);
  console.log(`\n--- accounting test (${accounting.length}) ---`);
  for (const r of accounting) console.log(`  ${r.slug}  hidden=${r.catalogHidden}  ${r.name}  skus=${r.skus.join(",")}`);
  console.log(`\n--- course-checkout (${courseCheckout.length}) ---`);
  for (const r of courseCheckout) console.log(`  ${r.slug}  hidden=${r.catalogHidden}  skus=${r.skus.join(",")}`);
  console.log(`\n--- event-checkout (${eventCheckout.length}) ---`);
  for (const r of eventCheckout) console.log(`  ${r.slug}  hidden=${r.catalogHidden}  skus=${r.skus.join(",")}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "catalog_cleanup_audit.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
