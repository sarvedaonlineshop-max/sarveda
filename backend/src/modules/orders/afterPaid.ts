import { prisma } from "../../config/db";
import { clearCartForOrder } from "../cart/cart.service";
import { incrementCouponUsageForOrder } from "../coupons/coupon.service";
import { ensureOrderInvoicePdf } from "../invoices/invoice.service";
import { notifyOrderEmail } from "../notifications/email";
import { onOrderEnteredProcessing } from "../shipping/orderLifecycle";
import { logger } from "../../config/logger";
import { isDigitalSku } from "../../utils/digitalCart";
import { createZohoInvoiceForOrder } from "../zoho";
import { fulfillDigitalPurchases } from "./fulfillDigitalPurchases";

function autoFulfillmentEnabled(): boolean {
  const v = (process.env.AUTO_START_FULFILLMENT_ON_PAID ?? "0").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Post-payment: invoice PDF, confirmation email, clear cart. */
export async function afterOrderPaid(orderId: string): Promise<void> {
  const claimed = await prisma.order.updateMany({
    where: {
      id: orderId,
      afterPaidRanAt: null
    },
    data: { afterPaidRanAt: new Date() }
  });

  if (claimed.count === 0) {
    logger.info("after_paid_already_ran", { orderId });
    return;
  }

  void ensureOrderInvoicePdf(orderId).catch((err) => {
    logger.error("after_order_paid_invoice_failed", { orderId, err });
  });
  notifyOrderEmail(orderId, "order_confirmed");
  await incrementCouponUsageForOrder(orderId);
  await clearCartForOrder(orderId);
  await fulfillDigitalPurchases(orderId);

  try {
    await createZohoInvoiceForOrder(orderId);
  } catch (err) {
    console.error("[ZOHO_INVOICE_FAILED]", { orderId, err });
    logger.error("Zoho invoice failed after order paid", { orderId, err });
  }

  if (autoFulfillmentEnabled()) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        status: true,
        items: { select: { skuSnapshot: true } }
      }
    });
    const digitalOnly =
      (order?.items.length ?? 0) > 0 && order!.items.every((i) => isDigitalSku(i.skuSnapshot));
    if (order?.status === "PAID" && !digitalOnly) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "PROCESSING" }
      });
      void onOrderEnteredProcessing(orderId);
    }
  }
}
