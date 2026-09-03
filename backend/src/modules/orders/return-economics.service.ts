import type { Prisma, ReturnClaimStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { appendCaseEvent } from "./return-case-events.service";

export type UpsertReturnEconomicsInput = {
  customerPaidForwardShippingPaise?: number | null;
  actualForwardCourierCostPaise?: number | null;
  reversePickupCostPaise?: number | null;
  replacementShippingCostPaise?: number | null;
  merchandiseRefundPaise?: number | null;
  gstReversalPaise?: number | null;
  discountReversalPaise?: number | null;
  customerDeductionPaise?: number | null;
  customerDeductionLabel?: string | null;
  /** Must remain null unless an explicit policy value is provided — never invent. */
  reverseShippingDeductionPaise?: number | null;
  reverseShippingDeductionPolicy?: string;
  inventoryWriteOffCostPaise?: number | null;
  otherCostPaise?: number | null;
  otherCostLabel?: string | null;
  courierRecoveryPaise?: number | null;
  vendorRecoveryPaise?: number | null;
  otherRecoveryPaise?: number | null;
  otherRecoveryLabel?: string | null;
  notes?: string | null;
};

/**
 * Net Sarveda loss (operational read model — not a journal):
 * customer refund components + courier costs + write-off + other costs
 * − courier/vendor/other recoveries.
 * Does NOT double-count revenue reversal as inventory loss.
 * reverseShippingDeduction is included only when explicitly set (policy pending otherwise).
 */
export function computeNetSarvedaLossPaise(e: {
  merchandiseRefundPaise?: number | null;
  gstReversalPaise?: number | null;
  customerPaidForwardShippingPaise?: number | null;
  actualForwardCourierCostPaise?: number | null;
  reversePickupCostPaise?: number | null;
  replacementShippingCostPaise?: number | null;
  inventoryWriteOffCostPaise?: number | null;
  otherCostPaise?: number | null;
  customerDeductionPaise?: number | null;
  reverseShippingDeductionPaise?: number | null;
  courierRecoveryPaise?: number | null;
  vendorRecoveryPaise?: number | null;
  otherRecoveryPaise?: number | null;
}): {
  netLossPaise: number;
  formula: string;
  components: Record<string, number>;
} {
  const components = {
    merchandiseRefundPaise: e.merchandiseRefundPaise ?? 0,
    gstReversalPaise: e.gstReversalPaise ?? 0,
    // Prefer actual courier cost when known; else customer-paid forward shipping as proxy cost exposure.
    forwardCourierCostPaise: e.actualForwardCourierCostPaise ?? e.customerPaidForwardShippingPaise ?? 0,
    reversePickupCostPaise: e.reversePickupCostPaise ?? 0,
    replacementShippingCostPaise: e.replacementShippingCostPaise ?? 0,
    inventoryWriteOffCostPaise: e.inventoryWriteOffCostPaise ?? 0,
    otherCostPaise: e.otherCostPaise ?? 0,
    customerDeductionPaise: -(e.customerDeductionPaise ?? 0),
    reverseShippingDeductionPaise: -(e.reverseShippingDeductionPaise ?? 0),
    courierRecoveryPaise: -(e.courierRecoveryPaise ?? 0),
    vendorRecoveryPaise: -(e.vendorRecoveryPaise ?? 0),
    otherRecoveryPaise: -(e.otherRecoveryPaise ?? 0)
  };
  const netLossPaise = Object.values(components).reduce((s, v) => s + v, 0);
  return {
    netLossPaise,
    formula:
      "merchandiseRefund + gstReversal + forwardCourierCost + reversePickup + replacementShipping + inventoryWriteOff + otherCost − customerDeduction − reverseShippingDeduction − courierRecovery − vendorRecovery − otherRecovery",
    components
  };
}

export async function upsertReturnCaseEconomics(opts: {
  requestId: string;
  data: UpsertReturnEconomicsInput;
  adminUserId?: string;
  adminEmail?: string;
}) {
  const request = await prisma.orderServiceRequest.findUnique({ where: { id: opts.requestId } });
  if (!request) {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const policy = opts.data.reverseShippingDeductionPolicy ?? "CONFIGURATION_PENDING";
  if (
    opts.data.reverseShippingDeductionPaise != null &&
    opts.data.reverseShippingDeductionPaise !== 0 &&
    policy === "CONFIGURATION_PENDING"
  ) {
    throw Object.assign(
      new Error(
        "Reverse shipping deduction cannot be auto-applied while policy is CONFIGURATION_PENDING (POLICY_DECISION_REQUIRED)"
      ),
      { statusCode: 400, code: "REVERSE_SHIPPING_POLICY_PENDING" }
    );
  }

  const row = await prisma.returnCaseEconomics.upsert({
    where: { requestId: opts.requestId },
    create: {
      requestId: opts.requestId,
      ...opts.data,
      reverseShippingDeductionPolicy: policy
    },
    update: {
      ...opts.data,
      reverseShippingDeductionPolicy: policy
    }
  });

  return row;
}

/**
 * Sync economics from authoritative RefundAllocation rows when present.
 * Does not invent reverse-shipping deductions.
 */
export async function refreshEconomicsFromRefundAllocations(requestId: string) {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: requestId },
    include: { order: { include: { payments: { include: { refunds: { include: { allocations: true } } } } } } }
  });
  if (!request) return null;

  const allocations = request.order.payments.flatMap((p) =>
    p.refunds.flatMap((r) => r.allocations)
  );
  if (!allocations.length) {
    return upsertReturnCaseEconomics({
      requestId,
      data: {
        merchandiseRefundPaise: request.refundTotalInPaise ?? null,
        reverseShippingDeductionPolicy: "CONFIGURATION_PENDING"
      }
    });
  }

  const merchandise = allocations.reduce((s, a) => s + a.merchandiseTaxablePaise, 0);
  const gst = allocations.reduce((s, a) => s + a.gstPaise, 0);
  const discount = allocations.reduce((s, a) => s + a.discountReversedPaise, 0);
  const forwardShip = allocations.reduce((s, a) => s + a.forwardShippingPaise, 0);
  const approved = allocations.reduce((s, a) => s + a.approvedRefundPaise, 0);

  return upsertReturnCaseEconomics({
    requestId,
    data: {
      merchandiseRefundPaise: merchandise,
      gstReversalPaise: gst,
      discountReversalPaise: discount,
      customerPaidForwardShippingPaise: forwardShip,
      // Keep reverse deduction at 0 from allocations (Phase 1A always 0) unless policy later sets it.
      reverseShippingDeductionPaise: null,
      reverseShippingDeductionPolicy: "CONFIGURATION_PENDING",
      notes: `Synced from ${allocations.length} RefundAllocation row(s); approvedRefund total ${approved}`
    }
  });
}

export async function getReturnCaseEconomicsView(requestId: string) {
  const economics = await prisma.returnCaseEconomics.findUnique({ where: { requestId } });
  const courierClaims = await prisma.returnCourierClaim.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" }
  });
  const vendorClaims = await prisma.returnVendorClaim.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" }
  });
  const allocations = await prisma.refundAllocation.findMany({
    where: {
      refund: {
        payment: {
          order: { serviceRequests: { some: { id: requestId } } }
        }
      }
    }
  });

  const courierRecovery = courierClaims.reduce((s, c) => s + c.recoveredAmountPaise, 0);
  const vendorRecovery = vendorClaims.reduce((s, c) => s + c.recoveredAmountPaise, 0);

  const merged = {
    ...(economics ?? {}),
    courierRecoveryPaise: economics?.courierRecoveryPaise ?? courierRecovery,
    vendorRecoveryPaise: economics?.vendorRecoveryPaise ?? vendorRecovery
  };

  const net = computeNetSarvedaLossPaise(merged);

  return {
    economics,
    courierClaims,
    vendorClaims,
    refundAllocations: allocations,
    netSarvedaLoss: net,
    reverseShippingDeductionPolicy:
      economics?.reverseShippingDeductionPolicy ?? "CONFIGURATION_PENDING"
  };
}

export async function openCourierClaim(opts: {
  requestId: string;
  reason: string;
  claimedAmountPaise: number;
  courierName?: string;
  reference?: string;
  notes?: string;
  adminUserId?: string;
  adminEmail?: string;
}) {
  const claim = await prisma.returnCourierClaim.create({
    data: {
      requestId: opts.requestId,
      reason: opts.reason.trim(),
      claimedAmountPaise: Math.max(0, Math.round(opts.claimedAmountPaise)),
      courierName: opts.courierName?.trim() || null,
      reference: opts.reference?.trim() || null,
      notes: opts.notes?.trim() || null,
      status: "OPEN"
    }
  });
  await appendCaseEvent({
    requestId: opts.requestId,
    eventType: "CLAIM_OPENED",
    message: `Courier claim opened: ${claim.reason}`,
    payloadJson: { claimId: claim.id, type: "COURIER", claimedAmountPaise: claim.claimedAmountPaise },
    actor: { userId: opts.adminUserId, email: opts.adminEmail, role: "ADMIN" }
  });
  return claim;
}

export async function updateCourierClaim(opts: {
  claimId: string;
  status?: ReturnClaimStatus;
  recoveredAmountPaise?: number;
  reference?: string;
  notes?: string;
  adminUserId?: string;
  adminEmail?: string;
}) {
  const existing = await prisma.returnCourierClaim.findUnique({ where: { id: opts.claimId } });
  if (!existing) {
    throw Object.assign(new Error("Courier claim not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  const closed =
    opts.status && ["RECOVERED", "REJECTED", "CLOSED", "WRITTEN_OFF"].includes(opts.status);
  const updated = await prisma.returnCourierClaim.update({
    where: { id: opts.claimId },
    data: {
      status: opts.status,
      recoveredAmountPaise:
        opts.recoveredAmountPaise != null
          ? Math.max(0, Math.round(opts.recoveredAmountPaise))
          : undefined,
      reference: opts.reference?.trim() || undefined,
      notes: opts.notes?.trim() || undefined,
      closedAt: closed ? new Date() : undefined
    }
  });
  if (closed) {
    await appendCaseEvent({
      requestId: existing.requestId,
      eventType: "CLAIM_CLOSED",
      message: `Courier claim ${updated.status}`,
      payloadJson: {
        claimId: updated.id,
        type: "COURIER",
        recoveredAmountPaise: updated.recoveredAmountPaise
      },
      actor: { userId: opts.adminUserId, email: opts.adminEmail, role: "ADMIN" }
    });
  }
  return updated;
}

export async function openVendorClaim(opts: {
  requestId: string;
  reason: string;
  claimedAmountPaise: number;
  vendorId?: string;
  vendorNameSnapshot?: string;
  reference?: string;
  notes?: string;
  adminUserId?: string;
  adminEmail?: string;
}) {
  const claim = await prisma.returnVendorClaim.create({
    data: {
      requestId: opts.requestId,
      reason: opts.reason.trim(),
      claimedAmountPaise: Math.max(0, Math.round(opts.claimedAmountPaise)),
      vendorId: opts.vendorId ?? null,
      vendorNameSnapshot: opts.vendorNameSnapshot?.trim() || null,
      reference: opts.reference?.trim() || null,
      notes: opts.notes?.trim() || null,
      status: "OPEN"
    }
  });
  await appendCaseEvent({
    requestId: opts.requestId,
    eventType: "CLAIM_OPENED",
    message: `Vendor claim opened: ${claim.reason}`,
    payloadJson: { claimId: claim.id, type: "VENDOR", claimedAmountPaise: claim.claimedAmountPaise },
    actor: { userId: opts.adminUserId, email: opts.adminEmail, role: "ADMIN" }
  });
  return claim;
}

export async function updateVendorClaim(opts: {
  claimId: string;
  status?: ReturnClaimStatus;
  recoveredAmountPaise?: number;
  reference?: string;
  notes?: string;
  adminUserId?: string;
  adminEmail?: string;
}) {
  const existing = await prisma.returnVendorClaim.findUnique({ where: { id: opts.claimId } });
  if (!existing) {
    throw Object.assign(new Error("Vendor claim not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  const closed =
    opts.status && ["RECOVERED", "REJECTED", "CLOSED", "WRITTEN_OFF"].includes(opts.status);
  const updated = await prisma.returnVendorClaim.update({
    where: { id: opts.claimId },
    data: {
      status: opts.status,
      recoveredAmountPaise:
        opts.recoveredAmountPaise != null
          ? Math.max(0, Math.round(opts.recoveredAmountPaise))
          : undefined,
      reference: opts.reference?.trim() || undefined,
      notes: opts.notes?.trim() || undefined,
      closedAt: closed ? new Date() : undefined
    }
  });
  if (closed) {
    await appendCaseEvent({
      requestId: existing.requestId,
      eventType: "CLAIM_CLOSED",
      message: `Vendor claim ${updated.status}`,
      payloadJson: {
        claimId: updated.id,
        type: "VENDOR",
        recoveredAmountPaise: updated.recoveredAmountPaise
      },
      actor: { userId: opts.adminUserId, email: opts.adminEmail, role: "ADMIN" }
    });
  }
  return updated;
}

export type { Prisma };
