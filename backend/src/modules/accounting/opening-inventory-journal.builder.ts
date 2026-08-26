import type { AccountingInventoryOpeningBatch, AccountingInventoryOpeningBatchItem } from "@prisma/client";

import { INVENTORY_ACCOUNT_CODE } from "./inventory.constants";
import type { OpeningJournalProposal } from "./inventory.types";

export function buildOpeningInventoryJournal(
  batch: Pick<
    AccountingInventoryOpeningBatch,
    "id" | "batchNumber" | "effectiveDate" | "totalQuantity" | "totalValueInPaise" | "valuationSource"
  >,
  items: Array<
    Pick<
      AccountingInventoryOpeningBatchItem,
      "sku" | "openingQuantity" | "unitCostInPaise" | "totalCostInPaise"
    >
  >
): OpeningJournalProposal {
  const totalValueInPaise = items.reduce((s, i) => s + i.totalCostInPaise, 0);
  const totalQuantity = items.reduce((s, i) => s + i.openingQuantity, 0);

  if (totalValueInPaise !== batch.totalValueInPaise) {
    throw Object.assign(
      new Error(`Batch value ${batch.totalValueInPaise} != items ${totalValueInPaise}`),
      { code: "OPENING_JOURNAL_IMBALANCE" }
    );
  }

  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    effectiveDate: batch.effectiveDate,
    memo: `Opening inventory batch ${batch.batchNumber} (${batch.valuationSource})`,
    totalQuantity,
    totalValueInPaise,
    lines: [
      {
        accountCode: INVENTORY_ACCOUNT_CODE.INVENTORY_ASSET,
        debitInPaise: totalValueInPaise,
        creditInPaise: 0,
        lineMemo: `Opening inventory — ${items.length} SKUs, ${totalQuantity} units`
      },
      {
        accountCode: INVENTORY_ACCOUNT_CODE.OPENING_BALANCE_EQUITY,
        debitInPaise: 0,
        creditInPaise: totalValueInPaise,
        lineMemo: `Opening balance equity — batch ${batch.batchNumber}`
      }
    ],
    variantBreakdown: items.map((i) => ({
      sku: i.sku,
      quantity: i.openingQuantity,
      unitCostInPaise: i.unitCostInPaise,
      totalCostInPaise: i.totalCostInPaise
    }))
  };
}
