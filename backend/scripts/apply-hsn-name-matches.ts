/**
 * Apply HSN codes from hsn-match-ls-zoho-summary.json to Lightsail Product.hsnCode.
 * Run on Lightsail only (refuses localhost DATABASE_URL).
 *
 * Usage:
 *   cd backend && npx tsx scripts/apply-hsn-name-matches.ts           # dry-run
 *   cd backend && npx tsx scripts/apply-hsn-name-matches.ts --apply
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_SUMMARY = path.join(REPO_ROOT, "data/compare/hsn-match-ls-zoho-summary.json");

const prisma = new PrismaClient();

type MatchRow = { lsSlug: string; lsName: string; hsnZoho: string; matchMethod: string };

function assertLightsailDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL missing");
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    throw new Error("Refusing local Docker DB — run this script on Lightsail (ubuntu@13.204.112.165)");
  }
}

function summaryPath(): string {
  const arg = process.argv.find((a) => a.startsWith("--summary="));
  return arg ? arg.slice("--summary=".length) : DEFAULT_SUMMARY;
}

async function main() {
  assertLightsailDb();
  const apply = process.argv.includes("--apply");
  const file = summaryPath();
  if (!fs.existsSync(file)) throw new Error(`Summary not found: ${file}`);

  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    exact: MatchRow[];
    fuzzy: MatchRow[];
  };
  const matches = [...(data.exact ?? []), ...(data.fuzzy ?? [])];
  if (!matches.length) throw new Error("No exact/fuzzy matches in summary JSON");

  console.log(`Source: ${file}`);
  console.log(`Matches to apply: ${matches.length} (${data.exact?.length ?? 0} exact + ${data.fuzzy?.length ?? 0} fuzzy)`);
  console.log(`Mode: ${apply ? "APPLY" : "dry-run"}\n`);

  let updated = 0;
  for (const m of matches) {
    const hsn = m.hsnZoho?.trim();
    if (!hsn) {
      console.warn(`  skip ${m.lsSlug}: empty hsnZoho`);
      continue;
    }

    const product = await prisma.product.findUnique({
      where: { slug: m.lsSlug },
      select: { id: true, name: true, hsnCode: true }
    });
    if (!product) {
      console.warn(`  skip ${m.lsSlug}: product not found`);
      continue;
    }

    const current = product.hsnCode?.trim() || null;
    if (current === hsn) {
      console.log(`  = ${m.lsSlug}: already ${hsn}`);
      continue;
    }

    console.log(`  → ${m.lsSlug} (${m.lsName}): ${current ?? "(empty)"} → ${hsn} [${m.matchMethod}]`);
    if (apply) {
      await prisma.product.update({
        where: { slug: m.lsSlug },
        data: { hsnCode: hsn }
      });
      updated++;
    }
  }

  if (apply) {
    console.log(`\nApplied: ${updated} products updated on Lightsail.`);
  } else {
    console.log("\nDry run only. Re-run with --apply to write Product.hsnCode on Lightsail.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
