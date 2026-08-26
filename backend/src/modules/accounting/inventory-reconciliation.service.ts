import { prisma } from "../../config/db";

import { getAccountingAccountByCode } from "./seed-coa";
import { classifyVariantForInventory } from "./inventory-classification";
import { FIFO_LAYER_ORDER } from "./inventory.constants";
import type { InventoryReconRow, InventoryReconStatus, InventoryReconV2Row, InventoryReconV3Row, InventoryReconV4Row } from "./inventory.types";

function deriveReconStatus(input: {
  classification: ReturnType<typeof classifyVariantForInventory>;
  operationalOnHand: number;
  nativeLayerQuantity: number;
  nativeInventoryValueInPaise: number;
  layerCount: number;
  hasPostedOpening: boolean;
  quantityMismatch: boolean;
  sourceChangedAfterPost: boolean;
}): InventoryReconStatus {
  if (input.operationalOnHand < 0) return "NEGATIVE_STOCK";
  if (input.sourceChangedAfterPost) return "SOURCE_CHANGED_AFTER_POST";

  if (input.classification === "COURSE_DIGITAL_PLACEHOLDER" || input.classification === "NON_INVENTORY") {
    return "NON_INVENTORY_EXCLUDED";
  }
  if (input.classification === "UNKNOWN") return "CLASSIFICATION_REQUIRED";

  if (input.layerCount === 0 && input.operationalOnHand > 0) {
    return "OPENING_REQUIRED";
  }

  if (input.hasPostedOpening && input.nativeLayerQuantity > 0 && input.nativeInventoryValueInPaise === 0) {
    return "VALUE_DATA_GAP";
  }

  if (input.quantityMismatch) return "QUANTITY_MISMATCH";

  if (input.hasPostedOpening && input.nativeLayerQuantity === input.operationalOnHand) {
    return "OPENING_POSTED";
  }

  if (input.nativeLayerQuantity === input.operationalOnHand) {
    return "MATCHED";
  }

  if (input.operationalOnHand > 0 && input.nativeLayerQuantity === 0) {
    return "OPENING_REQUIRED";
  }

  return "ERROR";
}

export async function buildInventoryReconciliationV1(input?: {
  sku?: string;
  limit?: number;
  physicalOnly?: boolean;
}) {
  const limit = Math.min(Math.max(input?.limit ?? 500, 1), 2000);

  const variants = await prisma.productVariant.findMany({
    where: {
      ...(input?.sku ? { sku: { contains: input.sku, mode: "insensitive" } } : {}),
      ...(input?.physicalOnly
        ? {
            productRel: { productType: { in: ["SIMPLE", "VARIABLE"] }, catalogHidden: false },
            NOT: [{ sku: { startsWith: "COURSE-" } }, { sku: { startsWith: "EVENT-" } }]
          }
        : {})
    },
    include: {
      productRel: { select: { name: true, productType: true, catalogHidden: true } },
      inventory: { select: { onHand: true, reserved: true } }
    },
    orderBy: { sku: "asc" },
    take: limit
  });

  const variantIds = variants.map((v) => v.id);
  const layers = await prisma.accountingInventoryCostLayer.findMany({
    where: { variantId: { in: variantIds }, status: "ACTIVE", quantityRemaining: { gt: 0 } },
    orderBy: FIFO_LAYER_ORDER
  });

  const layersByVariant = new Map<string, typeof layers>();
  for (const layer of layers) {
    const list = layersByVariant.get(layer.variantId) ?? [];
    list.push(layer);
    layersByVariant.set(layer.variantId, list);
  }

  const postedBatches = await prisma.accountingInventoryOpeningBatch.findMany({
    where: { status: "POSTED" },
    select: { id: true, sourcePayloadHash: true }
  });
  const postedBatchIds = new Set(postedBatches.map((b) => b.id));

  const rows: InventoryReconRow[] = variants.map((v) => {
    const onHand = v.inventory?.onHand ?? 0;
    const classification = classifyVariantForInventory({
      sku: v.sku,
      productType: v.productRel.productType,
      catalogHidden: v.productRel.catalogHidden,
      onHand
    });

    const variantLayers = layersByVariant.get(v.id) ?? [];
    const nativeLayerQuantity = variantLayers.reduce((s, l) => s + l.quantityRemaining, 0);
    const nativeInventoryValueInPaise = variantLayers.reduce(
      (s, l) => s + l.quantityRemaining * l.unitCostInPaise,
      0
    );
    const openingLayer = variantLayers.find((l) => l.sourceType === "OPENING");
    const hasPostedOpening = Boolean(openingLayer && postedBatchIds.has(openingLayer.sourceId));
    const quantityMismatch = nativeLayerQuantity !== onHand && onHand > 0;
    const uncostedQuantity = Math.max(0, onHand - nativeLayerQuantity);

    const warnings: string[] = [];
    if (classification !== "PHYSICAL_INVENTORY" && onHand > 0) {
      warnings.push(`${classification}: operational onHand ignored for 1200`);
    }
    if (uncostedQuantity > 0 && classification === "PHYSICAL_INVENTORY") {
      warnings.push(`Uncosted quantity: ${uncostedQuantity}`);
    }

    const openingStatus = deriveReconStatus({
      classification,
      operationalOnHand: onHand,
      nativeLayerQuantity,
      nativeInventoryValueInPaise,
      layerCount: variantLayers.length,
      hasPostedOpening,
      quantityMismatch,
      sourceChangedAfterPost: false
    });

    return {
      variantId: v.id,
      sku: v.sku,
      productName: v.productRel.name,
      classification,
      operationalOnHand: onHand,
      nativeLayerQuantity,
      quantityVariance: nativeLayerQuantity - onHand,
      openingUnitCostInPaise: openingLayer?.unitCostInPaise ?? null,
      nativeInventoryValueInPaise,
      layerCount: variantLayers.length,
      uncostedQuantity,
      openingStatus,
      warnings
    };
  });

  let inventoryGlBalanceInPaise = 0;
  const invAccount = await getAccountingAccountByCode("1200");
  if (invAccount) {
    const agg = await prisma.accountingJournalLine.aggregate({
      where: { accountId: invAccount.id, journalEntry: { status: "POSTED" } },
      _sum: { debitInPaise: true, creditInPaise: true }
    });
    inventoryGlBalanceInPaise =
      (agg._sum.debitInPaise ?? 0) - (agg._sum.creditInPaise ?? 0);
  }

  const nativeLayersTotalValueInPaise = layers.reduce(
    (s, l) => s + l.quantityRemaining * l.unitCostInPaise,
    0
  );

  const statusCounts = rows.reduce(
    (acc, r) => {
      acc[r.openingStatus] = (acc[r.openingStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<InventoryReconStatus, number>
  );

  return {
    version: "inventory_recon_v1",
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    statusCounts,
    financialControl: {
      inventoryGl1200InPaise: inventoryGlBalanceInPaise,
      nativeLayersTotalValueInPaise,
      glVsLayersVarianceInPaise: inventoryGlBalanceInPaise - nativeLayersTotalValueInPaise
    },
    rows
  };
}

export async function buildInventoryClassificationSummary() {
  const variants = await prisma.productVariant.findMany({
    include: {
      productRel: { select: { productType: true, catalogHidden: true } },
      inventory: { select: { onHand: true } }
    }
  });

  const counts: Record<string, number> = {};
  for (const v of variants) {
    const c = classifyVariantForInventory({
      sku: v.sku,
      productType: v.productRel.productType,
      catalogHidden: v.productRel.catalogHidden,
      onHand: v.inventory?.onHand ?? 0
    });
    counts[c] = (counts[c] ?? 0) + 1;
  }

  return counts;
}

/** Deterministic FIFO layer ordering for tests / Phase 3D3 foundation. */
export function sortLayersFifo<T extends { effectiveAt: Date; createdAt: Date; id: string }>(
  layers: T[]
): T[] {
  return [...layers].sort((a, b) => {
    const ea = a.effectiveAt.getTime() - b.effectiveAt.getTime();
    if (ea !== 0) return ea;
    const ca = a.createdAt.getTime() - b.createdAt.getTime();
    if (ca !== 0) return ca;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Inventory reconciliation V2 — extends V1 with opening vs purchase-receipt layer split
 * and aggregate 1210 clearing control.
 */
export async function buildInventoryReconciliationV2(input?: {
  sku?: string;
  limit?: number;
  physicalOnly?: boolean;
}) {
  const v1 = await buildInventoryReconciliationV1(input);

  const variantIds = v1.rows.map((r) => r.variantId);
  const layers = await prisma.accountingInventoryCostLayer.findMany({
    where: { variantId: { in: variantIds }, status: "ACTIVE", quantityRemaining: { gt: 0 } }
  });

  const layersByVariant = new Map<string, typeof layers>();
  for (const layer of layers) {
    const list = layersByVariant.get(layer.variantId) ?? [];
    list.push(layer);
    layersByVariant.set(layer.variantId, list);
  }

  const clearingAccount = await getAccountingAccountByCode("1210");
  let clearing1210GlInPaise = 0;
  if (clearingAccount) {
    const agg = await prisma.accountingJournalLine.aggregate({
      where: { accountId: clearingAccount.id, journalEntry: { status: "POSTED" } },
      _sum: { debitInPaise: true, creditInPaise: true }
    });
    clearing1210GlInPaise = (agg._sum.debitInPaise ?? 0) - (agg._sum.creditInPaise ?? 0);
  }

  const rows: InventoryReconV2Row[] = v1.rows.map((row) => {
    const variantLayers = layersByVariant.get(row.variantId) ?? [];
    const openingLayerQty = variantLayers
      .filter((l) => l.sourceType === "OPENING")
      .reduce((s, l) => s + l.quantityRemaining, 0);
    const purchaseReceiptLayerQty = variantLayers
      .filter((l) => l.sourceType === "PURCHASE_RECEIPT")
      .reduce((s, l) => s + l.quantityRemaining, 0);

    return {
      ...row,
      openingLayerQty,
      purchaseReceiptLayerQty,
      clearing1210OutstandingInPaise: null
    };
  });

  const purchaseReceiptLayerValue = layers
    .filter((l) => l.sourceType === "PURCHASE_RECEIPT")
    .reduce((s, l) => s + l.quantityRemaining * l.unitCostInPaise, 0);

  return {
    ...v1,
    version: "inventory_recon_v2",
    financialControl: {
      ...v1.financialControl,
      clearing1210GlInPaise,
      purchaseReceiptLayerValueInPaise: purchaseReceiptLayerValue,
      inventory1200VsLayersNote:
        "1200 GL should equal sum of active cost-layer values for posted native inventory events"
    },
    rows
  };
}

export async function buildInventoryReconciliationV3(input?: {
  sku?: string;
  limit?: number;
  physicalOnly?: boolean;
}) {
  const v2 = await buildInventoryReconciliationV2(input);
  const variantIds = v2.rows.map((r) => r.variantId);

  const consumptions = await prisma.accountingInventoryCostConsumption.findMany({
    where: { variantId: { in: variantIds } }
  });
  const consumptionByVariant = new Map<string, typeof consumptions>();
  for (const c of consumptions) {
    const list = consumptionByVariant.get(c.variantId) ?? [];
    list.push(c);
    consumptionByVariant.set(c.variantId, list);
  }

  const paidOrderItems = await prisma.orderItem.findMany({
    where: {
      variantId: { in: variantIds },
      order: { deletedAt: null },
      NOT: { order: { placedAt: null } }
    },
    select: {
      variantId: true,
      qtyOrdered: true,
      order: { select: { placedAt: true } }
    }
  });
  const soldQtyByVariant = new Map<string, number>();
  for (const item of paidOrderItems) {
    if (!item.variantId || !item.order.placedAt) continue;
    soldQtyByVariant.set(item.variantId, (soldQtyByVariant.get(item.variantId) ?? 0) + item.qtyOrdered);
  }

  const rows: InventoryReconV3Row[] = v2.rows.map((row) => {
    const variantConsumptions = consumptionByVariant.get(row.variantId) ?? [];
    const consumedQty = variantConsumptions.reduce((sum, c) => sum + c.quantityConsumed, 0);
    const cogsPostedInPaise = variantConsumptions.reduce((sum, c) => sum + c.totalCostInPaise, 0);
    const soldQty = soldQtyByVariant.get(row.variantId) ?? 0;
    const cogsMissingQty = Math.max(0, soldQty - consumedQty);

    let openingStatus = row.openingStatus;
    const warnings = [...row.warnings];
    if (cogsMissingQty > 0 && row.classification === "PHYSICAL_INVENTORY") {
      warnings.push(`COGS missing qty: ${cogsMissingQty}`);
      openingStatus =
        row.nativeLayerQuantity < cogsMissingQty ? "INSUFFICIENT_COST_LAYERS" : "COGS_UNPOSTED";
    }

    return {
      ...row,
      openingStatus,
      warnings,
      consumedQty,
      cogsPostedInPaise,
      cogsMissingQty
    };
  });

  const cogsAccount = await getAccountingAccountByCode("5000");
  let cogsGl5000InPaise = 0;
  if (cogsAccount) {
    const agg = await prisma.accountingJournalLine.aggregate({
      where: { accountId: cogsAccount.id, journalEntry: { status: "POSTED" } },
      _sum: { debitInPaise: true, creditInPaise: true }
    });
    cogsGl5000InPaise = (agg._sum.debitInPaise ?? 0) - (agg._sum.creditInPaise ?? 0);
  }

  const totalConsumptionValueInPaise = consumptions.reduce((sum, c) => sum + c.totalCostInPaise, 0);

  return {
    ...v2,
    version: "inventory_recon_v3",
    financialControl: {
      ...v2.financialControl,
      cogsGl5000InPaise,
      totalConsumptionValueInPaise,
      cogsGlVsConsumptionVarianceInPaise: cogsGl5000InPaise - totalConsumptionValueInPaise
    },
    rows
  };
}

export async function buildInventoryReconciliationV4(input?: {
  sku?: string;
  limit?: number;
  physicalOnly?: boolean;
}) {
  const v3 = await buildInventoryReconciliationV3(input);
  const variantIds = v3.rows.map((r) => r.variantId);

  const allLayers = await prisma.accountingInventoryCostLayer.findMany({
    where: { variantId: { in: variantIds }, status: "ACTIVE", quantityRemaining: { gt: 0 } }
  });
  const layersByVariant = new Map<string, typeof allLayers>();
  for (const layer of allLayers) {
    const list = layersByVariant.get(layer.variantId) ?? [];
    list.push(layer);
    layersByVariant.set(layer.variantId, list);
  }

  const returnLayersAll = await prisma.accountingInventoryCostLayer.findMany({
    where: { variantId: { in: variantIds }, sourceType: "RETURN_RESTOCK" }
  });
  const returnOriginalByVariant = new Map<string, { qty: number; value: number }>();
  for (const layer of returnLayersAll) {
    const cur = returnOriginalByVariant.get(layer.variantId) ?? { qty: 0, value: 0 };
    cur.qty += layer.quantityOriginal;
    cur.value += layer.quantityOriginal * layer.unitCostInPaise;
    returnOriginalByVariant.set(layer.variantId, cur);
  }

  const restocks = await prisma.orderInventoryRestockEvent.findMany({
    where: { variantId: { in: variantIds } },
    select: {
      id: true,
      variantId: true,
      orderItemId: true,
      quantity: true,
      disposition: true
    }
  });

  const postedReversals = await prisma.accountingPostingEvent.findMany({
    where: {
      eventType: "INVENTORY_COGS_REVERSED",
      status: "POSTED",
      sourceId: { in: restocks.map((r) => r.id) }
    },
    select: { sourceId: true, payloadJson: true }
  });
  const postedRestockIds = new Set(postedReversals.map((p) => p.sourceId));

  const rows: InventoryReconV4Row[] = v3.rows.map((row) => {
    const variantLayers = layersByVariant.get(row.variantId) ?? [];
    const returnRestockLayerQty = variantLayers
      .filter((l) => l.sourceType === "RETURN_RESTOCK")
      .reduce((s, l) => s + l.quantityRemaining, 0);
    const returnMeta = returnOriginalByVariant.get(row.variantId) ?? { qty: 0, value: 0 };
    const originalConsumedQty = row.consumedQty;
    const reversedConsumedQty = returnMeta.qty;
    const netConsumedQty = Math.max(0, originalConsumedQty - reversedConsumedQty);
    const netCogsInPaise = Math.max(0, row.cogsPostedInPaise - returnMeta.value);
    const returnRestockValueInPaise = variantLayers
      .filter((l) => l.sourceType === "RETURN_RESTOCK")
      .reduce((s, l) => s + l.quantityRemaining * l.unitCostInPaise, 0);

    let openingStatus = row.openingStatus;
    const warnings = [...row.warnings];

    const variantRestocks = restocks.filter((r) => r.variantId === row.variantId);
    for (const r of variantRestocks) {
      if (r.disposition === "DAMAGED") {
        warnings.push(`DAMAGED restock ${r.id.slice(0, 8)} — no inventory value restore`);
        if (openingStatus === "MATCHED" || openingStatus === "OPENING_POSTED") {
          openingStatus = "DAMAGED_NO_RESTOCK_VALUE";
        }
      } else if (r.disposition === "NON_RESTOCKABLE") {
        warnings.push(`NON_RESTOCKABLE restock ${r.id.slice(0, 8)}`);
        if (openingStatus === "MATCHED" || openingStatus === "OPENING_POSTED") {
          openingStatus = "NON_RESTOCKABLE";
        }
      } else if (r.disposition === "SELLABLE" && !postedRestockIds.has(r.id)) {
        if (originalConsumedQty <= 0) {
          warnings.push(`SELLABLE restock without source COGS: ${r.id.slice(0, 8)}`);
          openingStatus = "RESTOCK_WITHOUT_SOURCE_COGS";
        } else {
          warnings.push(`SELLABLE restock COGS unposted: ${r.id.slice(0, 8)}`);
          openingStatus = "RETURN_COGS_UNPOSTED";
        }
      }
    }

    if (reversedConsumedQty > originalConsumedQty) {
      warnings.push("Reversed qty exceeds original consumed qty");
      openingStatus = "RETURN_QTY_EXCEEDS_REVERSIBLE_COGS";
    }

    return {
      ...row,
      openingStatus,
      warnings,
      returnRestockLayerQty,
      originalConsumedQty,
      reversedConsumedQty,
      netConsumedQty,
      returnRestockValueInPaise,
      netCogsInPaise
    };
  });

  const cogsAccount = await getAccountingAccountByCode("5000");
  let cogsGl5000InPaise = 0;
  if (cogsAccount) {
    const agg = await prisma.accountingJournalLine.aggregate({
      where: { accountId: cogsAccount.id, journalEntry: { status: "POSTED" } },
      _sum: { debitInPaise: true, creditInPaise: true }
    });
    cogsGl5000InPaise = (agg._sum.debitInPaise ?? 0) - (agg._sum.creditInPaise ?? 0);
  }

  const totalOriginalConsumption = rows.reduce((s, r) => s + r.cogsPostedInPaise, 0);
  const totalReversedValue = [...returnOriginalByVariant.values()].reduce((s, v) => s + v.value, 0);
  const netCogsExpected = totalOriginalConsumption - totalReversedValue;

  return {
    ...v3,
    version: "inventory_recon_v4",
    financialControl: {
      ...v3.financialControl,
      cogsGl5000InPaise,
      totalConsumptionValueInPaise: totalOriginalConsumption,
      totalReturnReversalValueInPaise: totalReversedValue,
      netCogsExpectedInPaise: netCogsExpected,
      cogsGlVsNetCogsVarianceInPaise: cogsGl5000InPaise - netCogsExpected,
      inventory1200VsLayersNote:
        "1200 GL should equal remaining active layer value including RETURN_RESTOCK layers"
    },
    rows
  };
}
