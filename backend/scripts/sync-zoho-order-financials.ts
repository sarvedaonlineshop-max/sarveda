/**
 * Backfill Zoho invoice/payment state for an existing Sarveda order.
 *
 * Usage:
 *   cd ~/sarveda/backend && ORDER_ID=<uuid> npx tsx scripts/sync-zoho-order-financials.ts
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const orderId = process.env.ORDER_ID?.trim();
  if (!orderId) {
    throw new Error("Set ORDER_ID=<order uuid>");
  }

  const { createZohoInvoiceForOrder } = await import("../src/modules/zoho/zoho-invoices");
  const { recordZohoPaymentForOrder } = await import("../src/modules/zoho/zoho-financials");

  await createZohoInvoiceForOrder(orderId);
  await recordZohoPaymentForOrder(orderId);
  console.log(`Zoho invoice/payment sync complete for ${orderId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
