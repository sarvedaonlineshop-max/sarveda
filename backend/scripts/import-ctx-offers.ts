/**
 * Import authoritative CTX India feed into MerchantCtxOffer registry + classify.
 *
 *   npx tsx scripts/import-ctx-offers.ts
 *   npx tsx scripts/import-ctx-offers.ts --apply-identity   # optional wooCommerceVariationId recovery
 */
import path from "path";
import dotenv from "dotenv";

import { prisma } from "../src/config/db";
import {
  DEFAULT_CTX_FEED_PATH,
  importCtxFeedFromFile,
  readMappingTsv
} from "../src/modules/merchant/ctxOfferRegistry";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function applyDeterministicIdentityRecovery(): Promise<number> {
  const mapping = await readMappingTsv();
  let written = 0;

  for (const [, row] of mapping) {
    const conf = (row.match_confidence || "").toLowerCase();
    if (conf !== "high" && conf !== "medium") continue;
    const vid = (row.sarveda_variant_id || "").trim();
    const woo = Number(row.woo_offer_id);
    if (!vid || !Number.isInteger(woo) || woo <= 0) continue;

    const variant = await prisma.productVariant.findUnique({
      where: { id: vid },
      select: { id: true, wooCommerceVariationId: true }
    });
    if (!variant) continue;
    if (variant.wooCommerceVariationId != null && variant.wooCommerceVariationId !== woo) {
      console.warn(
        `skip identity conflict variant=${vid} existing=${variant.wooCommerceVariationId} wanted=${woo}`
      );
      continue;
    }
    if (variant.wooCommerceVariationId === woo) continue;

    const owner = await prisma.productVariant.findFirst({
      where: { wooCommerceVariationId: woo },
      select: { id: true }
    });
    if (owner && owner.id !== vid) {
      console.warn(`skip woo ${woo} already owned by ${owner.id}`);
      continue;
    }

    await prisma.productVariant.update({
      where: { id: vid },
      data: { wooCommerceVariationId: woo }
    });
    written += 1;
  }

  return written;
}

async function main() {
  const applyIdentity = process.argv.includes("--apply-identity");
  const file = process.env.CTX_FEED_PATH || DEFAULT_CTX_FEED_PATH;

  if (applyIdentity) {
    const n = await applyDeterministicIdentityRecovery();
    console.log(`Identity recovery writes: ${n}`);
  }

  const result = await importCtxFeedFromFile(file);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
