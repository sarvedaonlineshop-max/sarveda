import type { AccountingInventoryCostLayer } from "@prisma/client";

import { AccountingError } from "./accounting-errors";

export function assertLayerQuantityInvariants(layer: Pick<
  AccountingInventoryCostLayer,
  "quantityOriginal" | "quantityRemaining"
>): void {
  if (layer.quantityOriginal < 0) {
    throw new AccountingError("Layer quantityOriginal cannot be negative", "LAYER_INVARIANT_VIOLATION");
  }
  if (layer.quantityRemaining < 0) {
    throw new AccountingError("Layer quantityRemaining cannot be negative", "LAYER_INVARIANT_VIOLATION");
  }
  if (layer.quantityRemaining > layer.quantityOriginal) {
    throw new AccountingError(
      "Layer quantityRemaining cannot exceed quantityOriginal",
      "LAYER_INVARIANT_VIOLATION"
    );
  }
}

export function computeLineTotalCost(quantity: number, unitCostInPaise: number): number {
  return quantity * unitCostInPaise;
}

export function assertOpeningBatchTotalsMatch(
  items: Array<{ openingQuantity: number; totalCostInPaise: number }>,
  batchTotalQuantity: number,
  batchTotalValueInPaise: number
): void {
  const qty = items.reduce((s, i) => s + i.openingQuantity, 0);
  const value = items.reduce((s, i) => s + i.totalCostInPaise, 0);
  if (qty !== batchTotalQuantity) {
    throw new AccountingError(
      `Opening batch quantity mismatch: items=${qty}, batch=${batchTotalQuantity}`,
      "OPENING_BATCH_TOTAL_MISMATCH"
    );
  }
  if (value !== batchTotalValueInPaise) {
    throw new AccountingError(
      `Opening batch value mismatch: items=${value}, batch=${batchTotalValueInPaise}`,
      "OPENING_BATCH_TOTAL_MISMATCH"
    );
  }
}

export function parseUnitCostToPaise(rawPaise: unknown, rawRupees: unknown): number | null {
  if (rawPaise != null && String(rawPaise).trim() !== "") {
    const n = Number(String(rawPaise).replace(/,/g, "").trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
    return n;
  }
  if (rawRupees != null && String(rawRupees).trim() !== "") {
    const n = Number(String(rawRupees).replace(/,/g, "").trim());
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }
  return null;
}

export function parsePositiveInt(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}
