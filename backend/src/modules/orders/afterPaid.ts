import { prisma } from "../../config/db";
import { clearCartForOrder } from "../cart/cart.service";
import { incrementCouponUsageForOrder } from "../coupons/coupon.service";
import { ensureOrderInvoicePdf } from "../invoices/invoice.service";
import { notifyOrderEmail } from "../notifications/email";
import { onOrderEnteredProcessing } from "../shipping/orderLifecycle";
import { logger } from "../../config/logger";
import { isDigitalSku } from "../../utils/digitalCart";
import { fulfillDigitalPurchases } from "./fulfillDigitalPurchases";

function autoFulfillmentEnabled(): boolean {
  const v = (process.env.AUTO_START_FULFILLMENT_ON_PAID ?? "0").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Post-payment: invoice PDF, confirmation email, clear cart. */
export async function afterOrderPaid(orderId: string): Promise<void> {
  void ensureOrderInvoicePdf(orderId).catch((err) => {
    logger.error("after_order_paid_invoice_failed", { orderId, err });
  });
  notifyOrderEmail(orderId, "order_confirmed");
  await incrementCouponUsageForOrder(orderId);
  await clearCartForOrder(orderId);
  await fulfillDigitalPurchases(orderId);

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
      notifyOrderEmail(orderId, "order_processing");
      void onOrderEnteredProcessing(orderId);
    }
  }
}
