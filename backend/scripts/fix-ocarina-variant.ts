/**
 * If MI-OC-S (Small) already exists on the Ocarina product, ensure MI-OC-B variant is "Big".
 *
 * Run on Lightsail:
 *   cd backend && npx tsx scripts/fix-ocarina-variant.ts
 */
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { saveXlSheetRows } from "../src/modules/products/productXlSheet.service";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const small = await prisma.productVariant.findFirst({
    where: { sku: { equals: "MI-OC-S", mode: "insensitive" }, status: "ACTIVE" },
    include: {
      productRel: { select: { id: true, name: true, hsnCode: true, status: true } },
      inventory: { select: { onHand: true } },
      attributeValues: {
        include: { attributeValue: { include: { attribute: true } } },
      },
    },
  });

  if (!small) {
    console.log("MI-OC-S not found — nothing to do.");
    return;
  }

  const smallLabel = small.attributeValues
    .map((a) => a.attributeValue?.value)
    .filter(Boolean)
    .join(" / ");
  if (!/small/i.test(smallLabel)) {
    console.log(`MI-OC-S variant is "${smallLabel}", expected Small — abort.`);
    process.exitCode = 1;
    return;
  }

  const big = await prisma.productVariant.findFirst({
    where: {
      productId: small.productId,
      sku: { equals: "MI-OC-B", mode: "insensitive" },
      status: "ACTIVE",
    },
    include: {
      inventory: { select: { onHand: true } },
      attributeValues: {
        include: { attributeValue: { include: { attribute: true } } },
      },
    },
  });

  if (!big) {
    console.log("MI-OC-B not found on same product — nothing to do.");
    return;
  }

  const bigLabel = big.attributeValues
    .map((a) => a.attributeValue?.value)
    .filter(Boolean)
    .join(" / ");

  if (bigLabel === "Big") {
    console.log("MI-OC-B variant already Big — no change.");
    return;
  }

  const p = small.productRel;
  console.log(`Product: ${p.name}`);
  console.log(`MI-OC-S: ${smallLabel} (ok)`);
  console.log(`MI-OC-B: ${bigLabel} -> Big`);

  const result = await saveXlSheetRows(
    {
      rows: [
        {
          productId: p.id,
          variantId: big.id,
          productName: p.name,
          variantName: "Big",
          sku: big.sku,
          qty: big.inventory?.onHand ?? 0,
          costInPaise: big.costInPaise,
          mrpInPaise: big.mrpInPaise,
          saleInPaise: big.saleInPaise,
          mrpUsdCents: big.mrpUsdCents,
          saleUsdCents: big.saleUsdCents,
          mrpAedFils: big.mrpAedFils,
          saleAedFils: big.saleAedFils,
          mrpGbpPence: big.mrpGbpPence,
          saleGbpPence: big.saleGbpPence,
          hsnCode: p.hsnCode,
        },
      ],
    },
    { catalogOnly: true }
  );

  console.log("Result:", result);
  if (result.errors.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
