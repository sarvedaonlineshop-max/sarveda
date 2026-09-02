import { logger } from "../../config/logger";

/**
 * Zoho Books invoice creation is permanently retired.
 * Native GST invoice PDF + ORDER_PAID journal posting are authoritative.
 */
export async function createZohoInvoiceForOrder(orderId: string): Promise<void> {
  logger.info("zoho_invoice_skipped_retired", { orderId });
}
