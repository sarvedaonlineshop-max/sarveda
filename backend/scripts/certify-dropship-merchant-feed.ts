import { PrismaClient } from "@prisma/client";

import { merchantFeedAvailability } from "../src/modules/inventory/variant-fulfillment-availability";
import { buildSarvedaProductsFeed } from "../src/modules/merchant/sarvedaProductsFeed";

async function main() {
  const prisma = new PrismaClient();
  const result = await buildSarvedaProductsFeed(process.env);
  const byVariant = new Map<string, (typeof result.items)[number]>();
  for (const it of result.items) {
    const vid = (it as { sarvedaVariantId?: string }).sarvedaVariantId;
    if (vid) byVariant.set(vid, it);
  }
  const ids = [...byVariant.keys()];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      sku: true,
      dropShipEnabled: true,
      inventory: { select: { onHand: true, reserved: true } }
    }
  });
  const mismatches: Array<Record<string, unknown>> = [];
  let zeroDropSeen = 0;
  let zeroDropInStock = 0;
  let zeroNonSeen = 0;
  let zeroNonOos = 0;
  for (const v of variants) {
    const it = byVariant.get(v.id)!;
    const expected = merchantFeedAvailability(
      v.inventory?.onHand,
      v.inventory?.reserved,
      v.dropShipEnabled
    );
    const wh = Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0));
    if (wh === 0 && v.dropShipEnabled) {
      zeroDropSeen++;
      if (it.availability === "in_stock") zeroDropInStock++;
    }
    if (wh === 0 && !v.dropShipEnabled) {
      zeroNonSeen++;
      if (it.availability === "out_of_stock") zeroNonOos++;
    }
    if (it.availability !== expected) {
      mismatches.push({
        sku: v.sku,
        feed: it.availability,
        expected,
        wh,
        drop: v.dropShipEnabled
      });
    }
  }
  console.log(
    JSON.stringify(
      {
        feedItems: result.items.length,
        variantLinked: variants.length,
        MERCHANT_AVAILABILITY_MISMATCHES: mismatches.length,
        mismatches: mismatches.slice(0, 15),
        zeroDropSeen,
        zeroDropInStock,
        zeroNonSeen,
        zeroNonOos,
        diagnostics: (result as { diagnostics?: unknown }).diagnostics ?? null
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
  if (mismatches.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
