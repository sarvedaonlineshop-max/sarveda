/**
 * Clone Test Product as "Dummy Product" for checkout/returns tests.
 * Run on Lightsail (live Postgres):
 *   npx tsx scripts/create-dummy-product.ts
 *
 * Diffs vs Test Product:
 * - name / slug / SKUs
 * - India MRP/sale slightly higher (₹12 / ₹7 vs ₹10 / ₹5)
 * - India shipping +₹2 (₹5 vs ₹3)
 * - all 4 variants onHand = 5
 */
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const COMBOS = [
  { color: "Blue", size: "Small", sku: "MI-DP-BL-SM", isDefault: true },
  { color: "Blue", size: "Large", sku: "MI-DP-BL-LG", isDefault: false },
  { color: "Red", size: "Small", sku: "MI-DP-RD-SM", isDefault: false },
  { color: "Red", size: "Large", sku: "MI-DP-RD-LG", isDefault: false }
] as const;

/** Slightly different India prices vs Test Product (₹10 / ₹5). */
const PRICE = {
  mrpInPaise: 1200,
  saleInPaise: 700,
  mrpUsdCents: 200,
  saleUsdCents: 100,
  mrpGbpPence: 200,
  saleGbpPence: 100,
  weightGrams: 100
};

/** India standard +₹2 vs Test Product (₹3 → ₹5 first; both charge ₹3 per extra unit). */
const SHIP = [
  { country: "IN", standardPerProduct: 500, standardAdditional: 300 },
  { country: "US", standardPerProduct: 10, standardAdditional: 0 },
  { country: "GB", standardPerProduct: 10, standardAdditional: 0 },
  { country: "OTHER", standardPerProduct: 10, standardAdditional: 0 }
] as const;

async function upsertShipping(variantId: string) {
  for (const row of SHIP) {
    await prisma.variantShippingRate.upsert({
      where: { variantId_country: { variantId, country: row.country } },
      create: {
        variantId,
        country: row.country,
        standardPerProduct: row.standardPerProduct,
        standardAdditional: row.standardAdditional,
        expeditedPerProduct: row.standardPerProduct,
        expeditedAdditional: row.standardAdditional,
        codPerProduct: row.country === "IN" ? 0 : null,
        codAdditional: row.country === "IN" ? 0 : null,
        estimatedDays: row.country === "IN" ? "3-5" : "7-12"
      },
      update: {
        standardPerProduct: row.standardPerProduct,
        standardAdditional: row.standardAdditional,
        expeditedPerProduct: row.standardPerProduct,
        expeditedAdditional: row.standardAdditional,
        codPerProduct: row.country === "IN" ? 0 : null,
        codAdditional: row.country === "IN" ? 0 : null,
        estimatedDays: row.country === "IN" ? "3-5" : "7-12"
      }
    });
  }
}

async function main() {
  const source = await prisma.product.findFirst({
    where: { slug: "test-product", deletedAt: null },
    include: { categories: true, accordionItems: true }
  });
  if (!source) throw new Error("Test Product (slug test-product) not found — create it first");

  let product = await prisma.product.findFirst({
    where: { slug: "dummy-product", deletedAt: null },
    include: { variants: true }
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        slug: "dummy-product",
        name: "Dummy Product",
        description: source.description ?? "Dummy clone of Test Product for checkout/returns tests.",
        shortDescription:
          "Dummy checkout product — Color (Blue, Red) × Size (Small, Large). India ₹7 + ₹5 shipping.",
        productType: "VARIABLE",
        status: "ACTIVE",
        taxClass: source.taxClass ?? "standard",
        hasAudio: false,
        catalogHidden: false,
        variantAxisOrder: ["color", "size"],
        categories: {
          create: source.categories.map((c) => ({
            categoryId: c.categoryId,
            position: c.position
          }))
        },
        accordionItems: {
          create: (source.accordionItems.length
            ? source.accordionItems
            : [{ title: "Description", content: "", position: 0 }]
          ).map((a) => ({
            title: a.title,
            content: a.content,
            position: a.position
          }))
        }
      },
      include: { variants: true }
    });
  } else {
    product = await prisma.product.update({
      where: { id: product.id },
      data: {
        name: "Dummy Product",
        productType: "VARIABLE",
        status: "ACTIVE",
        catalogHidden: false,
        variantAxisOrder: ["color", "size"],
        shortDescription:
          "Dummy checkout product — Color (Blue, Red) × Size (Small, Large). India ₹7 + ₹5 shipping."
      },
      include: { variants: true }
    });
  }

  const wantedSkus = new Set(COMBOS.map((c) => c.sku));

  for (const combo of COMBOS) {
    let variant = await prisma.productVariant.findUnique({ where: { sku: combo.sku } });

    const data = {
      ...PRICE,
      isDefault: combo.isDefault,
      status: "ACTIVE" as const
    };

    if (variant) {
      if (variant.productId !== product.id) {
        throw new Error(`SKU ${combo.sku} belongs to another product`);
      }
      variant = await prisma.productVariant.update({
        where: { id: variant.id },
        data
      });
    } else {
      variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: combo.sku,
          ...data,
          inventory: { create: { onHand: 5, reserved: 0, lowStockThreshold: 2 } }
        }
      });
    }

    await prisma.inventory.upsert({
      where: { variantId: variant.id },
      create: { variantId: variant.id, onHand: 5, reserved: 0, lowStockThreshold: 2 },
      update: { onHand: 5, reserved: 0 }
    });

    await upsertShipping(variant.id);
    await syncVariantAttributes(variant.id, [
      { name: "Color", slug: "color", value: combo.color },
      { name: "Size", slug: "size", value: combo.size }
    ]);
  }

  const extras = await prisma.productVariant.findMany({
    where: { productId: product.id, sku: { notIn: [...wantedSkus] } }
  });
  for (const extra of extras) {
    await prisma.productVariant.update({
      where: { id: extra.id },
      data: { status: "INACTIVE", isDefault: false }
    });
  }

  const check = await prisma.product.findUnique({
    where: { id: product.id },
    include: {
      variants: {
        where: { status: "ACTIVE" },
        include: {
          inventory: true,
          shippingRates: { orderBy: { country: "asc" } },
          attributeValues: { include: { attributeValue: { include: { attribute: true } } } }
        }
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        id: check?.id,
        slug: check?.slug,
        name: check?.name,
        status: check?.status,
        url: `https://sarveda-demo.xyz/product/${check?.slug}`,
        variants: check?.variants.map((v) => ({
          sku: v.sku,
          isDefault: v.isDefault,
          saleInr: v.saleInPaise / 100,
          mrpInr: v.mrpInPaise / 100,
          onHand: v.inventory?.onHand ?? 0,
          attrs: v.attributeValues.map(
            (a) => `${a.attributeValue.attribute.name}:${a.attributeValue.value}`
          ),
          shipIn: v.shippingRates.find((r) => r.country === "IN")?.standardPerProduct
        }))
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
