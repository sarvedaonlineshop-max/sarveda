import type {
  OrderServiceRequestStatus,
  ReturnLineReviewDecision,
  ReturnShippingRefundPolicy
} from "@prisma/client";

import { prisma } from "../../config/db";
import { shippingPolicyForReason } from "./return-replacement.constants";

export type LineReviewDecisionInput = "APPROVED" | "REJECTED" | "MORE_INFO_REQUIRED";

export function resolveShippingPolicyForReasonCode(reasonCode: string): ReturnShippingRefundPolicy {
  return shippingPolicyForReason(reasonCode);
}

export function shippingPolicyLabel(policy: ReturnShippingRefundPolicy | null | undefined): string {
  switch (policy) {
    case "SHIPPING_REFUNDABLE":
      return "Shipping refundable — seller/logistics fault";
    case "SHIPPING_RETAINED":
      return "Shipping retained — customer preference";
    case "MANUAL_REVIEW":
      return "Shipping — manual review";
    default:
      return "Shipping policy unset";
  }
}

export function summarizeCaseShippingPolicy(
  policies: Array<ReturnShippingRefundPolicy | null | undefined>
): "MIXED" | ReturnShippingRefundPolicy | "UNSET" {
  const set = [...new Set(policies.filter(Boolean) as ReturnShippingRefundPolicy[])];
  if (set.length === 0) return "UNSET";
  if (set.length === 1) return set[0]!;
  return "MIXED";
}

/**
 * Heal legacy / pre-MAN-008 cases: persist per-line shipping policy from reasonCode
 * when missing. Does not change review decisions or approve anything.
 */
export async function ensureReturnLinePoliciesHealed(requestId: string): Promise<{
  healedPolicyCount: number;
  healedLegacyApprovedCount: number;
}> {
  const items = await prisma.orderServiceRequestItem.findMany({
    where: { requestId },
    select: {
      id: true,
      reasonCode: true,
      shippingRefundPolicy: true,
      reviewDecision: true
    }
  });
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: requestId },
    select: { status: true, shippingRefundPolicy: true }
  });

  let healedPolicyCount = 0;
  let healedLegacyApprovedCount = 0;

  for (const item of items) {
    if (!item.shippingRefundPolicy) {
      const policy = resolveShippingPolicyForReasonCode(item.reasonCode);
      await prisma.orderServiceRequestItem.update({
        where: { id: item.id },
        data: { shippingRefundPolicy: policy }
      });
      healedPolicyCount += 1;
    }
  }

  // Legacy single/multi cases already APPROVED with lines still PENDING:
  // treat those lines as approved so refund/pickup keep working.
  if (
    request &&
    (request.status === "APPROVED" || request.status === "PARTIALLY_APPROVED") &&
    items.some((i) => i.reviewDecision === "PENDING") &&
    !items.some((i) => i.reviewDecision === "REJECTED" || i.reviewDecision === "MORE_INFO_REQUIRED")
  ) {
    const pending = items.filter((i) => i.reviewDecision === "PENDING");
    if (pending.length) {
      await prisma.orderServiceRequestItem.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: {
          reviewDecision: "APPROVED",
          reviewedAt: new Date(),
          customerFacingNote: "Legacy case — line treated as approved with case"
        }
      });
      healedLegacyApprovedCount = pending.length;
    }
  }

  return { healedPolicyCount, healedLegacyApprovedCount };
}

export function deriveCaseStatusFromLineDecisions(
  decisions: ReturnLineReviewDecision[]
): OrderServiceRequestStatus {
  if (!decisions.length) return "PENDING_APPROVAL";
  const hasPending = decisions.some((d) => d === "PENDING");
  const hasMoreInfo = decisions.some((d) => d === "MORE_INFO_REQUIRED");
  const hasApproved = decisions.some((d) => d === "APPROVED");
  const hasRejected = decisions.some((d) => d === "REJECTED");
  const allApproved = decisions.every((d) => d === "APPROVED");
  const allRejected = decisions.every((d) => d === "REJECTED");

  // Line-scoped more-info pauses the case even if other lines are still pending.
  if (hasMoreInfo) return "MORE_INFO_REQUIRED";
  if (hasPending) return "PENDING_APPROVAL";
  if (allRejected) return "REJECTED";
  if (allApproved) return "APPROVED";
  if (hasApproved && hasRejected) return "PARTIALLY_APPROVED";
  return "PENDING_APPROVAL";
}

export function caseStatusRollupLabel(status: OrderServiceRequestStatus | string): string {
  switch (status) {
    case "PENDING_APPROVAL":
      return "Pending approval";
    case "MORE_INFO_REQUIRED":
      return "More info required";
    case "NEEDS_DISCUSSION":
      return "Needs discussion";
    case "APPROVED":
      return "Approved";
    case "PARTIALLY_APPROVED":
      return "Approved in part";
    case "REJECTED":
      return "Rejected";
    default:
      return String(status).replace(/_/g, " ");
  }
}

export function isApprovedLineDecision(decision: ReturnLineReviewDecision | string | null | undefined): boolean {
  return decision === "APPROVED";
}

export function lineParticipatesInPhysicalReturn(item: {
  reviewDecision: ReturnLineReviewDecision | string;
  reasonCode: string;
  requestedResolution: string | null;
  requiresPhysical: boolean;
}): boolean {
  if (!isApprovedLineDecision(item.reviewDecision)) return false;
  if (item.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND") return false;
  if (item.requestedResolution === "MISSING_PART") return false;
  return item.requiresPhysical;
}

/**
 * Per-line review decision. Reject / more-info require a customer-facing note.
 */
export async function reviewReturnCaseLine(opts: {
  orderId: string;
  requestId: string;
  itemId: string;
  decision: LineReviewDecisionInput;
  customerFacingNote?: string;
  internalNote?: string;
  moreInfoPrompt?: string;
  adminEmail: string;
  adminUserId?: string;
}): Promise<void> {
  await ensureReturnLinePoliciesHealed(opts.requestId);

  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId, type: "REFUND_AFTER_DELIVERY" },
    include: { items: true, returnShipment: true }
  });
  if (!request) {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (["REJECTED", "CONVERTED_TO_CANCELLATION"].includes(request.status) && opts.decision !== "APPROVED") {
    // Allow reviewing lines on open cases only.
  }
  if (request.refundProcessedAt) {
    throw Object.assign(new Error("Cannot change line decisions after refund"), {
      statusCode: 409,
      code: "ALREADY_REFUNDED"
    });
  }

  const item = request.items.find((i) => i.id === opts.itemId);
  if (!item) {
    throw Object.assign(new Error("Return line not found"), { statusCode: 404, code: "LINE_NOT_FOUND" });
  }

  const customerNote = opts.customerFacingNote?.trim() || "";
  if (opts.decision === "REJECTED" && !customerNote) {
    throw Object.assign(new Error("A customer-facing reason is required when rejecting a line"), {
      statusCode: 400,
      code: "CUSTOMER_NOTE_REQUIRED"
    });
  }
  const moreInfoPrompt = opts.moreInfoPrompt?.trim() || customerNote;
  if (opts.decision === "MORE_INFO_REQUIRED" && !moreInfoPrompt) {
    throw Object.assign(new Error("Describe what information is needed for this line"), {
      statusCode: 400,
      code: "MORE_INFO_PROMPT_REQUIRED"
    });
  }

  const now = new Date();
  await prisma.orderServiceRequestItem.update({
    where: { id: item.id },
    data: {
      reviewDecision: opts.decision,
      reviewedAt: now,
      reviewedByEmail: opts.adminEmail,
      reviewedByUserId: opts.adminUserId ?? null,
      customerFacingNote: customerNote || (opts.decision === "MORE_INFO_REQUIRED" ? moreInfoPrompt : null),
      internalReviewNote: opts.internalNote?.trim() || null,
      moreInfoPrompt: opts.decision === "MORE_INFO_REQUIRED" ? moreInfoPrompt : null,
      shippingRefundPolicy:
        item.shippingRefundPolicy ?? resolveShippingPolicyForReasonCode(item.reasonCode)
    }
  });

  const freshItems = await prisma.orderServiceRequestItem.findMany({
    where: { requestId: request.id },
    select: {
      id: true,
      reviewDecision: true,
      reasonCode: true,
      requestedResolution: true,
      qtySelected: true,
      nameSnapshot: true,
      customerFacingNote: true,
      shippingRefundPolicy: true
    }
  });

  const nextStatus = deriveCaseStatusFromLineDecisions(freshItems.map((i) => i.reviewDecision));
  const { physicalReturnRequiredForReason } = await import("./return-replacement.constants");

  const approvedPhysical = freshItems.filter((i) =>
    lineParticipatesInPhysicalReturn({
      reviewDecision: i.reviewDecision,
      reasonCode: i.reasonCode,
      requestedResolution: i.requestedResolution,
      requiresPhysical: physicalReturnRequiredForReason(i.reasonCode)
    })
  );
  const approvedRefund = freshItems.filter(
    (i) =>
      i.reviewDecision === "APPROVED" &&
      i.requestedResolution &&
      ["RETURN_FOR_REFUND", "PARTIAL_REFUND", "KEEP_ITEM_PARTIAL_REFUND"].includes(i.requestedResolution)
  );
  const approvedReplacement = freshItems.filter(
    (i) => i.reviewDecision === "APPROVED" && i.requestedResolution === "REPLACEMENT"
  );
  const approvedMissing = freshItems.filter(
    (i) => i.reviewDecision === "APPROVED" && i.requestedResolution === "MISSING_PART"
  );

  let resolutionStatus = request.resolutionStatus;
  if (nextStatus === "APPROVED" || nextStatus === "PARTIALLY_APPROVED") {
    if (approvedMissing.length && !approvedRefund.length && !approvedReplacement.length) {
      resolutionStatus = "MISSING_PART_PENDING";
    } else if (approvedReplacement.length && !approvedRefund.length) {
      resolutionStatus = "REPLACEMENT_PENDING";
    } else if (approvedRefund.length) {
      resolutionStatus = "REFUND_PENDING";
    }
  }

  const returnPhysicalStatus =
    nextStatus === "APPROVED" || nextStatus === "PARTIALLY_APPROVED"
      ? approvedPhysical.length
        ? request.returnShipment?.physicalStatus === "IN_TRANSIT" ||
          request.returnShipment?.physicalStatus === "RECEIVED" ||
          request.returnShipment?.physicalStatus === "INSPECTED"
          ? request.returnPhysicalStatus
          : "AWAITING_RETURN"
        : "NOT_REQUIRED"
      : request.returnPhysicalStatus;

  await prisma.$transaction(async (tx) => {
    await tx.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        returnPhysicalStatus,
        resolutionStatus,
        reviewedAt: now,
        reviewedByEmail: opts.adminEmail,
        reviewedByUserId: opts.adminUserId ?? null,
        refundApprovedAt:
          approvedRefund.length && (nextStatus === "APPROVED" || nextStatus === "PARTIALLY_APPROVED")
            ? request.refundApprovedAt ?? now
            : request.refundApprovedAt,
        slaPausedAt: nextStatus === "MORE_INFO_REQUIRED" ? now : null,
        moreInfoPrompt:
          nextStatus === "MORE_INFO_REQUIRED"
            ? freshItems
                .filter((i) => i.reviewDecision === "MORE_INFO_REQUIRED")
                .map((i) => `${i.nameSnapshot}: ${i.customerFacingNote ?? ""}`)
                .join("\n")
            : request.moreInfoPrompt
      }
    });

    if (
      (nextStatus === "APPROVED" || nextStatus === "PARTIALLY_APPROVED") &&
      approvedPhysical.length &&
      !request.returnShipment
    ) {
      await tx.orderReturnShipment.create({
        data: {
          requestId: request.id,
          orderId: request.orderId,
          physicalStatus: "AWAITING_RETURN"
        }
      });
    }

    for (const line of approvedReplacement) {
      const existing = await tx.orderReplacementFulfillment.findUnique({
        where: { requestItemId: line.id }
      });
      if (existing) continue;
      const full = await tx.orderServiceRequestItem.findUnique({
        where: { id: line.id },
        select: { requestedVariantId: true, orderItemId: true, qtySelected: true }
      });
      if (!full) continue;
      const oi = await tx.orderItem.findUnique({
        where: { id: full.orderItemId },
        select: { variantId: true }
      });
      const variantId = full.requestedVariantId ?? oi?.variantId;
      if (!variantId) continue;
      await tx.orderReplacementFulfillment.create({
        data: {
          requestId: request.id,
          requestItemId: line.id,
          orderId: request.orderId,
          replacementVariantId: variantId,
          qty: full.qtySelected,
          status: "REPLACEMENT_PENDING"
        }
      });
    }
  });

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: request.id,
    eventType:
      opts.decision === "APPROVED"
        ? "APPROVED"
        : opts.decision === "REJECTED"
          ? "REJECTED"
          : "MORE_INFO_REQUESTED",
    message: `Line ${item.nameSnapshot} ×${item.qtySelected}: ${opts.decision}`,
    payloadJson: {
      kind: "LINE_REVIEW",
      itemId: item.id,
      decision: opts.decision,
      customerFacingNote: customerNote || null,
      caseStatus: nextStatus
    },
    actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
  });

  // Notify only when the case reaches a terminal review roll-up (no pending lines).
  if (nextStatus === "APPROVED" || nextStatus === "PARTIALLY_APPROVED" || nextStatus === "REJECTED") {
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    const approvedSummary = freshItems
      .filter((i) => i.reviewDecision === "APPROVED")
      .map((i) => `${i.nameSnapshot} × ${i.qtySelected}`)
      .join("; ");
    const rejectedSummary = freshItems
      .filter((i) => i.reviewDecision === "REJECTED")
      .map((i) => `${i.nameSnapshot} × ${i.qtySelected}: ${i.customerFacingNote ?? "Not approved"}`)
      .join("; ");

    if (nextStatus === "REJECTED") {
      void notifyReturnCaseEvent(request.id, "RETURN_REJECTED", {
        orderNumber: request.orderNumber,
        caseNumber: request.caseNumber,
        customerEmail: request.customerEmail,
        itemSummary: rejectedSummary || item.nameSnapshot,
        customerReason: customerNote
      });
    } else if (nextStatus === "PARTIALLY_APPROVED") {
      void notifyReturnCaseEvent(request.id, "RETURN_PARTIALLY_APPROVED", {
        orderNumber: request.orderNumber,
        caseNumber: request.caseNumber,
        customerEmail: request.customerEmail,
        itemSummary: approvedSummary,
        approvedItemSummary: approvedSummary,
        rejectedItemSummary: rejectedSummary,
        quantity: freshItems
          .filter((i) => i.reviewDecision === "APPROVED")
          .reduce((s, i) => s + i.qtySelected, 0),
        physicalReturnRequired: approvedPhysical.length > 0
      });
    } else {
      // fully approved
      void notifyReturnCaseEvent(
        request.id,
        approvedPhysical.length ? "RETURN_APPROVED_PHYSICAL" : "RETURN_APPROVED_NO_RETURN",
        {
          orderNumber: request.orderNumber,
          caseNumber: request.caseNumber,
          customerEmail: request.customerEmail,
          itemSummary: approvedSummary,
          quantity: freshItems
            .filter((i) => i.reviewDecision === "APPROVED")
            .reduce((s, i) => s + i.qtySelected, 0)
        }
      );
    }
  } else if (nextStatus === "MORE_INFO_REQUIRED" && opts.decision === "MORE_INFO_REQUIRED") {
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    void notifyReturnCaseEvent(request.id, "RETURN_MORE_INFO_REQUIRED", {
      orderNumber: request.orderNumber,
      caseNumber: request.caseNumber,
      customerEmail: request.customerEmail,
      itemSummary: `${item.nameSnapshot} × ${item.qtySelected}`,
      moreInfoPrompt
    });
  }
}
