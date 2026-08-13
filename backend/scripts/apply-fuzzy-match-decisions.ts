/**
 * Apply fuzzy-match decisions (from apply-plan.json) directly via Prisma.
 * Updates product name, variant name, SKU only — qty/prices unchanged.
 *
 * Generate plan first:
 *   python3 backend/scripts/apply-fuzzy-match-decisions.py --dry-run
 *
 * Apply (Lightsail DATABASE_URL):
 *   cd backend
 *   DATABASE_URL='postgresql://...' npx tsx scripts/apply-fuzzy-match-decisions.ts --apply
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { saveXlSheetRows } from "../src/modules/products/productXlSheet.service";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const PLAN = path.join(__dirname, "../../data/compare/fuzzy-apply/apply-plan.json");
const BACKUP = path.join(__dirname, "../../data/compare/fuzzy-apply/live-backups");

type PlanItem = {
  decision: string;
  db_sku: string;
  from: { productName: string; variantName: string; sku: string };
  to: { productName: string; variantName: string; sku: string };
  row: {
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    qty: number;
    costInPaise: number | null;
    mrpInPaise: number;
    saleInPaise: number;
    mrpUsdCents: number | null;
    saleUsdCents: number | null;
    mrpAedFils: number | null;
    saleAedFils: number | null;
    mrpGbpPence: number | null;
    saleGbpPence: number | null;
    hsnCode: string;
  };
};

async function main() {
  if (!fs.existsSync(PLAN)) {
    throw new Error(`Missing ${PLAN} — run apply-fuzzy-match-decisions.py --dry-run first`);
  }
  const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")) as PlanItem[];
  if (!plan.length) {
    console.log("Nothing to apply.");
    return;
  }

  const prisma = new PrismaClient();
  fs.mkdirSync(BACKUP, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  fs.writeFileSync(
    path.join(BACKUP, `${stamp}-before.json`),
    JSON.stringify(
      plan.map((p) => ({ sku: p.db_sku, decision: p.decision, from: p.from, to: p.to })),
      null,
      2
    )
  );

  console.log(`Plan rows: ${plan.length}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);
  console.log(`DB: ${(process.env.DATABASE_URL || "").replace(/:[^:@]+@/, ":***@").split("@")[1] || "not set"}`);

  for (const p of plan.slice(0, 15)) {
    console.log(`\n  ${p.db_sku} [${p.decision.slice(0, 50)}]`);
    if (p.from.productName !== p.to.productName) {
      console.log(`    product: ${p.from.productName} -> ${p.to.productName}`);
    }
    if (p.from.variantName !== p.to.variantName) {
      console.log(`    variant: ${p.from.variantName} -> ${p.to.variantName}`);
    }
    if (p.from.sku !== p.to.sku) {
      console.log(`    sku: ${p.from.sku} -> ${p.to.sku}`);
    }
  }
  if (plan.length > 15) console.log(`\n  ... +${plan.length - 15} more`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    await prisma.$disconnect();
    return;
  }

  const payload = plan.map((p) => ({
    productId: p.row.productId,
    variantId: p.row.variantId,
    productName: p.to.productName,
    variantName: p.to.variantName,
    sku: p.to.sku,
    qty: p.row.qty,
    costInPaise: p.row.costInPaise,
    mrpInPaise: p.row.mrpInPaise,
    saleInPaise: p.row.saleInPaise,
    mrpUsdCents: p.row.mrpUsdCents,
    saleUsdCents: p.row.saleUsdCents,
    mrpAedFils: p.row.mrpAedFils,
    saleAedFils: p.row.saleAedFils,
    mrpGbpPence: p.row.mrpGbpPence,
    saleGbpPence: p.row.saleGbpPence,
    hsnCode: p.row.hsnCode || null,
  }));

  const result = await saveXlSheetRows({ rows: payload }, { catalogOnly: true });
  fs.writeFileSync(path.join(BACKUP, `${stamp}-result.json`), JSON.stringify(result, null, 2));

  console.log("\nResult:", result);
  if (result.errors.length) {
    console.error("Errors:", result.errors);
    process.exitCode = 1;
  } else {
    console.log(`\nUpdated products=${result.updatedProducts} variants=${result.updatedVariants}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
