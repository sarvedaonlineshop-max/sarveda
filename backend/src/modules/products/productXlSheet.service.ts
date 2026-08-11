/**
 * Admin Excel-style product sheet (Aug 9 layout + HSN).
 * GET/PUT /api/admin/products/xl-sheet
 */
import { z } from "zod";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { syncVariantAttributes } from "./variant-attributes";

function httpError(status: number, message: string, code: string): Error {
  return Object.assign(new Error(message), { statusCode: status, code });
}

export type XlSheetRow = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  hsnCode: string;
  productStatus: string;
  variantStatus: string;
};

function variantLabel(v: {
  attributeValues: Array<{
    attributeValue: { value: string; attribute: { slug: string; name: string } };
  }>;
}): string {
  const parts = v.attributeValues
    .slice()
    .sort((a, b) => a.attributeValue.attribute.slug.localeCompare(b.attributeValue.attribute.slug))
    .map((a) => a.attributeValue.value);
  return parts.join(" / ");
}

function existingAttrMeta(v: {
  attributeValues: Array<{
    attributeValue: { value: string; attribute: { slug: string; name: string } };
  }>;
}): Array<{ name: string; slug: string; value: string }> {
  return v.attributeValues
    .slice()
    .sort((a, b) => a.attributeValue.attribute.slug.localeCompare(b.attributeValue.attribute.slug))
    .map((a) => ({
      name: a.attributeValue.attribute.name,
      slug: a.attributeValue.attribute.slug,
      value: a.attributeValue.value,
    }));
}

async function applyVariantName(
  variantId: string,
  newLabel: string,
  existing: Array<{ name: string; slug: string; value: string }>
): Promise<void> {
  const label = newLabel.trim();
  if (!label) {
    await syncVariantAttributes(variantId, []);
    return;
  }

  if (existing.length === 1) {
    await syncVariantAttributes(variantId, [
      { name: existing[0].name, slug: existing[0].slug, value: label },
    ]);
    return;
  }

  if (existing.length > 1) {
    const slashParts = label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
    if (slashParts.length === existing.length) {
      await syncVariantAttributes(
        variantId,
        existing.map((a, i) => ({ name: a.name, slug: a.slug, value: slashParts[i] }))
      );
      return;
    }
    // e.g. Gold-Small with Colours + Size
    if (existing.length === 2 && label.includes("-")) {
      const idx = label.lastIndexOf("-");
      const left = label.slice(0, idx).trim();
      const right = label.slice(idx + 1).trim();
      if (left && right) {
        await syncVariantAttributes(variantId, [
          { name: existing[0].name, slug: existing[0].slug, value: left },
          { name: existing[1].name, slug: existing[1].slug, value: right },
        ]);
        return;
      }
    }
  }

  await syncVariantAttributes(variantId, [{ name: "Type", slug: "type", value: label }]);
}

export async function listXlSheetRows(): Promise<{ rows: XlSheetRow[]; total: number }> {
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      catalogHidden: false,
      status: { in: ["ACTIVE", "DRAFT"] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      hsnCode: true,
      variants: {
        where: { status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          sku: true,
          status: true,
          attributeValues: {
            include: {
              attributeValue: { include: { attribute: true } },
            },
          },
        },
      },
    },
  });

  const rows: XlSheetRow[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      rows.push({
        productId: p.id,
        variantId: v.id,
        productName: p.name,
        variantName: variantLabel(v),
        sku: v.sku,
        hsnCode: p.hsnCode?.trim() || "",
        productStatus: p.status,
        variantStatus: v.status,
      });
    }
  }

  return { rows, total: rows.length };
}

export const xlSheetSaveSchema = z.object({
  rows: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid(),
        productName: z.string().min(1).max(300),
        variantName: z.string().max(300),
        sku: z.string().min(1).max(120),
        hsnCode: z.string().max(16).optional().nullable(),
      })
    )
    .min(1)
    .max(5000),
});

export type XlSheetSaveBody = z.infer<typeof xlSheetSaveSchema>;

export async function saveXlSheetRows(body: XlSheetSaveBody): Promise<{
  updatedProducts: number;
  updatedVariants: number;
  errors: Array<{ variantId: string; sku: string; error: string }>;
}> {
  const errors: Array<{ variantId: string; sku: string; error: string }> = [];
  let updatedProducts = 0;
  let updatedVariants = 0;

  // Detect duplicate SKUs in the payload itself
  const skuCounts = new Map<string, number>();
  for (const r of body.rows) {
    const key = r.sku.trim().toUpperCase();
    skuCounts.set(key, (skuCounts.get(key) || 0) + 1);
  }
  for (const r of body.rows) {
    if ((skuCounts.get(r.sku.trim().toUpperCase()) || 0) > 1) {
      errors.push({
        variantId: r.variantId,
        sku: r.sku,
        error: "Duplicate SKU in sheet",
      });
    }
  }
  if (errors.length) {
    throw httpError(400, "Duplicate SKUs in sheet — fix before saving", "VALIDATION_ERROR");
  }

  // Group product-level fields
  const byProduct = new Map<
    string,
    { name: string; hsnCode: string | null; rows: typeof body.rows }
  >();
  for (const r of body.rows) {
    const cur = byProduct.get(r.productId);
    if (!cur) {
      byProduct.set(r.productId, {
        name: r.productName.trim(),
        hsnCode: r.hsnCode?.trim() || null,
        rows: [r],
      });
    } else {
      cur.rows.push(r);
      if (r.productName.trim()) cur.name = r.productName.trim();
      // Keep first non-empty HSN; allow explicit clear only if every row blank
      const h = r.hsnCode?.trim() || null;
      if (h) cur.hsnCode = h;
    }
  }

  for (const [productId, group] of byProduct) {
    const existing = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, name: true, hsnCode: true },
    });
    if (!existing) {
      for (const r of group.rows) {
        errors.push({ variantId: r.variantId, sku: r.sku, error: "Product not found" });
      }
      continue;
    }

    const nextHsn = (() => {
      const values = group.rows.map((r) => (r.hsnCode?.trim() || ""));
      if (values.every((v) => !v)) return null;
      return values.find((v) => v) || null;
    })();
    const nameChanged = group.name !== existing.name;
    const hsnChanged = (existing.hsnCode?.trim() || null) !== nextHsn;
    if (nameChanged || hsnChanged) {
      await prisma.product.update({
        where: { id: productId },
        data: {
          ...(nameChanged ? { name: group.name } : {}),
          ...(hsnChanged ? { hsnCode: nextHsn } : {}),
        },
      });
      updatedProducts++;
    }

    for (const r of group.rows) {
      try {
        const variant = await prisma.productVariant.findFirst({
          where: { id: r.variantId, productId },
          select: {
            id: true,
            sku: true,
            attributeValues: {
              include: {
                attributeValue: { include: { attribute: true } },
              },
            },
          },
        });
        if (!variant) {
          errors.push({ variantId: r.variantId, sku: r.sku, error: "Variant not found" });
          continue;
        }

        const nextSku = r.sku.trim();
        if (!nextSku) {
          errors.push({ variantId: r.variantId, sku: r.sku, error: "SKU required" });
          continue;
        }

        if (nextSku.toUpperCase() !== variant.sku.toUpperCase()) {
          const clash = await prisma.productVariant.findFirst({
            where: {
              sku: { equals: nextSku, mode: "insensitive" },
              NOT: { id: variant.id },
            },
            select: { id: true, sku: true },
          });
          if (clash) {
            errors.push({
              variantId: r.variantId,
              sku: nextSku,
              error: `SKU already used (${clash.sku})`,
            });
            continue;
          }
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: { sku: nextSku },
          });
        }

        const prevLabel = variantLabel(variant);
        const nextLabel = r.variantName.trim();
        if (prevLabel !== nextLabel) {
          await applyVariantName(variant.id, nextLabel, existingAttrMeta(variant));
        }

        updatedVariants++;
      } catch (err) {
        logger.error("xl_sheet_row_failed", {
          variantId: r.variantId,
          sku: r.sku,
          err: err instanceof Error ? err.message : String(err),
        });
        errors.push({
          variantId: r.variantId,
          sku: r.sku,
          error: err instanceof Error ? err.message : "Update failed",
        });
      }
    }
  }

  if (errors.length && updatedVariants === 0 && updatedProducts === 0) {
    throw httpError(400, errors[0]?.error || "Save failed", "VALIDATION_ERROR");
  }

  return { updatedProducts, updatedVariants, errors };
}
