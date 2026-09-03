/**
 * Post-restore checks: storefront DB state + description-only / omit-path save safety.
 * Run on Lightsail: npx tsx scripts/cert-17-restore-postchecks.ts
 */
import { PrismaClient } from "@prisma/client";
import { saveProductAdmin } from "../src/modules/products/productAdmin.service";

const prisma = new PrismaClient();

const RESTORED_YOGA = [
  "a7120de4-4ec8-4819-a77b-993ff644ba55",
  "52c95117-e3cf-4e13-a90e-47b95943c4a3",
  "80562e2f-6fc2-421b-baaa-7b97bb1d26b6",
  "858c8391-cd5c-4dbd-b775-bda237337067",
  "307c95a3-7951-4bb9-8057-7bd7def34cb8",
  "26cd9417-ae90-40bf-9b59-434c5567d7b2",
  "d6e6c0b6-04e5-49ef-8ecc-05bedfc89fe4"
];

const ALL17 = [
  "fbcec161-3edc-463a-a7d9-2dd107e4d3ce",
  "160130ae-ad7a-4539-9eba-beb394c75f0a",
  ...RESTORED_YOGA,
  "56bff370-b421-4548-8b88-76609d19e907",
  "1ea051da-a3cb-4e85-a72c-c527a0812b40",
  "bcbefd3f-b221-476a-8f4c-bdcfd7fcc969",
  "dac965f3-44e9-409b-b660-f0cebaf7b6fa",
  "13183064-c9de-493e-b304-d8a35ac343e8",
  "19010b6c-118e-406a-a7f5-2990f69bc9c2",
  "c8e141e7-c922-4c28-8aea-b85fa2ed20e4",
  "3db6be85-a95d-4d11-ae55-7d2e43374b88"
];

async function main() {
  const rows = await prisma.productVariant.findMany({
    where: { id: { in: ALL17 } },
    include: {
      inventory: true,
      productRel: { select: { slug: true, status: true, catalogHidden: true } },
      attributeValues: { include: { attributeValue: { include: { attribute: true } } } }
    }
  });
  console.log("DB_ACTIVE_17", rows.filter((r) => r.status === "ACTIVE").length);
  for (const r of rows) {
    const stock = Math.max(0, (r.inventory?.onHand ?? 0) - (r.inventory?.reserved ?? 0));
    const avail = stock > 0 || r.dropShipEnabled ? "available" : "oos_catalog";
    console.log(
      [
        r.sku,
        r.status,
        r.productRel.slug,
        `sale=${r.saleInPaise}`,
        `drop=${r.dropShipEnabled}`,
        `onHand=${r.inventory?.onHand}`,
        avail,
        (r.attributeValues || [])
          .map((a) => `${a.attributeValue.attribute.name}:${a.attributeValue.value}`)
          .join("|")
      ].join("\t")
    );
  }

  const product = await prisma.product.findUniqueOrThrow({
    where: { slug: "yoga-mats-lotus" },
    include: { categories: true }
  });

  await saveProductAdmin(
    product.id,
    {
      slug: product.slug,
      name: product.name,
      description: product.description ?? undefined,
      shortDescription: product.shortDescription ?? undefined,
      productType: product.productType,
      status: product.status,
      taxClass: product.taxClass,
      categoryIds: product.categories.map((c) => c.categoryId),
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      seoKeyword: product.seoKeyword
    },
    { actorId: "restore-certification" }
  );

  let after = await prisma.productVariant.findMany({
    where: { id: { in: RESTORED_YOGA } },
    select: { id: true, status: true, sku: true }
  });
  console.log(
    JSON.stringify({
      VARIANT_SAVE_REGRESSION_DESC_ONLY: after.every((a) => a.status === "ACTIVE") ? "PASS" : "FAIL",
      yogaRestoredActive: after.filter((a) => a.status === "ACTIVE").length
    })
  );

  const survivor = await prisma.productVariant.findUniqueOrThrow({
    where: { id: RESTORED_YOGA[0]! },
    include: { inventory: true }
  });

  await saveProductAdmin(
    product.id,
    {
      slug: product.slug,
      name: product.name,
      description: product.description ?? undefined,
      productType: product.productType,
      status: product.status,
      categoryIds: product.categories.map((c) => c.categoryId),
      variants: [
        {
          id: survivor.id,
          sku: survivor.sku,
          mrpInPaise: survivor.mrpInPaise,
          saleInPaise: survivor.saleInPaise,
          status: "ACTIVE",
          isDefault: survivor.isDefault,
          dropShipEnabled: survivor.dropShipEnabled,
          onHand: survivor.inventory?.onHand
        }
      ]
    },
    { actorId: "restore-certification-omit-proof" }
  );

  after = await prisma.productVariant.findMany({
    where: { id: { in: RESTORED_YOGA } },
    select: { id: true, status: true, sku: true }
  });
  console.log(
    JSON.stringify({
      OMIT_PATH_SAFE: after.every((a) => a.status === "ACTIVE") ? "PASS" : "FAIL",
      yogaRestoredActive: after.filter((a) => a.status === "ACTIVE").length,
      statuses: after
    })
  );

  const total = await prisma.productVariant.count();
  const active = await prisma.productVariant.count({ where: { status: "ACTIVE" } });
  const inactive = await prisma.productVariant.count({ where: { status: "INACTIVE" } });
  const shopActive = await prisma.productVariant.count({
    where: {
      status: "ACTIVE",
      productRel: { status: "ACTIVE", deletedAt: null, catalogHidden: false }
    }
  });
  console.log(
    JSON.stringify({
      TOTAL_VARIANTS: total,
      ACTIVE_VARIANTS: active,
      INACTIVE_VARIANTS: inactive,
      ACTIVE_ON_VISIBLE_PRODUCTS: shopActive
    })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
