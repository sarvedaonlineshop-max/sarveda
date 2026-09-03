import "./setup-mocks";
import { describe, expect, it } from "vitest";

import {
  evidenceRequiredForReason,
  shippingPolicyForReason
} from "../../src/modules/orders/return-replacement.constants";
import { calculateReturnItemRefund } from "../../src/modules/orders/return-refund-calculator.service";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";

describe("Phase 1B SOP policy corrections", () => {
  it("treats missing_parts as Sarveda-fault shipping refundable", () => {
    expect(shippingPolicyForReason("missing_parts")).toBe("SHIPPING_REFUNDABLE");
    expect(evidenceRequiredForReason("missing_parts")).toBe(true);
  });

  it("requires condition evidence for preference returns", () => {
    expect(evidenceRequiredForReason("changed_mind")).toBe(true);
    expect(evidenceRequiredForReason("replace_variant")).toBe(true);
    expect(evidenceRequiredForReason("quality_issue")).toBe(true);
    // Preference shipping remains retained until reverse-shipping deduction policy exists.
    expect(shippingPolicyForReason("changed_mind")).toBe("SHIPPING_RETAINED");
    expect(shippingPolicyForReason("replace_variant")).toBe("SHIPPING_RETAINED");
  });

  it("does not weaken seller-fault evidence requirements", () => {
    for (const code of ["defective", "wrong_item_sent", "damaged_delivery", "different_description"]) {
      expect(evidenceRequiredForReason(code)).toBe(true);
    }
    expect(shippingPolicyForReason("defective")).toBe("SHIPPING_REFUNDABLE");
    expect(shippingPolicyForReason("wrong_item_sent")).toBe("SHIPPING_REFUNDABLE");
    expect(shippingPolicyForReason("damaged_delivery")).toBe("SHIPPING_REFUNDABLE");
  });

  it("refunds proportional forward shipping for missing_parts", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, saleInPaise: 1000 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, {
      qty: 2,
      unitPriceInPaise: 1000
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { shippingInPaise: 400, grandTotalInPaise: 2400 }
    });
    await prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { amountInPaise: 2400 }
    });
    await completePaidOrder(rzpOrderId, `pay_1b_${Date.now()}`);
    try {
      const item = (await prisma.orderItem.findFirst({ where: { orderId: order.id } }))!;
      const preview = await calculateReturnItemRefund({
        orderId: order.id,
        orderItemId: item.id,
        qty: 1,
        shippingPolicy: shippingPolicyForReason("missing_parts")
      });
      expect(preview.merchandiseRefundPaise).toBe(1000);
      expect(preview.shippingRefundPaise).toBe(200);
      expect(preview.totalRefundPaise).toBe(1200);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });
});
