import { Router, type NextFunction, type Request, type Response } from "express";

import { prisma } from "../../config/db";
import { requireAdmin } from "../../middleware/admin";
import { logAdminMutations } from "../../middleware/adminActivity";
import {
  executeRtoRefund,
  loadRtoWorkflowState,
  markRtoReceived,
  setRtoDisposition
} from "../orders/rto-workflow.service";

const router = Router();
router.use(requireAdmin);
router.use(logAdminMutations);

const POST_DISPATCH_SHIPMENT_STATUSES = new Set(["PICKED", "INTRANSIT", "OUT_FOR_DELIVERY", "RTO"]);

function adminUser(req: Request): { id?: string; email?: string } {
  return (req as Request & { authUser?: { id: string; email: string }; user?: { id: string; email?: string } }).authUser ??
    (req as Request & { user?: { id: string; email?: string } }).user ??
    {};
}

router.post(
  "/orders/:orderId/service-requests/:requestId/approve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId, requestId } = req.params;
      const admin = adminUser(req);
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

      const request = await prisma.orderServiceRequest.findFirst({
        where: { id: requestId, orderId },
        include: {
          items: true,
          order: {
            include: {
              shipments: { orderBy: { createdAt: "desc" } },
              payments: { orderBy: { createdAt: "desc" } }
            }
          }
        }
      });

      if (!request || request.type !== "CANCEL_BEFORE_DELIVERY") {
        return next();
      }

      if (!["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "NEEDS_DISCUSSION"].includes(request.status)) {
        return res.status(409).json({
          success: false,
          error: "Request already reviewed",
          code: "ALREADY_REVIEWED"
        });
      }

      const order = request.order;
      const delivered = order.status === "DELIVERED" || order.shipments.some((s) => s.status === "DELIVERED");
      const carrierDispatched = order.shipments.some((s) => POST_DISPATCH_SHIPMENT_STATUSES.has(s.status));

      // Keep the already-tested pre-dispatch approval path in the existing handler.
      // A manually-marked Order: SHIPPED with Shipment: CREATED is not carrier-dispatched yet.
      if (!carrierDispatched || delivered) {
        return next();
      }

      const shipment = order.shipments.find((s) => POST_DISPATCH_SHIPMENT_STATUSES.has(s.status)) ?? order.shipments[0];
      if (!shipment) {
        return res.status(409).json({
          success: false,
          error: "This dispatched order has no shipment row to return to origin.",
          code: "MISSING_SHIPMENT"
        });
      }

      const now = new Date();
      const reasonSummary = request.items.length
        ? request.items.map((i) => `${i.nameSnapshot} — ${i.reasonLabel}`).join("; ")
        : request.reasonLabel ?? "Customer requested cancellation after dispatch";
      const awb = shipment.awb ?? "n/a";
      const rtoNote = `Post-dispatch cancellation approved — RTO started for AWB ${awb}. Refund is held until warehouse receipt/QC. Reason: ${reasonSummary}`;

      const updated = await prisma.$transaction(async (tx) => {
        await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: "RTO",
            rtoAt: shipment.rtoAt ?? now,
            rtoRefundWorkflowStatus: shipment.rtoRefundWorkflowStatus ?? "PENDING",
            rtoRefundLastError: null
          }
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            fulfillmentStatus: "RETURNED",
            notes: order.notes ? `${order.notes}\n${rtoNote}` : rtoNote
          }
        });

        const saved = await tx.orderServiceRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            reviewedAt: now,
            reviewedByEmail: admin.email ?? null,
            adminNote: note || "Approved after dispatch — RTO workflow started",
            resolutionStatus: "REFUND_PENDING"
          },
          include: { photos: true, items: { include: { photos: true } } }
        });

        return saved;
      });

      const { appendCaseEvent } = await import("../orders/return-case-events.service");
      await appendCaseEvent({
        requestId: request.id,
        eventType: "APPROVED",
        message: "Approved after dispatch — RTO started; refund waits for warehouse receipt/QC",
        payloadJson: { shipmentId: shipment.id, awb: shipment.awb, postDispatchRto: true },
        actor: { userId: admin.id, email: admin.email, role: "ADMIN" }
      });

      return res.json({ success: true, data: updated });
    } catch (err) {
      return next(err);
    }
  }
);

router.get("/orders/:id/rto-workflow", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await loadRtoWorkflowState(req.params.id);
    if (!state) {
      return res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
    }
    return res.json({ success: true, data: state });
  } catch (err) {
    return next(err);
  }
});

router.post("/shipments/:shipmentId/manual-intransit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.shipmentId } });
    if (!shipment) {
      return res.status(404).json({ success: false, error: "Shipment not found", code: "NOT_FOUND" });
    }
    if (shipment.status === "DELIVERED" || shipment.status === "RTO") {
      return res.status(409).json({ success: false, error: "Shipment is already closed or returning", code: "SHIPMENT_STATE" });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: "INTRANSIT" }
      });
      await tx.order.update({
        where: { id: shipment.orderId },
        data: { status: "SHIPPED", fulfillmentStatus: "PARTIAL" }
      });
      return saved;
    });
    return res.json({ success: true, data: { shipment: updated } });
  } catch (err) {
    return next(err);
  }
});

router.post("/shipments/:shipmentId/rto/received", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await markRtoReceived({ shipmentId: req.params.shipmentId, adminUserId: adminUser(req).id });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
});

router.post("/shipments/:shipmentId/rto/disposition", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disposition = req.body?.disposition;
    if (!["RESTOCKABLE", "DAMAGED_NON_RESTOCKABLE", "NEEDS_REVIEW"].includes(disposition)) {
      return res.status(400).json({ success: false, error: "Invalid RTO disposition", code: "VALIDATION_ERROR" });
    }
    const result = await setRtoDisposition({
      shipmentId: req.params.shipmentId,
      disposition,
      adminUserId: adminUser(req).id
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
});

router.post("/shipments/:shipmentId/rto/execute-refund", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await executeRtoRefund({ shipmentId: req.params.shipmentId, adminUserId: adminUser(req).id });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
});

export { router as rtoAdminRoutes };
