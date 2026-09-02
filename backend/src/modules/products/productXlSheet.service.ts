/**
 * Admin Excel-style product sheet (Products XL View).
 * All fields (name, variant, SKU, HSN, qty, prices) → live Product / ProductVariant / Inventory.
 */
import { z } from "zod";
import type { ProductStatus } from "@prisma/client";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { gstRatePercent } from "../../utils/gst";
import { syncVariantAttributes } from "./variant-attributes";

function httpError(status: number, message: string, code: string): Error {
  return Object.assign(new Error(message), { statusCode: status, code });
}

const TAX_CLASS_BY_PERCENT: Record<number, string> = {
  0: "gst-zero-rate",
  5: "gst-5",
  12: "gst12",
  18: "standard",
};

const ALLOWED_TAX_CLASSES = new Set(["standard", "gst18", "gst12", "gst-5", "gst-zero-rate"]);

function normalizeTaxClass(raw: string | null | undefined): string {
  const t = (raw ?? "standard").trim().toLowerCase();
  if (t === "gst18") return "standard";
  if (ALLOWED_TAX_CLASSES.has(t)) return t;
  return "standard";
}

function taxClassFromGstPercent(percent: number): string {
  return TAX_CLASS_BY_PERCENT[percent] ?? "standard";
}

export type XlSheetRow = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  qty: number;
  costInPaise: number | null;
  mrpInPaise: number;
  saleInPaise: number;
  mrpUsdCents: number | null;
  saleUsdCents: number | null;
  mrpAedFils: number | null;
  saleAedFils: number | null;
  mrpGbpPence: number | null;
  saleGbpPence: number | null;
  hsnCode: string;
  /** Canonical product tax class (Woo-style slug). */
  taxClass: string;
  /** Inclusive GST % derived from taxClass (0 / 5 / 12 / 18). */
  gstPercent: number;
  productStatus: string;
  variantStatus: string;
  productSlug?: string;
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

const optionalNonNegInt = z
  .number()
  .int()
  .min(0)
  .max(999_999_999)
  .nullable()
  .optional();

export type XlSheetStatusFilter = "ACTIVE" | "DRAFT" | "ALL";

export async function listXlSheetRows(
  statusFilter: XlSheetStatusFilter = "ACTIVE"
): Promise<{
  rows: XlSheetRow[];
  total: number;
  productCount: number;
}> {
  const statusWhere: ProductStatus | { in: ProductStatus[] } =
    statusFilter === "ALL" ? { in: ["ACTIVE", "DRAFT"] } : statusFilter;

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      catalogHidden: false,
      status: statusWhere,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      hsnCode: true,
      taxClass: true,
      variants: {
        // Admin XL: every variant (ACTIVE + INACTIVE) so drafts / inactive SKUs aren't hidden.
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          sku: true,
          status: true,
          mrpInPaise: true,
          saleInPaise: true,
          costInPaise: true,
          mrpUsdCents: true,
          saleUsdCents: true,
          mrpAedFils: true,
          saleAedFils: true,
          mrpGbpPence: true,
          saleGbpPence: true,
          inventory: { select: { onHand: true } },
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
    const taxClass = normalizeTaxClass(p.taxClass);
    const gstPercent = gstRatePercent(taxClass);
    for (const v of p.variants) {
      rows.push({
        productId: p.id,
        variantId: v.id,
        productName: p.name,
        variantName: variantLabel(v),
        sku: v.sku,
        qty: v.inventory?.onHand ?? 0,
        costInPaise: v.costInPaise ?? null,
        mrpInPaise: v.mrpInPaise,
        saleInPaise: v.saleInPaise,
        mrpUsdCents: v.mrpUsdCents ?? null,
        saleUsdCents: v.saleUsdCents ?? null,
        mrpAedFils: v.mrpAedFils ?? null,
        saleAedFils: v.saleAedFils ?? null,
        mrpGbpPence: v.mrpGbpPence ?? null,
        saleGbpPence: v.saleGbpPence ?? null,
        hsnCode: p.hsnCode?.trim() || "",
        taxClass,
        gstPercent,
        productStatus: p.status,
        variantStatus: v.status,
        productSlug: p.slug,
      });
    }
  }

  return {
    rows,
    total: rows.length,
    productCount: products.length,
  };
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
        qty: z.number().int().min(0).max(10_000_000),
        costInPaise: optionalNonNegInt,
        mrpInPaise: z.number().int().min(0).max(999_999_999),
        saleInPaise: z.number().int().min(0).max(999_999_999),
        mrpUsdCents: optionalNonNegInt,
        saleUsdCents: optionalNonNegInt,
        mrpAedFils: optionalNonNegInt,
        saleAedFils: optionalNonNegInt,
        mrpGbpPence: optionalNonNegInt,
        saleGbpPence: optionalNonNegInt,
        hsnCode: z.string().max(16).optional().nullable(),
        taxClass: z.string().max(40).optional().nullable(),
        gstPercent: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18)]).optional(),
      })
    )
    .min(1)
    .max(5000),
});

export type XlSheetSaveBody = z.infer<typeof xlSheetSaveSchema>;

function normOptionalMoney(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v;
}

export async function saveXlSheetRows(
  body: XlSheetSaveBody,
  opts?: { catalogOnly?: boolean }
): Promise<{
  updatedProducts: number;
  updatedVariants: number;
  errors: Array<{ variantId: string; sku: string; error: string }>;
}> {
  const catalogOnly = opts?.catalogOnly === true;
  const errors: Array<{ variantId: string; sku: string; error: string }> = [];
  let updatedProducts = 0;
  let updatedVariants = 0;
  const touchedInventoryVariantIds: string[] = [];

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

  const byProduct = new Map<
    string,
    { name: string; hsnCode: string | null; taxClass: string | null; rows: typeof body.rows }
  >();
  for (const r of body.rows) {
    const resolvedTax =
      r.taxClass != null && String(r.taxClass).trim()
        ? normalizeTaxClass(r.taxClass)
        : r.gstPercent != null
          ? taxClassFromGstPercent(r.gstPercent)
          : null;
    const cur = byProduct.get(r.productId);
    if (!cur) {
      byProduct.set(r.productId, {
        name: r.productName.trim(),
        hsnCode: r.hsnCode?.trim() || null,
        taxClass: resolvedTax,
        rows: [r],
      });
    } else {
      cur.rows.push(r);
      if (r.productName.trim()) cur.name = r.productName.trim();
      const h = r.hsnCode?.trim() || null;
      if (h) cur.hsnCode = h;
      if (resolvedTax) cur.taxClass = resolvedTax;
    }
  }

  for (const [productId, group] of byProduct) {
    const existing = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, name: true, hsnCode: true, taxClass: true },
    });
    if (!existing) {
      for (const r of group.rows) {
        errors.push({ variantId: r.variantId, sku: r.sku, error: "Product not found" });
      }
      continue;
    }

    const nextHsn = (() => {
      const values = group.rows.map((r) => r.hsnCode?.trim() || "");
      if (values.every((v) => !v)) return null;
      return values.find((v) => v) || null;
    })();
    const nextTax =
      group.taxClass != null
        ? group.taxClass
        : (() => {
            for (const r of group.rows) {
              if (r.taxClass?.trim()) return normalizeTaxClass(r.taxClass);
              if (r.gstPercent != null) return taxClassFromGstPercent(r.gstPercent);
            }
            return null;
          })();
    const nameChanged = group.name !== existing.name;
    const hsnChanged = (existing.hsnCode?.trim() || null) !== nextHsn;
    const taxChanged =
      nextTax != null && normalizeTaxClass(existing.taxClass) !== nextTax;
    if (nameChanged || hsnChanged || taxChanged) {
      await prisma.product.update({
        where: { id: productId },
        data: {
          ...(nameChanged ? { name: group.name } : {}),
          ...(hsnChanged ? { hsnCode: nextHsn } : {}),
          ...(taxChanged && nextTax ? { taxClass: nextTax } : {}),
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
            mrpInPaise: true,
            saleInPaise: true,
            costInPaise: true,
            mrpUsdCents: true,
            saleUsdCents: true,
            mrpAedFils: true,
            saleAedFils: true,
            mrpGbpPence: true,
            saleGbpPence: true,
            inventory: { select: { id: true, onHand: true } },
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

        const prevSku = variant.sku.trim();

        if (nextSku.toUpperCase() !== prevSku.toUpperCase()) {
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
        }

        let variantUpdated = false;

        const nextCost = r.costInPaise === undefined ? variant.costInPaise : normOptionalMoney(r.costInPaise);
        const nextMrpUsd = normOptionalMoney(r.mrpUsdCents);
        const nextSaleUsd = normOptionalMoney(r.saleUsdCents);
        const nextMrpAed = normOptionalMoney(r.mrpAedFils);
        const nextSaleAed = normOptionalMoney(r.saleAedFils);
        const nextMrpGbp = normOptionalMoney(r.mrpGbpPence);
        const nextSaleGbp = normOptionalMoney(r.saleGbpPence);

        const skuChanged = nextSku.toUpperCase() !== prevSku.toUpperCase();
        const pricesChanged =
          !catalogOnly &&
          (variant.mrpInPaise !== r.mrpInPaise ||
            variant.saleInPaise !== r.saleInPaise ||
            (variant.costInPaise ?? null) !== (nextCost ?? null) ||
            (variant.mrpUsdCents ?? null) !== nextMrpUsd ||
            (variant.saleUsdCents ?? null) !== nextSaleUsd ||
            (variant.mrpAedFils ?? null) !== nextMrpAed ||
            (variant.saleAedFils ?? null) !== nextSaleAed ||
            (variant.mrpGbpPence ?? null) !== nextMrpGbp ||
            (variant.saleGbpPence ?? null) !== nextSaleGbp);

        if (skuChanged || pricesChanged) {
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: {
              ...(skuChanged ? { sku: nextSku } : {}),
              ...(pricesChanged
                ? {
                    mrpInPaise: r.mrpInPaise,
                    saleInPaise: r.saleInPaise,
                    costInPaise: nextCost,
                    mrpUsdCents: nextMrpUsd,
                    saleUsdCents: nextSaleUsd,
                    mrpAedFils: nextMrpAed,
                    saleAedFils: nextSaleAed,
                    mrpGbpPence: nextMrpGbp,
                    saleGbpPence: nextSaleGbp,
                  }
                : {}),
            },
          });
          variantUpdated = true;
        }

        const prevLabel = variantLabel(variant);
        const nextLabel = r.variantName.trim();
        if (prevLabel !== nextLabel) {
          await applyVariantName(variant.id, nextLabel, existingAttrMeta(variant));
          variantUpdated = true;
        }

        if (!catalogOnly) {
          if (variant.inventory) {
            if (variant.inventory.onHand !== r.qty) {
              await prisma.inventory.update({
                where: { id: variant.inventory.id },
                data: { onHand: r.qty },
              });
              variantUpdated = true;
              touchedInventoryVariantIds.push(variant.id);
            }
          } else {
            await prisma.inventory.create({
              data: { variantId: variant.id, onHand: r.qty, reserved: 0 },
            });
            variantUpdated = true;
          }
        }

        if (variantUpdated) updatedVariants++;
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

  if (touchedInventoryVariantIds.length > 0) {
    const uniqueVariantIds = Array.from(new Set(touchedInventoryVariantIds));
    const { reconcileInventoryReserved } = await import(
      "../orders/inventory-reserved-reconcile.service"
    );
    await reconcileInventoryReserved({
      dryRun: false,
      variantIds: uniqueVariantIds,
    });
    const { queueNotifyStockSubscribers } = await import(
      "../stock-notifications/stockNotification.service"
    );
    queueNotifyStockSubscribers(uniqueVariantIds);
  }

  if (errors.length && updatedVariants === 0 && updatedProducts === 0) {
    throw httpError(400, errors[0]?.error || "Save failed", "VALIDATION_ERROR");
  }

  return { updatedProducts, updatedVariants, errors };
}
