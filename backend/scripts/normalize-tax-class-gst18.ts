/**
 * One-off: merge legacy Woo tax class `gst18` → canonical `standard` (both are 18% GST).
 * Run: npx ts-node scripts/normalize-tax-class-gst18.ts
 */
import { prisma } from "../src/config/db";

async function main() {
  const before = await prisma.product.count({ where: { taxClass: "gst18" } });
  const updated = await prisma.product.updateMany({
    where: { taxClass: "gst18" },
    data: { taxClass: "standard" }
  });
  console.log(`Products with gst18 before: ${before}, updated: ${updated.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
