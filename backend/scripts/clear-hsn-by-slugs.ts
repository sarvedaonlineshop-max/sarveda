/**
 * Clear Product.hsnCode for slugs listed in JSON. Lightsail only.
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
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
  const file =
    process.argv.find((a) => a.startsWith("--file="))?.slice(7) ??
    path.join(__dirname, "../../data/compare/hsn-revert-slugs.json");

  const { slugs } = JSON.parse(fs.readFileSync(file, "utf8")) as { slugs: string[] };
  console.log(`Clear HSN for ${slugs.length} products (${apply ? "APPLY" : "dry-run"})\n`);

  for (const slug of slugs) {
    const p = await prisma.product.findUnique({ where: { slug }, select: { name: true, hsnCode: true } });
    if (!p) {
      console.warn(`  skip ${slug}: not found`);
      continue;
    }
    console.log(`  → ${slug}: ${p.hsnCode ?? "(empty)"} → (clear)`);
    if (apply) await prisma.product.update({ where: { slug }, data: { hsnCode: null } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
