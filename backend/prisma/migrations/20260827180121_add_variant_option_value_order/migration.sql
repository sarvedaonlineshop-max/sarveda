-- DropIndex
DROP INDEX "AccountingGatewaySettlement_targetBankAccountId_idx";

-- AlterTable
ALTER TABLE "AccountingBankReconciliation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingItcEvidence" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "variantOptionValueOrder" JSONB NOT NULL DEFAULT '{}';

-- RenameIndex
ALTER INDEX "AccountingBankReconciliation_bank_period_key" RENAME TO "AccountingBankReconciliation_bankAccountId_periodStart_peri_key";

-- RenameIndex
ALTER INDEX "AccountingBankStatementLine_bankAccountId_transactionFingerprin" RENAME TO "AccountingBankStatementLine_bankAccountId_transactionFinger_key";

-- RenameIndex
ALTER INDEX "AccountingDocumentLink_documentType_documentId_journalEntryId_k" RENAME TO "AccountingDocumentLink_documentType_documentId_journalEntry_key";

-- RenameIndex
ALTER INDEX "AccountingGatewaySettlementLine_settlementId_providerEntityId_k" RENAME TO "AccountingGatewaySettlementLine_settlementId_providerEntity_key";

-- RenameIndex
ALTER INDEX "AccountingInventoryCostLayer_sourceType_sourceId_sourceLineId_s" RENAME TO "AccountingInventoryCostLayer_sourceType_sourceId_sourceLine_key";

-- RenameIndex
ALTER INDEX "AccountingInventoryCostLayer_variantId_status_effectiveAt_creat" RENAME TO "AccountingInventoryCostLayer_variantId_status_effectiveAt_c_idx";

-- RenameIndex
ALTER INDEX "order_inventory_restock_events_sourceType_sourceId_orderItemId_" RENAME TO "order_inventory_restock_events_sourceType_sourceId_orderIte_key";
