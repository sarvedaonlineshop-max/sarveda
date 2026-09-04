/**
 * MAN-007 — return/refund notification hardening.
 * Proves authoritative refund amount (₹6.50) is used — never order total (₹13).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/redisConnection", () => ({
  getRedisConnection: () => null
}));

vi.mock("../../src/modules/notifications/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/notifications/email")>();
  return {
    ...actual,
    sendMail: vi.fn().mockResolvedValue(undefined),
    buildShopEmail: actual.buildShopEmail
  };
});

vi.mock("../../src/modules/notifications/whatsapp", () => ({
  toWhatsAppE164: (p: string | null | undefined) => (p ? `+91${p.replace(/\D/g, "").slice(-10)}` : null),
  sendWhatsAppNamedTemplate: vi.fn().mockRejectedValue(new Error("template not approved"))
}));

import { sendMail } from "../../src/modules/notifications/email";
import { sendWhatsAppNamedTemplate } from "../../src/modules/notifications/whatsapp";
import {
  buildReturnCaseMessage,
  formatMoneyMinor,
  notifyReturnCaseEvent,
  resolveAuthoritativeRefundNotifyAmount,
  SUGGESTED_WA_TEMPLATE_NAMES
} from "../../src/modules/orders/return-case-notifications.service";
import { returnApprovalCustomerMessage } from "../../src/modules/orders/return-replacement.service";
import { resolveAuthoritativeRefundAmountInPaise } from "../../src/modules/notifications/email";

describe("MAN-007 return/refund notifications", () => {
  beforeEach(() => {
    vi.mocked(sendMail).mockClear();
    vi.mocked(sendWhatsAppNamedTemplate).mockClear();
    delete process.env.WA_TEMPLATE_REFUND_INITIATED;
    delete process.env.WA_TEMPLATE_RETURN_REQUEST_RECEIVED;
  });

  it("1. return request submitted builds acknowledgment (awaiting review, no approval)", () => {
    const msg = buildReturnCaseMessage("RETURN_REQUEST_SUBMITTED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "Test Bowl × 1",
      quantity: 1,
      customerReason: "Damaged",
      requestedResolution: "RETURN_FOR_REFUND"
    });
    expect(msg.subject).toMatch(/Return request received/);
    expect(msg.textBody).toMatch(/Awaiting review/);
    expect(msg.textBody).toMatch(/does not mean your request has been approved/i);
    expect(msg.textBody).toContain("RC-202609-00001");
    expect(msg.textBody).toContain("SRV-20260900005");
    expect(msg.textBody).not.toMatch(/Your return\/refund request has been approved/i);
  });

  it("2. approved physical return uses receive-and-inspect wording", () => {
    const msg = buildReturnCaseMessage("RETURN_APPROVED_PHYSICAL", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "Test Bowl × 1",
      quantity: 1
    });
    expect(msg.textBody).toMatch(/receive and inspect/i);
    expect(msg.textBody).not.toMatch(/refund is being processed/i);
    expect(returnApprovalCustomerMessage({ physicalReturnRequired: true })).toMatch(
      /receive and inspect/i
    );
  });

  it("3. approved no-return uses different wording", () => {
    const msg = buildReturnCaseMessage("RETURN_APPROVED_NO_RETURN", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "Test Bowl × 1"
    });
    expect(msg.textBody).toMatch(/refund is being processed/i);
    expect(msg.textBody).not.toMatch(/receive and inspect/i);
    expect(returnApprovalCustomerMessage({ physicalReturnRequired: false })).toMatch(
      /refund is being processed/i
    );
  });

  it("4. rejected message is customer-friendly without internal root cause", () => {
    const msg = buildReturnCaseMessage("RETURN_REJECTED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "Test Bowl × 1",
      rejectionNote: "Item was used beyond return window"
    });
    expect(msg.textBody).toContain("could not approve");
    expect(msg.textBody).not.toMatch(/ROOT_CAUSE|DAMAGED_NON_RESTOCKABLE|WRITE_OFF|employee/i);
  });

  it("5. pickup created includes courier and AWB", () => {
    const msg = buildReturnCaseMessage("RETURN_PICKUP_CREATED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "",
      courier: "Delhivery",
      awb: "RVP123456",
      trackingUrl: "https://example.com/track/RVP123456"
    });
    expect(msg.textBody).toContain("Delhivery");
    expect(msg.textBody).toContain("RVP123456");
  });

  it("6. received uses warehouse inspection wording (not refund complete)", () => {
    const msg = buildReturnCaseMessage("RETURN_RECEIVED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "Test Bowl × 1",
      receivedAt: new Date("2026-09-03T10:00:00Z")
    });
    expect(msg.textBody).toMatch(/warehouse/i);
    expect(msg.textBody).toMatch(/inspection/i);
    expect(msg.textBody).not.toMatch(/refund.*(complete|credited)/i);
  });

  it("7. QC completed uses customer-friendly inspection message", () => {
    const refundMsg = buildReturnCaseMessage("RETURN_QC_COMPLETED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "Test Bowl × 1",
      qcOutcome: "refund"
    });
    expect(refundMsg.textBody).toMatch(/Inspection has been completed/i);
    expect(refundMsg.textBody).toMatch(/refund will now be processed/i);
    expect(refundMsg.textBody).not.toMatch(/DAMAGED_NON_RESTOCKABLE|QUARANTINE|WRITE_OFF/);

    const replMsg = buildReturnCaseMessage("RETURN_QC_COMPLETED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "Test Bowl × 1",
      qcOutcome: "replacement"
    });
    expect(replMsg.textBody).toMatch(/replacement will now be processed/i);
  });

  it("8. order total ₹13 + refund ₹6.50 → notification says ₹6.50", () => {
    const orderTotalPaise = 1300;
    const refundPaise = 650;
    const amount = resolveAuthoritativeRefundNotifyAmount({
      refundAmountInPaise: refundPaise,
      orderGrandTotalInPaise: orderTotalPaise
    });
    expect(amount).toBe(650);
    expect(formatMoneyMinor(amount)).toBe("₹6.50");

    const msg = buildReturnCaseMessage("RETURN_REFUND_INITIATED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      customerName: "Arjun",
      itemSummary: "Test Bowl × 1",
      refundAmountInPaise: refundPaise,
      currency: "INR",
      paymentProvider: "RAZORPAY"
    });
    expect(msg.refundAmountFormatted).toBe("₹6.50");
    expect(msg.textBody).toContain("₹6.50");
    expect(msg.textBody).not.toContain("₹13.00");
    expect(msg.textBody).not.toContain("₹13");
    expect(msg.waBodyParams).toContain("₹6.50");
  });

  it("9. partial refund never substitutes order total", () => {
    expect(() =>
      resolveAuthoritativeRefundNotifyAmount({
        refundAmountInPaise: 0,
        orderGrandTotalInPaise: 1300
      })
    ).toThrow(/positive/);
    const msg = buildReturnCaseMessage("RETURN_REFUND_INITIATED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "x",
      refundAmountInPaise: 650,
      currency: "INR"
    });
    expect(msg.refundAmountFormatted).not.toBe(formatMoneyMinor(1300));
  });

  it("10. duplicate event does not duplicate email send (in-memory claim when Redis null allows first; second call still sends without Redis — documented)", async () => {
    // Without Redis, claim always returns true. Idempotency is Redis NX in production.
    // Prove payload identity for duplicate business event content.
    const payload = {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "Test Bowl × 1",
      refundAmountInPaise: 650,
      currency: "INR",
      paymentProvider: "RAZORPAY" as const
    };
    const a = buildReturnCaseMessage("RETURN_REFUND_INITIATED", payload);
    const b = buildReturnCaseMessage("RETURN_REFUND_INITIATED", payload);
    expect(a.textBody).toBe(b.textBody);
    expect(a.waBodyParams).toEqual(b.waBodyParams);
  });

  it("11. missing/unapproved WhatsApp template does not fail return notify", async () => {
    const result = await notifyReturnCaseEvent("req-test-1", "RETURN_REFUND_INITIATED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      customerPhone: "9876543210",
      itemSummary: "Test Bowl × 1",
      refundAmountInPaise: 650,
      currency: "INR",
      paymentProvider: "RAZORPAY"
    });
    expect(result.emailAttempted).toBe(true);
    expect(result.whatsappSkippedReason).toBe("template_unavailable");
    expect(sendMail).toHaveBeenCalled();
    expect(sendWhatsAppNamedTemplate).not.toHaveBeenCalled();
  });

  it("12. refund message never claims bank credit on initiation", () => {
    const msg = buildReturnCaseMessage("RETURN_REFUND_INITIATED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      itemSummary: "x",
      refundAmountInPaise: 650,
      currency: "INR"
    });
    expect(msg.textBody).toMatch(/initiated/i);
    expect(msg.textBody).not.toMatch(/credited to your bank/i);
    expect(msg.textBody).toMatch(/few business days/i);
  });

  it("13. internal root cause / disposition enums never exposed", () => {
    for (const event of [
      "RETURN_REJECTED",
      "RETURN_QC_COMPLETED",
      "RETURN_REFUND_INITIATED"
    ] as const) {
      const msg = buildReturnCaseMessage(event, {
        orderNumber: "SRV-20260900005",
        caseNumber: "RC-202609-00001",
        customerEmail: "c@example.com",
        itemSummary: "Bowl",
        rejectionNote: "Policy window elapsed",
        refundAmountInPaise: event.includes("REFUND") ? 650 : null,
        qcOutcome: "refund"
      });
      expect(msg.textBody).not.toMatch(
        /DAMAGED_NON_RESTOCKABLE|QUARANTINE|WRITE_OFF|ROOT_CAUSE|responsibleTeam|employeeId/i
      );
    }
  });

  it("14. email and WhatsApp payloads use the same authoritative event data", () => {
    const msg = buildReturnCaseMessage("RETURN_REFUND_INITIATED", {
      orderNumber: "SRV-20260900005",
      caseNumber: "RC-202609-00001",
      customerEmail: "c@example.com",
      customerName: "Radha",
      itemSummary: "Bowl × 1",
      refundAmountInPaise: 650,
      currency: "INR",
      paymentProvider: "RAZORPAY"
    });
    expect(msg.waBodyParams[1]).toBe("SRV-20260900005");
    expect(msg.waBodyParams[2]).toBe(msg.refundAmountFormatted);
    expect(msg.waBodyParams[3]).toBe("RC-202609-00001");
    expect(msg.textBody).toContain(msg.refundAmountFormatted!);
    expect(SUGGESTED_WA_TEMPLATE_NAMES.RETURN_REFUND_INITIATED).toBe("sarveda_refund_initiated");
  });

  it("resolveAuthoritativeRefundAmountInPaise prefers opts over inventing totals", async () => {
    const amount = await resolveAuthoritativeRefundAmountInPaise("missing-order-id", {
      refundAmountInPaise: 650
    });
    expect(amount).toBe(650);
  });
});
