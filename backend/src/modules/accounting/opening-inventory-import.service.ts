import { createHash } from "crypto";

import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { AccountingError } from "./accounting-errors";
import {
  classificationBlocksOpening,
  classifyVariantForInventory
} from "./inventory-classification";
import {
  computeLineTotalCost,
  parsePositiveInt,
  parseUnitCostToPaise
} from "./inventory-layer-invariants";
import type {
  OpeningImportPreview,
  OpeningImportRow,
  OpeningImportRowError,
  OpeningImportValidatedRow
} from "./inventory.types";

const HEADER_ALIASES: Record<string, string[]> = {
  sku: ["SKU", "Sku", "sku"],
  variantId: ["VARIANT_ID", "Variant ID", "variant_id", "VARIANT ID"],
  openingQty: ["OPENING_QTY", "Opening Qty", "opening_qty", "QTY", "Quantity", "OPENING QUANTITY"],
  unitCostInPaise: ["UNIT_COST_IN_PAISE", "Unit Cost Paise", "unit_cost_in_paise"],
  unitCost: ["UNIT_COST", "Unit Cost", "unit_cost", "Cost", "COST"],
  totalValue: ["TOTAL_VALUE", "Total Value", "total_value", "TOTAL VALUE"],
  effectiveDate: ["EFFECTIVE_DATE", "Effective Date", "effective_date", "DATE"],
  notes: ["NOTES", "Notes", "notes", "NOTE"]
};

function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function mapHeaders(values: ExcelJS.CellValue[]): Map<string, number> {
  const map = new Map<string, number>();
  values.forEach((cell, idx) => {
    if (idx === 0) return;
    const raw = String(cell ?? "").trim();
    if (!raw) return;
    const norm = normalizeHeader(raw);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        map.set(key, idx);
      }
    }
  });
  return map;
}

function cellVal(row: ExcelJS.Row, headers: Map<string, number>, key: string): unknown {
  const idx = headers.get(key);
  if (idx == null) return undefined;
  const cell = row.getCell(idx);
  if (typeof cell.value === "number") return cell.value;
  if (cell.text != null && String(cell.text).trim() !== "") return cell.text;
  return cell.value;
}

export function hashOpeningPayload(rows: OpeningImportRow[]): string {
  return createHash("sha256")
    .update(JSON.stringify(rows.map((r) => ({ sku: r.sku, q: r.openingQty, c: r.unitCostInPaise }))))
    .digest("hex");
}

export async function parseOpeningInventoryXlsx(buffer: Buffer): Promise<OpeningImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) {
    throw new AccountingError("Workbook has no sheets", "OPENING_IMPORT_MALFORMED");
  }

  const headerRow = sheet.getRow(1);
  const headers = mapHeaders(headerRow.values as ExcelJS.CellValue[]);
  if (!headers.has("sku")) {
    throw new AccountingError("Missing required SKU column", "OPENING_IMPORT_MALFORMED");
  }

  const rows: OpeningImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sku = String(cellVal(row, headers, "sku") ?? "").trim();
    if (!sku) return;

    const openingQty = parsePositiveInt(cellVal(row, headers, "openingQty"));
    const unitCostInPaise = parseUnitCostToPaise(
      cellVal(row, headers, "unitCostInPaise"),
      cellVal(row, headers, "unitCost")
    );
    const totalValueRaw = cellVal(row, headers, "totalValue");
    const totalValueInPaise =
      totalValueRaw != null && String(totalValueRaw).trim() !== ""
        ? parseUnitCostToPaise(totalValueRaw, null) ?? undefined
        : undefined;

    rows.push({
      sku,
      variantId: String(cellVal(row, headers, "variantId") ?? "").trim() || undefined,
      openingQty: openingQty ?? -1,
      unitCostInPaise: unitCostInPaise ?? -1,
      totalValueInPaise,
      effectiveDate: String(cellVal(row, headers, "effectiveDate") ?? "").trim() || undefined,
      notes: String(cellVal(row, headers, "notes") ?? "").trim() || undefined,
      rowNumber
    });
  });

  if (rows.length === 0) {
    throw new AccountingError("No data rows found in workbook", "OPENING_IMPORT_MALFORMED");
  }

  return rows;
}

export async function validateOpeningImportRows(input: {
  rows: OpeningImportRow[];
  effectiveDate: string;
  valuationSource: string;
  sourceDocumentRef?: string;
  preparedBy?: string;
  reviewedBy?: string;
  allowQuantityMismatch?: boolean;
  sourceFileName?: string;
  sourcePayloadHash?: string;
}): Promise<OpeningImportPreview> {
  const errors: OpeningImportRowError[] = [];
  const validated: OpeningImportValidatedRow[] = [];
  const seenSku = new Set<string>();
  let excludedSkuCount = 0;

  const variants = await prisma.productVariant.findMany({
    where: {
      OR: [
        { sku: { in: input.rows.map((r) => r.sku) } },
        ...(input.rows.filter((r) => r.variantId).map((r) => ({ id: r.variantId! })) as Prisma.ProductVariantWhereInput[])
      ]
    },
    include: {
      productRel: { select: { name: true, productType: true, catalogHidden: true } },
      inventory: { select: { onHand: true } }
    }
  });

  const bySku = new Map(variants.map((v) => [v.sku, v]));
  const byId = new Map(variants.map((v) => [v.id, v]));

  for (const row of input.rows) {
    if (seenSku.has(row.sku.toUpperCase())) {
      errors.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        code: "DUPLICATE_SKU",
        message: "Duplicate SKU in import file"
      });
      continue;
    }
    seenSku.add(row.sku.toUpperCase());

    if (row.openingQty < 0) {
      errors.push({ rowNumber: row.rowNumber, sku: row.sku, code: "NEGATIVE_QTY", message: "Negative quantity" });
      continue;
    }
    if (row.unitCostInPaise < 0) {
      errors.push({ rowNumber: row.rowNumber, sku: row.sku, code: "NEGATIVE_COST", message: "Negative cost" });
      continue;
    }
    if (row.openingQty === -1) {
      errors.push({ rowNumber: row.rowNumber, sku: row.sku, code: "MALFORMED_QTY", message: "Invalid opening quantity" });
      continue;
    }
    if (row.unitCostInPaise === -1) {
      errors.push({ rowNumber: row.rowNumber, sku: row.sku, code: "MALFORMED_COST", message: "Invalid unit cost" });
      continue;
    }
    if (row.unitCostInPaise === 0) {
      errors.push({ rowNumber: row.rowNumber, sku: row.sku, code: "ZERO_COST", message: "Zero unit cost not allowed for opening" });
      continue;
    }

    let variant = bySku.get(row.sku);
    if (row.variantId && byId.has(row.variantId)) {
      const byIdVariant = byId.get(row.variantId)!;
      if (variant && variant.id !== byIdVariant.id) {
        errors.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          code: "SKU_VARIANT_MISMATCH",
          message: "SKU and VARIANT_ID resolve to different variants"
        });
        continue;
      }
      variant = byIdVariant;
    }

    if (!variant) {
      errors.push({ rowNumber: row.rowNumber, sku: row.sku, code: "UNKNOWN_SKU", message: "SKU not found" });
      continue;
    }

    const onHand = variant.inventory?.onHand ?? 0;
    const classification = classifyVariantForInventory({
      sku: variant.sku,
      productType: variant.productRel.productType,
      catalogHidden: variant.productRel.catalogHidden,
      onHand
    });

    const blockReason = classificationBlocksOpening(classification);
    if (blockReason) {
      excludedSkuCount += 1;
      validated.push({
        rowNumber: row.rowNumber,
        sku: variant.sku,
        variantId: variant.id,
        productName: variant.productRel.name,
        classification,
        openingQuantity: row.openingQty,
        unitCostInPaise: row.unitCostInPaise,
        totalCostInPaise: computeLineTotalCost(row.openingQty, row.unitCostInPaise),
        operationalOnHand: onHand,
        quantityMismatch: false,
        excluded: true,
        notes: row.notes
      });
      errors.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        code: "CLASSIFICATION_EXCLUDED",
        message: blockReason
      });
      continue;
    }

    const quantityMismatch = row.openingQty !== onHand;
    if (quantityMismatch && !input.allowQuantityMismatch) {
      errors.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        code: "QUANTITY_MISMATCH",
        message: `Opening qty ${row.openingQty} != operational onHand ${onHand}`
      });
    }

    const totalCostInPaise = computeLineTotalCost(row.openingQty, row.unitCostInPaise);
    if (row.totalValueInPaise != null && row.totalValueInPaise !== totalCostInPaise) {
      errors.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        code: "TOTAL_VALUE_MISMATCH",
        message: `TOTAL_VALUE ${row.totalValueInPaise} != qty*unit ${totalCostInPaise}`
      });
    }

    validated.push({
      rowNumber: row.rowNumber,
      sku: variant.sku,
      variantId: variant.id,
      productName: variant.productRel.name,
      classification,
      openingQuantity: row.openingQty,
      unitCostInPaise: row.unitCostInPaise,
      totalCostInPaise,
      operationalOnHand: onHand,
      quantityMismatch,
      excluded: false,
      notes: row.notes
    });
  }

  const eligible = validated.filter((r) => !r.excluded);
  const blockingErrors = errors.filter((e) => e.code !== "CLASSIFICATION_EXCLUDED");
  const totals = {
    quantity: eligible.reduce((s, r) => s + r.openingQuantity, 0),
    valueInPaise: eligible.reduce((s, r) => s + r.totalCostInPaise, 0),
    physicalSkuCount: eligible.length,
    excludedSkuCount
  };

  return {
    effectiveDate: input.effectiveDate,
    valuationSource: input.valuationSource,
    sourceDocumentRef: input.sourceDocumentRef,
    preparedBy: input.preparedBy,
    reviewedBy: input.reviewedBy,
    allowQuantityMismatch: Boolean(input.allowQuantityMismatch),
    sourcePayloadHash: input.sourcePayloadHash ?? hashOpeningPayload(input.rows),
    sourceFileName: input.sourceFileName,
    rows: validated,
    errors,
    totals,
    canSaveDraft: eligible.length > 0 && blockingErrors.length === 0,
    canPost: eligible.length > 0 && blockingErrors.length === 0
  };
}

export async function generateOpeningTemplateXlsx(): Promise<Buffer> {
  const variants = await prisma.productVariant.findMany({
    where: {
      inventory: { is: { onHand: { gt: 0 } } },
      productRel: { productType: { in: ["SIMPLE", "VARIABLE"] }, catalogHidden: false },
      NOT: [{ sku: { startsWith: "COURSE-" } }, { sku: { startsWith: "EVENT-" } }]
    },
    include: {
      productRel: { select: { name: true } },
      inventory: { select: { onHand: true } }
    },
    orderBy: { sku: "asc" }
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Opening Inventory");
  sheet.addRow([
    "SKU",
    "VARIANT_ID",
    "OPENING_QTY",
    "UNIT_COST_IN_PAISE",
    "UNIT_COST",
    "TOTAL_VALUE",
    "EFFECTIVE_DATE",
    "NOTES"
  ]);
  sheet.getRow(1).font = { bold: true };

  for (const v of variants) {
    sheet.addRow([
      v.sku,
      v.id,
      v.inventory?.onHand ?? 0,
      "",
      "",
      "",
      "",
      v.productRel.name
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
