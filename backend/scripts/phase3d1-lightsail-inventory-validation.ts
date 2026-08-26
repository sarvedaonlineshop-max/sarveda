/**
 * Phase 3D1 Lightsail inventory foundation validation (read-only + classification).
 *
 *   PHASE3D1_LIGHTSAIL_INVENTORY_OK=1 \
 *   npx tsx scripts/phase3d1-lightsail-inventory-validation.ts
 */
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { buildInventoryClassificationSummary } from "../src/modules/accounting/inventory-reconciliation.service";
import { buildInventoryReconciliationV1 } from "../src/modules/accounting/inventory-reconciliation.service";
import { generateOpeningTemplateXlsx } from "../src/modules/accounting/opening-inventory-import.service";

const prisma = new PrismaClient();

const EXPECTED_LIGHTSAIL_HOST_FRAGMENT = "c9oiska8wm8k.ap-south-1.rds.amazonaws.com";
const EXPECTED_DB = "sarveda_db";

function dbMeta(url: string) {
  try {
    const u = new URL(url.replace(/^postgresql:/i, "http:"));
    return {
      host: u.hostname,
      database: (u.pathname || "/").replace(/^\//, "").split("?")[0]
    };
  } catch {
    return { host: "(parse-error)", database: "?" };
  }
}

async function main() {
  if (process.env.PHASE3D1_LIGHTSAIL_INVENTORY_OK !== "1") {
    throw new Error("Set PHASE3D1_LIGHTSAIL_INVENTORY_OK=1 to run");
  }

  const dbUrl = process.env.DATABASE_URL ?? "";
  const meta = dbMeta(dbUrl);
  const intended =
    meta.database === EXPECTED_DB && meta.host.includes(EXPECTED_LIGHTSAIL_HOST_FRAGMENT);

  console.log("=== PHASE 3D1 LIGHTSAIL INVENTORY VALIDATION ===");
  console.log(
    JSON.stringify(
      {
        environment: {
          databaseHostRedacted: meta.host.includes(EXPECTED_LIGHTSAIL_HOST_FRAGMENT)
            ? `ls-***.${EXPECTED_LIGHTSAIL_HOST_FRAGMENT}`
            : meta.host,
          databaseName: meta.database,
          intendedPrelaunchLightsailDb: intended,
          isProductionLikeEnvironment: isProductionLikeEnvironment()
        }
      },
      null,
      2
    )
  );

  if (!intended) {
    throw new Error("Refusing: not intended pre-launch Lightsail DB");
  }

  const classification = await buildInventoryClassificationSummary();
  console.log("Classification:", classification);

  const recon = await buildInventoryReconciliationV1({ physicalOnly: true, limit: 2000 });
  console.log("Recon status counts:", recon.statusCounts);
  console.log("Financial control:", recon.financialControl);

  const courseExcluded = recon.rows.filter((r) => r.classification === "COURSE_DIGITAL_PLACEHOLDER");
  const openingRequired = recon.rows.filter((r) => r.openingStatus === "OPENING_REQUIRED");
  console.log(`Course placeholders in physical recon sample: ${courseExcluded.length} (expect 0 with physicalOnly)`);
  console.log(`Physical SKUs needing opening: ${openingRequired.length}`);

  const template = await generateOpeningTemplateXlsx();
  console.log(`Opening template generated: ${template.byteLength} bytes`);

  const layers = await prisma.accountingInventoryCostLayer.count();
  const batches = await prisma.accountingInventoryOpeningBatch.count();
  console.log(`Existing cost layers: ${layers}, opening batches: ${batches}`);

  console.log("OPENING_COST_SOURCE_REQUIRED — no trusted cost file supplied; no batch posted.");
  console.log("PHASE 3D1 LIGHTSAIL INVENTORY FOUNDATION VALIDATED");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
