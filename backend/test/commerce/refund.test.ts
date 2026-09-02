import "./setup-mocks";
import { beforeEach, describe, expect, it } from "vitest";

import { getCommerceMocks } from "./setup-mocks";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { initiateGatewayRefund } from "../../src/modules/payments/refund.service";

describe("commerce refunds", () => {
  beforeEach(() => {
    const commerceMocks = getCommerceMocks();
    commerceMocks.createZohoRefundDocumentsForOrder.mockClear();
    commerceMocks.razorpayRefund.mockClear();
  });

  it("full refund restores stock without Zoho credit-note integration", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 18 });
    const { order, rzpOrderId, qty } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    const rzpPaymentId = `pay_ref_${Date.now()}`;

    await completePaidOrder(rzpOrderId, rzpPaymentId);

    const result = await initiateGatewayRefund(order.id, "Test full refund");
    expect(result.success).toBe(true);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("REFUNDED");

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(18);

    const commerceMocks = getCommerceMocks();
    expect(commerceMocks.createZohoRefundDocumentsForOrder).not.toHaveBeenCalled();

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
