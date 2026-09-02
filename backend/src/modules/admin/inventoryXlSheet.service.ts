/**
 * Admin Excel-style inventory sheet (Inventory XL View).
 * Editable: onHand, lowStockThreshold. Read-only: product/variant/sku/reserved.
 */
import { z } from "zod";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { shopInventoryWhere } from "../../utils/shop-catalog";

export type InventoryXlStockFilter = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export type InventoryXlSheetRow = {
  inventoryId: string;
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
  productStatus: string;
};

function stockStatusOf(onHand: number, lowStockThreshold: number): InventoryXlSheetRow["stockStatus"] {
  if (onHand === 0) return "out_of_stock";
  if (onHand > lowStockThreshold) return "in_stock";
  return "low_stock";
}

function matchesFilter(
  status: InventoryXlSheetRow["stockStatus"],
  filter: InventoryXlStockFilter
): boolean {
  if (filter === "ALL") return true;
  if (filter === "IN_STOCK") return status === "in_stock";
  if (filter === "LOW_STOCK") return status === "low_stock";
  return status === "out_of_stock";
}

export async function listInventoryXlSheetRows(
  stockFilter: InventoryXlStockFilter = "ALL"
): Promise<{
  rows: InventoryXlSheetRow[];
  total: number;
  productCount: number;
  counts: { all: number; in_stock: number; low_stock: number; out_of_stock: number };
  reservedExceedsOnHand: {
    count: number;
    samples: Array<{ sku: string; productName: string; onHand: number; reserved: number }>;
  };
}> {
  const rowsDb = await prisma.inventory.findMany({
    where: shopInventoryWhere,
    orderBy: [{ onHand: "asc" }, { variant: { sku: "asc" } }],
    include: {
      variant: {
        include: {
          productRel: { select: { id: true, name: true, status: true } },
          attributeValues: {
            include: {
              attributeValue: { include: { attribute: true } }
            }
          }
        }
      }
    }
  });

  const mapped: InventoryXlSheetRow[] = rowsDb.map((inv) => {
    const labels = inv.variant.attributeValues
      .map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
      .join(" · ");
    const available = Math.max(0, inv.onHand - inv.reserved);
    const stockStatus = stockStatusOf(inv.onHand, inv.lowStockThreshold);
    return {
      inventoryId: inv.id,
      variantId: inv.variantId,
      productId: inv.variant.productRel.id,
      productName: inv.variant.productRel.name,
      variantLabel: labels || "Default",
      sku: inv.variant.sku,
      onHand: inv.onHand,
      reserved: inv.reserved,
      available,
      lowStockThreshold: inv.lowStockThreshold,
      stockStatus,
      productStatus: inv.variant.productRel.status
    };
  });

  const counts = {
    all: mapped.length,
    in_stock: mapped.filter((r) => r.stockStatus === "in_stock").length,
    low_stock: mapped.filter((r) => r.stockStatus === "low_stock").length,
    out_of_stock: mapped.filter((r) => r.stockStatus === "out_of_stock").length
  };

  const reservedExceedsOnHand = mapped
    .filter((r) => r.reserved > r.onHand)
    .map((r) => ({
      sku: r.sku,
      productName: r.productName,
      onHand: r.onHand,
      reserved: r.reserved
    }));

  const rows = mapped.filter((r) => matchesFilter(r.stockStatus, stockFilter));
  const productCount = new Set(rows.map((r) => r.productId)).size;

  return {
    rows,
    total: rows.length,
    productCount,
    counts,
    reservedExceedsOnHand: {
      count: reservedExceedsOnHand.length,
      samples: reservedExceedsOnHand.slice(0, 25)
    }
  };
}

export const inventoryXlSheetSaveSchema = z.object({
  rows: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        onHand: z.number().int().min(0).max(999_999_999),
        lowStockThreshold: z.number().int().min(0).max(999_999)
      })
    )
    .min(1)
    .max(10_000)
});

export type InventoryXlSheetSaveBody = z.infer<typeof inventoryXlSheetSaveSchema>;

export async function saveInventoryXlSheetRows(body: InventoryXlSheetSaveBody): Promise<{
  updated: number;
  errors: Array<{ variantId: string; sku: string; error: string }>;
}> {
  const errors: Array<{ variantId: string; sku: string; error: string }> = [];
  let updated = 0;
  const touchedSkus: string[] = [];
  const touchedVariantIds: string[] = [];

  for (const row of body.rows) {
    try {
      const inv = await prisma.inventory.findUnique({
        where: { variantId: row.variantId },
        include: { variant: { select: { sku: true } } }
      });
      if (!inv) {
        errors.push({ variantId: row.variantId, sku: "", error: "Inventory not found" });
        continue;
      }
      if (row.onHand < inv.reserved) {
        errors.push({
          variantId: row.variantId,
          sku: inv.variant.sku,
          error: `onHand (${row.onHand}) cannot be less than reserved (${inv.reserved})`
        });
        continue;
      }
      const changed =
        inv.onHand !== row.onHand || inv.lowStockThreshold !== row.lowStockThreshold;
      if (!changed) continue;

      await prisma.inventory.update({
        where: { id: inv.id },
        data: {
          onHand: row.onHand,
          lowStockThreshold: row.lowStockThreshold
        }
      });
      updated++;
      if (inv.onHand !== row.onHand) touchedSkus.push(inv.variant.sku);
      touchedVariantIds.push(row.variantId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      logger.error("inventory_xl_sheet_row_failed", { variantId: row.variantId, error: msg });
      errors.push({ variantId: row.variantId, sku: "", error: msg });
    }
  }
  if (touchedVariantIds.length > 0) {
    const uniqueVariantIds = Array.from(new Set(touchedVariantIds));
    const { reconcileInventoryReserved } = await import(
      "../orders/inventory-reserved-reconcile.service"
    );
    await reconcileInventoryReserved({
      dryRun: false,
      variantIds: uniqueVariantIds
    });
    const { queueNotifyStockSubscribers } = await import(
      "../stock-notifications/stockNotification.service"
    );
    queueNotifyStockSubscribers(uniqueVariantIds);
  }

  return { updated, errors };
}
