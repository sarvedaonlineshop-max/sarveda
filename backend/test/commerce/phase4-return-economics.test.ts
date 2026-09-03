import { describe, expect, it } from "vitest";

import {
  computeNetSarvedaLossPaise,
  upsertReturnCaseEconomics
} from "../../src/modules/orders/return-economics.service";
import { nextReturnCaseNumber } from "../../src/modules/orders/return-case-number";
import { prisma } from "../../src/config/db";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import "./setup-mocks";

describe("Phase 4 return economics", () => {
  it("computes net loss without double-counting inventory vs refund", () => {
    const net = computeNetSarvedaLossPaise({
      merchandiseRefundPaise: 10000,
      gstReversalPaise: 1800,
      actualForwardCourierCostPaise: 500,
      reversePickupCostPaise: 300,
      inventoryWriteOffCostPaise: 2000,
      courierRecoveryPaise: 400,
      vendorRecoveryPaise: 1000
    });
    expect(net.netLossPaise).toBe(10000 + 1800 + 500 + 300 + 2000 - 400 - 1000);
    expect(net.formula).toContain("merchandiseRefund");
  });

  it("blocks reverse shipping deduction while policy is CONFIGURATION_PENDING", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 3 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
    await completePaidOrder(rzpOrderId, `pay_p4_${Date.now()}`);
    const caseNumber = await nextReturnCaseNumber();
    const request = await prisma.orderServiceRequest.create({
      data: {
        caseNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.email,
        type: "REFUND_AFTER_DELIVERY",
        status: "APPROVED",
        reasonCode: "changed_mind",
        reasonLabel: "Changed mind"
      }
    });

    await expect(
      upsertReturnCaseEconomics({
        requestId: request.id,
        data: {
          reverseShippingDeductionPaise: 5000,
          reverseShippingDeductionPolicy: "CONFIGURATION_PENDING"
        }
      })
    ).rejects.toMatchObject({ code: "REVERSE_SHIPPING_POLICY_PENDING" });

    const row = await upsertReturnCaseEconomics({
      requestId: request.id,
      data: {
        reversePickupCostPaise: 2000,
        merchandiseRefundPaise: 10000,
        reverseShippingDeductionPolicy: "CONFIGURATION_PENDING"
      }
    });
    expect(row.reverseShippingDeductionPaise).toBeNull();
    expect(row.reverseShippingDeductionPolicy).toBe("CONFIGURATION_PENDING");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
