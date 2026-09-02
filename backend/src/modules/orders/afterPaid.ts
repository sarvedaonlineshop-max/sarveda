import { prisma } from "../../config/db";
import { clearCartForOrder } from "../cart/cart.service";
import { incrementCouponUsageForOrder } from "../coupons/coupon.service";
import { ensureOrderInvoicePdf } from "../invoices/invoice.service";
import { notifyOrderEmail } from "../notifications/email";
import { onOrderEnteredProcessing } from "../shipping/orderLifecycle";
import { logger } from "../../config/logger";
import { isDigitalSku } from "../../utils/digitalCart";
import { isAccountingSalesPostingEnabled } from "../accounting/accounting-flag";
import { postOrderPaidByIdentifier } from "../accounting/order-paid-posting.service";
import { fulfillDigitalPurchases } from "./fulfillDigitalPurchases";
import { sendPushToAdmins } from "../../config/firebase";

function autoFulfillmentEnabled(): boolean {
  const v = (process.env.AUTO_START_FULFILLMENT_ON_PAID ?? "0").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

function notifyAdminsNewOrder(orderId: string): void {
  void (async () => {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
          id: true,
          orderNumber: true,
          email: true,
          grandTotalInPaise: true,
          customer: { select: { name: true } }
        }
      });
      if (!order) return;
      const rupees = (order.grandTotalInPaise / 100).toLocaleString("en-IN", {
        maximumFractionDigits: 0
      });
      const who = order.customer?.name?.trim() || order.email;
      await sendPushToAdmins(
        "New order",
        `${order.orderNumber} · ₹${rupees} · ${who}`,
        {
          type: "order",
          orderId: order.id,
          orderNumber: order.orderNumber
        }
      );
    } catch (err) {
      logger.error("admin_push_new_order_failed", { orderId, err });
    }
  })();
}

/** Post-payment: invoice PDF, confirmation email, clear cart, native accounting. */
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

  notifyAdminsNewOrder(orderId);

  void ensureOrderInvoicePdf(orderId).catch((err) => {
    logger.error("after_order_paid_invoice_failed", { orderId, err });
  });
  notifyOrderEmail(orderId, "order_confirmed");
  await incrementCouponUsageForOrder(orderId);
  await clearCartForOrder(orderId);
  await fulfillDigitalPurchases(orderId);

  if (isAccountingSalesPostingEnabled()) {
    try {
      await postOrderPaidByIdentifier({ orderId });
    } catch (err) {
      logger.error("native_order_paid_posting_failed", { orderId, err });
    }
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
      notifyOrderEmail(orderId, "order_processing");
      void onOrderEnteredProcessing(orderId);
    }
  }
}
