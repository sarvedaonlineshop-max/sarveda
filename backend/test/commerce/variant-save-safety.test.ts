/**
 * VSB — Variant Save Safety regression suite.
 * Proves omission from admin save payload does NOT deactivate variants.
 */
import "./setup-mocks";
import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import { prisma } from "../helpers/commerce";
import { assertDestructiveTestCleanupAllowed } from "../helpers/test-db-guard";
import { saveProductAdmin } from "../../src/modules/products/productAdmin.service";

type MultiVariantBundle = {
  productId: string;
  slug: string;
  name: string;
  variants: Array<{ id: string; sku: string; inventoryId: string }>;
};

async function createMultiVariantProduct(count = 3): Promise<MultiVariantBundle> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const product = await prisma.product.create({
    data: {
      slug: `vsb-product-${suffix}`,
      name: `VSB Product ${suffix}`,
      status: "ACTIVE",
      productType: "VARIABLE",
      taxClass: "standard",
      hsnCode: "9205",
      description: "desc",
      shortDescription: "short",
      seoTitle: "seo",
      seoDescription: "seo-desc",
      seoKeyword: "seo-kw"
    }
  });

  const variants = [];
  for (let i = 0; i < count; i++) {
    const sku = `VSB-${suffix}-${i + 1}`;
    const v = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku,
        mrpInPaise: 10_000 + i,
        saleInPaise: 9_000 + i,
        weightGrams: 500,
        isDefault: i === 0,
        status: "ACTIVE",
        dropShipEnabled: i === 1
      }
    });
    const inv = await prisma.inventory.create({
      data: { variantId: v.id, onHand: 10 + i, reserved: 0 }
    });
    variants.push({ id: v.id, sku, inventoryId: inv.id });
  }

  return { productId: product.id, slug: product.slug, name: product.name, variants };
}

async function cleanupMulti(bundle: MultiVariantBundle) {
  assertDestructiveTestCleanupAllowed();
  for (const v of bundle.variants) {
    await prisma.inventory.deleteMany({ where: { id: v.inventoryId } });
  }
  await prisma.productVariant.deleteMany({ where: { productId: bundle.productId } });
  await prisma.productCategory.deleteMany({ where: { productId: bundle.productId } });
  await prisma.product.deleteMany({ where: { id: bundle.productId } });
}

function baseVariantPayload(
  v: { id: string; sku: string },
  opts?: { isDefault?: boolean; status?: "ACTIVE" | "INACTIVE"; saleInPaise?: number }
) {
  return {
    id: v.id,
    sku: v.sku,
    mrpInPaise: 10_000,
    saleInPaise: opts?.saleInPaise ?? 9_000,
    isDefault: opts?.isDefault ?? false,
    status: opts?.status ?? ("ACTIVE" as const),
    onHand: 10
  };
}

describe("VSB variant save safety", () => {
  it("VSB-001 omitted persisted variant remains ACTIVE", async () => {
    const bundle = await createMultiVariantProduct(3);
    const [a, b, c] = bundle.variants;
    try {
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        variants: [
          baseVariantPayload(a, { isDefault: true }),
          baseVariantPayload(c)
        ]
      });

      const rows = await prisma.productVariant.findMany({
        where: { productId: bundle.productId },
        orderBy: { sku: "asc" }
      });
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.id === b.id)?.status).toBe("ACTIVE");
      expect(rows.find((r) => r.id === a.id)?.status).toBe("ACTIVE");
      expect(rows.find((r) => r.id === c.id)?.status).toBe("ACTIVE");
    } finally {
      await cleanupMulti(bundle);
    }
  });

  it("VSB-002 category-only save preserves all variants", async () => {
    const bundle = await createMultiVariantProduct(3);
    const cat = await prisma.category.create({
      data: { slug: `vsb-cat-${randomUUID().slice(0, 8)}`, name: "VSB Cat" }
    });
    try {
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        categoryIds: [cat.id]
        // no variants key
      });

      const rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows.every((r) => r.status === "ACTIVE")).toBe(true);
      expect(rows).toHaveLength(3);
    } finally {
      await prisma.productCategory.deleteMany({ where: { productId: bundle.productId } });
      await prisma.category.deleteMany({ where: { id: cat.id } });
      await cleanupMulti(bundle);
    }
  });

  it("VSB-003/004 title + description save preserves variants", async () => {
    const bundle = await createMultiVariantProduct(2);
    try {
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: `${bundle.name} Renamed`,
        description: "new description",
        shortDescription: "new short",
        productType: "VARIABLE",
        status: "ACTIVE"
      });
      const rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows.every((r) => r.status === "ACTIVE")).toBe(true);
    } finally {
      await cleanupMulti(bundle);
    }
  });

  it("VSB-005 image save preserves variants", async () => {
    const bundle = await createMultiVariantProduct(2);
    try {
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        images: [
          {
            url: "https://example.com/vsb-test.jpg",
            altText: "t",
            position: 0,
            isPrimary: true
          }
        ]
      });
      const rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows.every((r) => r.status === "ACTIVE")).toBe(true);
    } finally {
      await prisma.productImage.deleteMany({ where: { productId: bundle.productId } });
      await cleanupMulti(bundle);
    }
  });

  it("VSB-006 option-axis edit without deactivate leaves statuses", async () => {
    const bundle = await createMultiVariantProduct(3);
    try {
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        variantAxisOrder: ["color", "size"],
        variantOptionValueOrder: { color: ["Red"], size: ["S"] },
        variants: bundle.variants.map((v, i) =>
          baseVariantPayload(v, { isDefault: i === 0 })
        )
      });
      const rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows.every((r) => r.status === "ACTIVE")).toBe(true);
      expect(rows).toHaveLength(3);
    } finally {
      await cleanupMulti(bundle);
    }
  });

  it("VSB-008/009 explicit deactivate works and is idempotent", async () => {
    const bundle = await createMultiVariantProduct(3);
    const [a, b, c] = bundle.variants;
    try {
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        deactivateVariantIds: [b.id]
      });
      let rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows.find((r) => r.id === a.id)?.status).toBe("ACTIVE");
      expect(rows.find((r) => r.id === b.id)?.status).toBe("INACTIVE");
      expect(rows.find((r) => r.id === c.id)?.status).toBe("ACTIVE");

      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        deactivateVariantIds: [b.id, b.id]
      });
      rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows.find((r) => r.id === b.id)?.status).toBe("INACTIVE");
    } finally {
      await cleanupMulti(bundle);
    }
  });

  it("VSB-010 foreign variant id rejected", async () => {
    const bundle = await createMultiVariantProduct(1);
    const other = await createMultiVariantProduct(1);
    try {
      await expect(
        saveProductAdmin(bundle.productId, {
          slug: bundle.slug,
          name: bundle.name,
          productType: "VARIABLE",
          status: "ACTIVE",
          deactivateVariantIds: [other.variants[0].id]
        })
      ).rejects.toMatchObject({ code: "VARIANT_NOT_ON_PRODUCT" });

      const rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows[0]?.status).toBe("ACTIVE");
    } finally {
      await cleanupMulti(bundle);
      await cleanupMulti(other);
    }
  });

  it("VSB-011 new variant create still works", async () => {
    const bundle = await createMultiVariantProduct(1);
    try {
      const newSku = `VSB-NEW-${randomUUID().slice(0, 8)}`;
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        variants: [
          baseVariantPayload(bundle.variants[0], { isDefault: true }),
          {
            sku: newSku,
            mrpInPaise: 12_000,
            saleInPaise: 11_000,
            isDefault: false,
            status: "ACTIVE",
            onHand: 3
          }
        ]
      });
      const rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "ACTIVE")).toBe(true);
      const created = rows.find((r) => r.sku === newSku);
      expect(created).toBeTruthy();
      if (created) {
        bundle.variants.push({
          id: created.id,
          sku: created.sku,
          inventoryId: (await prisma.inventory.findUnique({ where: { variantId: created.id } }))!.id
        });
      }
    } finally {
      await cleanupMulti(bundle);
    }
  });

  it("VSB-012/013/014/015 update preserves sku/dropship/inventory unless edited", async () => {
    const bundle = await createMultiVariantProduct(2);
    const [a, b] = bundle.variants;
    const beforeB = await prisma.productVariant.findUnique({
      where: { id: b.id },
      include: { inventory: true }
    });
    try {
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        variants: [
          baseVariantPayload(a, { isDefault: true, saleInPaise: 8_500 }),
          // omit B entirely
        ]
      });
      const afterB = await prisma.productVariant.findUnique({
        where: { id: b.id },
        include: { inventory: true }
      });
      expect(afterB?.sku).toBe(beforeB?.sku);
      expect(afterB?.status).toBe("ACTIVE");
      expect(afterB?.dropShipEnabled).toBe(beforeB?.dropShipEnabled);
      expect(afterB?.inventory?.onHand).toBe(beforeB?.inventory?.onHand);
      expect(afterB?.saleInPaise).toBe(beforeB?.saleInPaise);

      const afterA = await prisma.productVariant.findUnique({ where: { id: a.id } });
      expect(afterA?.saleInPaise).toBe(8_500);
      expect(afterA?.sku).toBe(a.sku);
    } finally {
      await cleanupMulti(bundle);
    }
  });

  it("VSB-017 ordinary save with full payload changes zero statuses", async () => {
    const bundle = await createMultiVariantProduct(3);
    try {
      await saveProductAdmin(bundle.productId, {
        slug: bundle.slug,
        name: bundle.name,
        productType: "VARIABLE",
        status: "ACTIVE",
        seoTitle: "updated seo",
        variants: bundle.variants.map((v, i) => baseVariantPayload(v, { isDefault: i === 0 }))
      });
      const rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows.every((r) => r.status === "ACTIVE")).toBe(true);
    } finally {
      await cleanupMulti(bundle);
    }
  });

  it("VSB-018 two ordinary saves do not deactivate (concurrency-style)", async () => {
    const bundle = await createMultiVariantProduct(3);
    try {
      await Promise.all([
        saveProductAdmin(bundle.productId, {
          slug: bundle.slug,
          name: `${bundle.name} A`,
          productType: "VARIABLE",
          status: "ACTIVE",
          categoryIds: []
        }),
        saveProductAdmin(bundle.productId, {
          slug: bundle.slug,
          name: `${bundle.name} B`,
          productType: "VARIABLE",
          status: "ACTIVE",
          seoDescription: "from B"
        })
      ]);
      const rows = await prisma.productVariant.findMany({ where: { productId: bundle.productId } });
      expect(rows.every((r) => r.status === "ACTIVE")).toBe(true);
      expect(rows).toHaveLength(3);
    } finally {
      await cleanupMulti(bundle);
    }
  });
});
