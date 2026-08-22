/**
 * Apply HSN for auto-matched pending LS products (hsn-pending-auto-matches-apply.json).
 * Run on Lightsail only.
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEFAULT_JSON = path.join(__dirname, "../../data/compare/hsn-pending-auto-matches-apply.json");
const prisma = new PrismaClient();

function assertLightsailDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url || url.includes("localhost") || url.includes("127.0.0.1")) {
    throw new Error("Refusing local Docker DB — run on Lightsail");
  }
}

async function main() {
  assertLightsailDb();
  const apply = process.argv.includes("--apply");
  const file = process.argv.find((a) => a.startsWith("--file="))?.slice(7) ?? DEFAULT_JSON;
  const { matches } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    matches: Array<{ lsSlug: string; lsName: string; hsnZoho: string; method: string; zohoName?: string }>;
  };

  console.log(`Source: ${file}`);
  console.log(`Matches: ${matches.length}`);
  console.log(`Mode: ${apply ? "APPLY" : "dry-run"}\n`);

  let updated = 0;
  for (const m of matches) {
    const hsn = m.hsnZoho?.trim();
    if (!hsn || !m.lsSlug) continue;

    const product = await prisma.product.findUnique({
      where: { slug: m.lsSlug },
      select: { hsnCode: true, name: true }
    });
    if (!product) {
      console.warn(`  skip ${m.lsSlug}: not found`);
      continue;
    }

    const current = product.hsnCode?.trim() || null;
    if (current === hsn) {
      console.log(`  = ${m.lsSlug}: already ${hsn}`);
      continue;
    }

    console.log(`  → ${m.lsSlug} [${m.method}]: ${current ?? "(empty)"} → ${hsn}`);
    if (apply) {
      await prisma.product.update({ where: { slug: m.lsSlug }, data: { hsnCode: hsn } });
      updated++;
    }
  }

  console.log(apply ? `\nApplied: ${updated} products.` : "\nDry run — use --apply to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
