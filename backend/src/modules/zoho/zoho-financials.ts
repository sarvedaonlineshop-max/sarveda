import { logger } from "../../config/logger";

/** Zoho Books financial sync permanently retired. */

export async function recordZohoPaymentForOrder(orderId: string): Promise<void> {
  logger.info("zoho_payment_skipped_retired", { orderId });
}

export async function voidZohoInvoiceForCancelledOrder(
  orderId: string,
  reason: string
): Promise<void> {
  logger.info("zoho_void_skipped_retired", { orderId, reason });
}

export async function createZohoRefundDocumentsForOrder(
  orderId: string,
  reason: string
): Promise<void> {
  logger.info("zoho_refund_docs_skipped_retired", { orderId, reason });
}

export async function createZohoPartialCreditNoteForRefund(refundId: string): Promise<void> {
  logger.info("zoho_partial_cn_skipped_retired", { refundId });
}
