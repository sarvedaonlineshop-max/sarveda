/**
 * Human operational stages for return-case list filters / desk header.
 * Maps existing enums — does not invent new DB statuses.
 */
export type ReturnCaseStage =
  | "PENDING_APPROVAL"
  | "MORE_INFO_REQUIRED"
  | "NEEDS_DISCUSSION"
  | "APPROVED_AWAITING_RETURN"
  | "RETURN_IN_TRANSIT"
  | "RECEIVED"
  | "QC_PENDING"
  | "REFUND_PENDING"
  | "REPLACEMENT_PENDING"
  | "COMPLETED"
  | "REJECTED";

export const RETURN_CASE_STAGE_LABELS: Record<ReturnCaseStage, string> = {
  PENDING_APPROVAL: "Pending approval",
  MORE_INFO_REQUIRED: "More info required",
  NEEDS_DISCUSSION: "Needs discussion",
  APPROVED_AWAITING_RETURN: "Approved / awaiting return",
  RETURN_IN_TRANSIT: "Return in transit",
  RECEIVED: "Received",
  QC_PENDING: "Inspection / QC pending",
  REFUND_PENDING: "Refund pending",
  REPLACEMENT_PENDING: "Replacement pending",
  COMPLETED: "Completed",
  REJECTED: "Rejected"
};

export function deriveReturnCaseStage(request: {
  status: string;
  returnPhysicalStatus: string;
  resolutionStatus: string;
  refundProcessedAt?: Date | string | null;
  closedAt?: Date | string | null;
}): ReturnCaseStage {
  if (request.status === "REJECTED") return "REJECTED";
  if (request.status === "MORE_INFO_REQUIRED") return "MORE_INFO_REQUIRED";
  if (request.status === "NEEDS_DISCUSSION") return "NEEDS_DISCUSSION";
  if (request.status === "PENDING_APPROVAL") return "PENDING_APPROVAL";
  if (request.status === "PARTIALLY_APPROVED") {
    // Fall through to physical/resolution stages like APPROVED.
  }

  if (
    request.resolutionStatus === "REFUNDED" ||
    request.resolutionStatus === "REPLACEMENT_DELIVERED" ||
    request.resolutionStatus === "CLOSED" ||
    request.closedAt ||
    request.refundProcessedAt
  ) {
    if (
      request.resolutionStatus === "REPLACEMENT_PENDING" ||
      request.resolutionStatus === "REPLACEMENT_SHIPPED"
    ) {
      return "REPLACEMENT_PENDING";
    }
    if (request.resolutionStatus === "REFUNDED" || request.refundProcessedAt) return "COMPLETED";
    if (request.resolutionStatus === "CLOSED" || request.closedAt) return "COMPLETED";
  }

  if (
    request.resolutionStatus === "REPLACEMENT_PENDING" ||
    request.resolutionStatus === "REPLACEMENT_SHIPPED"
  ) {
    return "REPLACEMENT_PENDING";
  }

  if (
    request.resolutionStatus === "REFUND_PENDING" ||
    request.resolutionStatus === "REFUND_PROCESSING"
  ) {
    return "REFUND_PENDING";
  }

  if (request.status === "APPROVED" || request.status === "PARTIALLY_APPROVED") {
    if (request.returnPhysicalStatus === "NOT_REQUIRED") {
      return request.resolutionStatus === "NONE" ? "REFUND_PENDING" : "REFUND_PENDING";
    }
    if (request.returnPhysicalStatus === "AWAITING_RETURN") return "APPROVED_AWAITING_RETURN";
    if (request.returnPhysicalStatus === "IN_TRANSIT") return "RETURN_IN_TRANSIT";
    if (request.returnPhysicalStatus === "RECEIVED") return "RECEIVED";
    if (request.returnPhysicalStatus === "INSPECTED") {
      return request.resolutionStatus === "REFUND_PENDING" ||
        request.resolutionStatus === "REFUND_PROCESSING" ||
        request.resolutionStatus === "NONE"
        ? "REFUND_PENDING"
        : "QC_PENDING";
    }
  }

  return "PENDING_APPROVAL";
}

/** Prisma where fragment for stage filter (OR of status/physical/resolution). */
export function stageToWhere(stage: ReturnCaseStage): Record<string, unknown> {
  switch (stage) {
    case "PENDING_APPROVAL":
      return { status: "PENDING_APPROVAL" };
    case "MORE_INFO_REQUIRED":
      return { status: "MORE_INFO_REQUIRED" };
    case "NEEDS_DISCUSSION":
      return { status: "NEEDS_DISCUSSION" };
    case "REJECTED":
      return { status: "REJECTED" };
    case "APPROVED_AWAITING_RETURN":
      return { status: "APPROVED", returnPhysicalStatus: "AWAITING_RETURN" };
    case "RETURN_IN_TRANSIT":
      return { status: "APPROVED", returnPhysicalStatus: "IN_TRANSIT" };
    case "RECEIVED":
      return { status: "APPROVED", returnPhysicalStatus: "RECEIVED" };
    case "QC_PENDING":
      return {
        status: "APPROVED",
        returnPhysicalStatus: "INSPECTED",
        resolutionStatus: { in: ["NONE"] }
      };
    case "REFUND_PENDING":
      return {
        OR: [
          { resolutionStatus: { in: ["REFUND_PENDING", "REFUND_PROCESSING"] } },
          {
            status: "APPROVED",
            returnPhysicalStatus: "NOT_REQUIRED",
            resolutionStatus: { in: ["REFUND_PENDING", "NONE"] },
            refundProcessedAt: null
          },
          {
            status: "APPROVED",
            returnPhysicalStatus: "INSPECTED",
            resolutionStatus: { in: ["REFUND_PENDING", "NONE"] },
            refundProcessedAt: null
          }
        ]
      };
    case "REPLACEMENT_PENDING":
      return { resolutionStatus: { in: ["REPLACEMENT_PENDING", "REPLACEMENT_SHIPPED"] } };
    case "COMPLETED":
      return {
        OR: [
          { resolutionStatus: { in: ["REFUNDED", "CLOSED", "REPLACEMENT_DELIVERED"] } },
          { refundProcessedAt: { not: null } },
          { closedAt: { not: null } }
        ]
      };
    default:
      return {};
  }
}
