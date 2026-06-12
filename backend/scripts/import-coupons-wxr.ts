/**
 * Import WooCommerce shop_coupon posts into Coupon table.
 * Usage: npx tsx scripts/import-coupons-wxr.ts [--dry-run] [path.xml]
 */
import dotenv from "dotenv";
import path from "path";

import { CouponType, PrismaClient } from "@prisma/client";

import { loadPublishedItems } from "./wxr-loop";
import { may30 } from "./migration-paths";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath =
  process.argv.find((a) => a.endsWith(".xml")) ?? may30.coupons();

function parseExpires(meta: Record<string, string>): Date | null {
  const raw = meta.date_expires?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

async function main(): Promise<void> {
  const items = loadPublishedItems(xmlPath, "shop_coupon");
  let imported = 0;

  for (const item of items) {
    const code = (item.title || item.slug).trim().toUpperCase();
    if (!code) continue;

    const discountType = item.meta.discount_type?.trim() || "percent";
    const amount = Number(item.meta.coupon_amount ?? "0");
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const type: CouponType = discountType === "fixed_cart" || discountType === "fixed_product" ? "FIXED" : "PERCENTAGE";
    const value = type === "PERCENTAGE" ? Math.round(amount) : Math.round(amount * 100);

    const usageLimit = Number(item.meta.usage_limit ?? "0");
    const usagePerUser = Number(item.meta.usage_limit_per_user ?? "1");
    const usageCount = Number(item.meta.usage_count ?? "0");

    const data = {
      code,
      type,
      value,
      minOrderInPaise: 0,
      maxUsageTotal: usageLimit > 0 ? usageLimit : null,
      // Woo often has 5+ per user; first-order codes must stay 1 per Sarveda account.
      maxUsagePerUser:
        code === "WELCOME10" ? 1 : usagePerUser > 0 ? usagePerUser : 1,
      usageCount: Number.isFinite(usageCount) ? usageCount : 0,
      validFrom: null as Date | null,
      validUntil: parseExpires(item.meta),
      isActive: true
    };

    console.log(`→ coupon ${code} (${type} ${value})`);
    if (dryRun) continue;

    await prisma.coupon.upsert({
      where: { code },
      create: data,
      update: data
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} coupons.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
