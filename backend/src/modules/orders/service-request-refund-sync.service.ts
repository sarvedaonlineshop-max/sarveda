import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

/**
 * When a gateway refund is finalized (API or webhook), close matching return/
 * cancellation cases that are still stuck on Refund pending.
 *
 * Payment/Order rows are updated by refund-sync; this keeps OrderServiceRequest
 * resolution in sync so admin desk stage labels become Completed.
 */
export async function syncReturnCasesAfterOrderRefund(
  orderId: string,
  opts?: {
    providerRefundId?: string | null;
    amountInPaise?: number;
    reason?: string;
  }
): Promise<number> {
  if (!orderId) return 0;

  const payments = await prisma.payment.findMany({
    where: { orderId },
    select: {
      provider: true,
      status: true,
      amountInPaise: true,
      refundedInPaise: true
    }
  });

  const fullyRefunded = payments.some(
    (p) =>
      p.provider !== "COD" &&
      (p.status === "REFUNDED" ||
        (p.amountInPaise > 0 && (p.refundedInPaise ?? 0) >= p.amountInPaise))
  );

  const open = await prisma.orderServiceRequest.findMany({
    where: {
      orderId,
      status: { in: ["APPROVED", "PARTIALLY_APPROVED"] },
      refundProcessedAt: null,
      resolutionStatus: { in: ["NONE", "REFUND_PENDING", "REFUND_PROCESSING"] }
    },
    select: {
      id: true,
      type: true,
      resolutionStatus: true,
      refundInitiatedAt: true,
      refundTotalInPaise: true,
      closedAt: true,
      caseNumber: true
    }
  });

  if (!open.length) return 0;

  const now = new Date();
  let updated = 0;

  for (const req of open) {
    const shouldCloseCancel =
      req.type === "CANCEL_BEFORE_DELIVERY" && fullyRefunded;

    const shouldCloseReturn =
      req.type === "REFUND_AFTER_DELIVERY" &&
      (req.resolutionStatus === "REFUND_PROCESSING" ||
        (req.resolutionStatus === "REFUND_PENDING" && fullyRefunded) ||
        (req.resolutionStatus === "NONE" && fullyRefunded));

    if (!shouldCloseCancel && !shouldCloseReturn) continue;

    await prisma.orderServiceRequest.update({
      where: { id: req.id },
      data: {
        resolutionStatus: "REFUNDED",
        refundProcessedAt: now,
        refundCompletedAt: now,
        refundInitiatedAt: req.refundInitiatedAt ?? now,
        ...(opts?.providerRefundId
          ? { refundProviderReference: opts.providerRefundId }
          : {}),
        ...(typeof opts?.amountInPaise === "number" && opts.amountInPaise > 0
          ? { refundTotalInPaise: (req.refundTotalInPaise ?? 0) || opts.amountInPaise }
          : {}),
        closedAt: req.closedAt ?? now
      }
    });

    try {
      const { appendCaseEvent } = await import("./return-case-events.service");
      await appendCaseEvent({
        requestId: req.id,
        eventType: "REFUND_COMPLETED",
        message:
          opts?.reason ||
          `Refund confirmed by gateway${opts?.providerRefundId ? ` (${opts.providerRefundId})` : ""}`,
        payloadJson: {
          providerRefundId: opts?.providerRefundId ?? null,
          amountInPaise: opts?.amountInPaise ?? null,
          source: "gateway_refund_sync"
        },
        actor: { role: "SYSTEM" }
      });
    } catch (err) {
      logger.warn("return_case_refund_sync_event_failed", {
        requestId: req.id,
        caseNumber: req.caseNumber,
        err
      });
    }

    updated += 1;
    logger.info("return_case_marked_refunded_from_gateway", {
      requestId: req.id,
      caseNumber: req.caseNumber,
      orderId,
      providerRefundId: opts?.providerRefundId ?? null
    });
  }

  return updated;
}
