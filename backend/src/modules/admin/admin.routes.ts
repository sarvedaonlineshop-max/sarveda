import { OrderStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { requireAdmin } from "../../middleware/admin";
import { logAdminMutations, requireSuperAdmin } from "../../middleware/adminActivity";
import { validateBody } from "../../middleware/validate";
import * as productsController from "../products/products.controller";
import { createProductSchema, reorderProductsSchema, updateProductSchema } from "../products/schemas";

import * as admin from "./admin.handlers";
import * as legacyOrders from "./legacy-orders.handlers";
import * as activity from "./activity.handlers";
import * as enrollments from "./enrollments.handlers";
import * as reports from "./reports.handlers";
import {
  orderAddressPatchSchema,
  orderItemWarehousesSchema,
  orderPreferredCourierSchema
} from "./admin.handlers";
import {
  adminInventoryRestockBodySchema
} from "../orders/order-inventory-restock.service";
import { adminLineRefundBodySchema } from "../orders/order-line-refund.service";
import * as pickupLocations from "./pickupLocations.handlers";
import { createPickupLocationSchema, updatePickupLocationSchema } from "./pickupLocations.handlers";
import { contentRoutes } from "./content/content.routes";
import * as mediaHandlers from "./media.handlers";
import * as seoSuggest from "./seo-suggest.handlers";
import { couponAdminRoutes } from "../coupons/coupon.admin.routes";
import { enquiriesAdminRoutes } from "../enquiries/enquiries.admin.routes";
import { marketplaceAdminRoutes } from "../marketplaces/marketplaces.routes";
import { purchasesAdminRoutes } from "../purchases/purchases.routes";
import { accountingAdminRoutes } from "../accounting/accounting.routes";
import { isAccountingEmailAllowed } from "../accounting/accounting-access";
import { generateDeliveryChallanBodySchema } from "../delivery-challans/challan.schemas";
import {
  ewayCancelBodySchema,
  ewayMarkNotRequiredBodySchema,
  ewayPrepareBodySchema,
  ewayRecordEbnBodySchema,
  ewayUpdateTransportBodySchema
} from "../eway-bills/eway-bill.schemas";
import * as serviceRequest from "../orders/order-service-request.controller";
import type { NextFunction, Request, Response } from "express";

function requireAccountingAccess(req: Request, res: Response, next: NextFunction) {
  const email = req.authUser?.email;
  if (!isAccountingEmailAllowed(email)) {
    return res.status(403).json({
      success: false,
      error: "Accounting access is limited to designated finance users",
      code: "ACCOUNTING_ACCESS_DENIED"
    });
  }
  return next();
}

const router = Router();
router.use(requireAdmin);
router.use(logAdminMutations);

router.get("/activity/dashboard", requireSuperAdmin, activity.activityDashboard);
router.get("/activity", requireSuperAdmin, activity.activityList);

router.get("/pickup-locations", pickupLocations.listPickupLocations);
router.get("/pickup-locations/:id", pickupLocations.getPickupLocation);
router.post(
  "/pickup-locations",
  validateBody(createPickupLocationSchema),
  pickupLocations.createPickupLocation
);
router.patch(
  "/pickup-locations/:id",
  validateBody(updatePickupLocationSchema),
  pickupLocations.updatePickupLocation
);
router.delete("/pickup-locations/:id", pickupLocations.deletePickupLocation);

router.use("/coupons", couponAdminRoutes);

router.get("/dashboard", admin.dashboard);
router.get("/analytics/woo-products", admin.wooProductAnalytics);
router.get("/reports/export", reports.exportAdminReport);
router.get("/reports/analytics", reports.adminReportAnalytics);
router.get("/me/sessions", reports.adminMeSessions);
router.get("/notifications", admin.adminNotifications);
router.use("/enquiries", enquiriesAdminRoutes);
router.post("/jobs/cart-cleanup", admin.triggerCartCleanup);
router.get("/customers", admin.customersList);
router.get("/enrollments/courses", enrollments.courseEnrollmentsCourses);
router.get("/enrollments", enrollments.courseEnrollmentsList);
router.get("/payments/reconciliation", admin.paymentsReconciliation);
router.get("/orders/export", admin.ordersExport);
router.get("/orders/export/pdf", admin.ordersExportPdf);
router.get("/legacy-orders/stats", legacyOrders.legacyOrdersStats);
router.get("/legacy-orders", legacyOrders.legacyOrdersList);
router.get("/legacy-orders/:id", legacyOrders.legacyOrderDetail);
router.get("/legacy-marketplaces/overview", legacyOrders.legacyMarketplaceOverview);
router.get("/legacy-marketplaces/listings", legacyOrders.legacyMarketplaceListings);
router.get("/legacy-marketplaces/orders", legacyOrders.legacyMarketplaceOrdersList);
router.get("/legacy-marketplaces/returns", legacyOrders.legacyMarketplaceReturnsList);
router.get("/legacy-marketplaces/orders/:id", legacyOrders.legacyMarketplaceOrderDetail);
router.get("/orders/service-requests/pending-count", serviceRequest.adminPendingServiceRequestCount);
router.get("/orders/:orderId/service-requests/photos/:photoId/view", serviceRequest.adminViewServiceRequestPhoto);
router.get("/orders/:orderId/service-requests/photos/:photoId/download", serviceRequest.adminDownloadServiceRequestPhoto);
router.get("/orders", admin.ordersList);
router.get("/orders/:id/invoice/download", admin.downloadOrderInvoice);
router.get("/orders/:id/invoice", admin.orderInvoice);
router.post("/orders/:id/invoice/regenerate", admin.regenerateOrderInvoice);
router.get("/orders/:id/delivery-challan/download", admin.downloadOrderDeliveryChallan);
router.get("/orders/:id/delivery-challan", admin.orderDeliveryChallan);
router.post(
  "/orders/:id/delivery-challan",
  validateBody(generateDeliveryChallanBodySchema),
  admin.generateOrderDeliveryChallan
);
router.get("/orders/:id/eway-bills", admin.listOrderEwayBillsHandler);
router.get("/orders/:id/eway-bills/review", admin.reviewOrderEwayBill);
router.post(
  "/orders/:id/eway-bills/prepare",
  validateBody(ewayPrepareBodySchema),
  admin.prepareOrderEwayBill
);
router.post(
  "/orders/:id/eway-bills/record",
  validateBody(ewayRecordEbnBodySchema),
  admin.recordOrderEwayBillEbn
);
router.post(
  "/orders/:id/eway-bills/not-required",
  validateBody(ewayMarkNotRequiredBodySchema),
  admin.markOrderEwayNotRequired
);
router.get("/orders/:id/eway-bills/:ewayBillId", admin.getOrderEwayBill);
router.post(
  "/orders/:id/eway-bills/:ewayBillId/record",
  validateBody(ewayRecordEbnBodySchema),
  admin.recordOrderEwayBillEbn
);
router.patch(
  "/orders/:id/eway-bills/:ewayBillId/transport",
  validateBody(ewayUpdateTransportBodySchema),
  admin.updateOrderEwayTransport
);
router.post(
  "/orders/:id/eway-bills/:ewayBillId/cancel",
  validateBody(ewayCancelBodySchema),
  admin.cancelOrderEwayBill
);
router.get("/orders/:id", admin.orderDetail);
router.get("/orders/:id/shipping-breakdown", admin.orderShippingBreakdown);
router.patch(
  "/orders/:id/item-warehouses",
  validateBody(orderItemWarehousesSchema),
  admin.patchOrderItemWarehouses
);
router.patch(
  "/orders/:id/preferred-courier",
  validateBody(orderPreferredCourierSchema),
  admin.patchOrderPreferredCourier
);
router.patch(
  "/orders/:id/addresses",
  validateBody(orderAddressPatchSchema),
  admin.patchOrderAddress
);
router.post("/orders/:id/reconcile-razorpay", admin.reconcileRazorpayOrder);
router.post("/orders/:orderId/service-requests/:requestId/approve", serviceRequest.adminApproveServiceRequest);
router.post("/orders/:orderId/service-requests/:requestId/reject", serviceRequest.adminRejectServiceRequest);
router.post(
  "/orders/:orderId/service-requests/:requestId/items/:itemId/review",
  serviceRequest.adminReviewReturnCaseLine
);
router.get(
  "/orders/:orderId/service-requests/:requestId/adjustment-preview",
  serviceRequest.adminAdjustmentPreview
);
router.post(
  "/orders/:orderId/service-requests/:requestId/execute-adjustment",
  serviceRequest.adminExecuteAdjustment
);
router.post(
  "/orders/:orderId/service-requests/:requestId/needs-discussion",
  serviceRequest.adminAdjustmentNeedsDiscussion
);
router.post(
  "/orders/:orderId/service-requests/:requestId/convert-to-cancellation",
  serviceRequest.adminConvertAdjustmentToCancellation
);
router.get(
  "/orders/:orderId/service-requests/:requestId/refund-preview",
  serviceRequest.adminPreviewReturnRefund
);
router.post("/orders/:orderId/service-requests/:requestId/refund", serviceRequest.adminProcessServiceRequestRefund);
router.get(
  "/orders/:orderId/service-requests/:requestId/return-workflow",
  serviceRequest.adminGetReturnWorkflow
);
router.post(
  "/orders/:orderId/service-requests/:requestId/return-shipment",
  serviceRequest.adminUpdateReturnShipment
);
router.post(
  "/orders/:orderId/service-requests/:requestId/return-received",
  serviceRequest.adminMarkReturnReceived
);
router.post(
  "/orders/:orderId/service-requests/:requestId/return-disposition",
  validateBody(
    z.object({
      disposition: z.enum(["RESTOCKABLE", "DAMAGED_NON_RESTOCKABLE", "NEEDS_REVIEW"])
    })
  ),
  serviceRequest.adminSetReturnDisposition
);
router.post(
  "/orders/:orderId/service-requests/:requestId/return-receipt",
  validateBody(
    z.object({
      lines: z
        .array(
          z.object({
            orderItemId: z.string().uuid(),
            qtyReceived: z.number().int().min(0),
            note: z.string().max(500).optional()
          })
        )
        .min(1)
    })
  ),
  serviceRequest.adminRecordReturnReceipt
);
router.post(
  "/orders/:orderId/service-requests/:requestId/return-qc",
  validateBody(
    z.object({
      lines: z
        .array(
          z.object({
            orderItemId: z.string().uuid().optional().nullable(),
            quantity: z.number().int().positive(),
            disposition: z.enum([
              "SELLABLE",
              "DAMAGED",
              "NON_RESTOCKABLE",
              "REPACK",
              "QUARANTINE",
              "WRITE_OFF",
              "RETURN_TO_VENDOR"
            ]),
            note: z.string().max(500).optional(),
            receivedVariantId: z.string().uuid().optional().nullable(),
            receivedSkuSnapshot: z.string().max(120).optional().nullable(),
            isUnexpectedSku: z.boolean().optional(),
            vendorId: z.string().uuid().optional().nullable(),
            vendorNameSnapshot: z.string().max(200).optional().nullable()
          })
        )
        .min(1)
    })
  ),
  serviceRequest.adminPerformReturnQc
);
router.post(
  "/orders/:orderId/service-requests/:requestId/qc-lines/:qcLineId/release-repack",
  serviceRequest.adminReleaseRepack
);
router.get(
  "/orders/:orderId/service-requests/:requestId/economics",
  serviceRequest.adminGetReturnEconomics
);
router.put(
  "/orders/:orderId/service-requests/:requestId/economics",
  serviceRequest.adminUpsertReturnEconomics
);
router.post(
  "/orders/:orderId/service-requests/:requestId/courier-claims",
  validateBody(
    z.object({
      reason: z.string().min(1).max(500),
      claimedAmountPaise: z.number().int().min(0),
      courierName: z.string().max(120).optional(),
      reference: z.string().max(120).optional(),
      notes: z.string().max(2000).optional()
    })
  ),
  serviceRequest.adminOpenCourierClaim
);
router.patch(
  "/courier-claims/:claimId",
  validateBody(
    z.object({
      status: z
        .enum([
          "OPEN",
          "SUBMITTED",
          "PARTIAL_RECOVERED",
          "RECOVERED",
          "REJECTED",
          "CLOSED",
          "WRITTEN_OFF"
        ])
        .optional(),
      recoveredAmountPaise: z.number().int().min(0).optional(),
      reference: z.string().max(120).optional(),
      notes: z.string().max(2000).optional()
    })
  ),
  serviceRequest.adminUpdateCourierClaim
);
router.post(
  "/orders/:orderId/service-requests/:requestId/vendor-claims",
  validateBody(
    z.object({
      reason: z.string().min(1).max(500),
      claimedAmountPaise: z.number().int().min(0),
      vendorId: z.string().uuid().optional(),
      vendorNameSnapshot: z.string().max(200).optional(),
      reference: z.string().max(120).optional(),
      notes: z.string().max(2000).optional()
    })
  ),
  serviceRequest.adminOpenVendorClaim
);
router.patch(
  "/vendor-claims/:claimId",
  validateBody(
    z.object({
      status: z
        .enum([
          "OPEN",
          "SUBMITTED",
          "PARTIAL_RECOVERED",
          "RECOVERED",
          "REJECTED",
          "CLOSED",
          "WRITTEN_OFF"
        ])
        .optional(),
      recoveredAmountPaise: z.number().int().min(0).optional(),
      reference: z.string().max(120).optional(),
      notes: z.string().max(2000).optional()
    })
  ),
  serviceRequest.adminUpdateVendorClaim
);
router.post(
  "/replacement-fulfillments/:fulfillmentId/ship",
  serviceRequest.adminMarkReplacementShipped
);
router.post(
  "/replacement-fulfillments/:fulfillmentId/delivered",
  serviceRequest.adminMarkReplacementDelivered
);
router.get("/return-cases", serviceRequest.adminListReturnCases);
router.get("/return-cases/by-number/:caseNumber", serviceRequest.adminGetReturnCaseByNumber);
router.post(
  "/orders/:orderId/service-requests/:requestId/refund-override",
  serviceRequest.adminSetReturnRefundOverride
);
router.delete(
  "/orders/:orderId/service-requests/:requestId/refund-override",
  serviceRequest.adminClearReturnRefundOverride
);
router.get("/return-policy-config", async (req, res, next) => {
  try {
    void req;
    const { listReturnPolicyConfigs } = await import("../orders/return-policy-config.service");
    const rows = await listReturnPolicyConfigs();
    res.json({ success: true, data: { configs: rows } });
  } catch (err) {
    next(err);
  }
});
router.put(
  "/return-policy-config/:key",
  validateBody(
    z.object({
      valueJson: z.any(),
      description: z.string().max(500).optional()
    })
  ),
  async (req, res, next) => {
    try {
      const admin = req.authUser!;
      const { setReturnPolicyConfig } = await import("../orders/return-policy-config.service");
      const row = await setReturnPolicyConfig({
        key: req.params.key,
        valueJson: (req.body as { valueJson: unknown }).valueJson as never,
        description: (req.body as { description?: string }).description,
        actorUserId: admin.id,
        actorEmail: admin.email
      });
      res.json({ success: true, data: row });
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
        return;
      }
      next(err);
    }
  }
);
router.get("/return-analytics", async (req, res, next) => {
  try {
    const lookbackDays = req.query.lookbackDays
      ? Number(req.query.lookbackDays)
      : undefined;
    const { buildReturnAnalyticsSummary } = await import("../orders/return-analytics.service");
    const data = await buildReturnAnalyticsSummary({ lookbackDays });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
router.get("/return-cases/overdue", async (req, res, next) => {
  try {
    void req;
    const { listOverdueReturnCases } = await import("../orders/return-sla.service");
    const rows = await listOverdueReturnCases();
    res.json({ success: true, data: { rows } });
  } catch (err) {
    next(err);
  }
});
router.get(
  "/orders/:orderId/service-requests/:requestId/sla",
  async (req, res, next) => {
    try {
      const { measureCaseSla } = await import("../orders/return-sla.service");
      const data = await measureCaseSla(req.params.requestId);
      if (!data) {
        res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
        return;
      }
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);
router.post(
  "/orders/:orderId/service-requests/:requestId/high-value-approve",
  validateBody(z.object({ note: z.string().max(1000).optional() })),
  async (req, res, next) => {
    try {
      const admin = req.authUser!;
      const { approveHighValueRefund } = await import("../orders/return-policy-config.service");
      const row = await approveHighValueRefund({
        requestId: req.params.requestId,
        adminEmail: admin.email,
        adminUserId: admin.id,
        note: (req.body as { note?: string }).note
      });
      res.json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);
router.get(
  "/orders/:orderId/service-requests/:requestId/events",
  serviceRequest.adminListCaseEvents
);
router.post(
  "/orders/:orderId/service-requests/:requestId/root-cause",
  validateBody(
    z.object({
      rootCause: z.enum([
        "CUSTOMER",
        "SARVEDA_DISPATCH",
        "SARVEDA_LISTING_CONTENT",
        "PRODUCT_VENDOR_QC",
        "LOGISTICS_COURIER",
        "UNDETERMINED"
      ]),
      rootCauseNote: z.string().optional(),
      responsibleTeam: z
        .enum([
          "DISPATCH",
          "PRODUCT_QC",
          "CONTENT",
          "LOGISTICS",
          "CUSTOMER_CARE",
          "MANAGER",
          "VENDOR",
          "UNASSIGNED"
        ])
        .optional(),
      responsibleUserEmail: z.string().optional(),
      secondaryReasonCode: z.string().optional(),
      secondaryReasonLabel: z.string().optional()
    })
  ),
  serviceRequest.adminSetReturnCaseRootCause
);
router.post(
  "/orders/:orderId/service-requests/:requestId/more-info",
  validateBody(z.object({ prompt: z.string().min(1) })),
  serviceRequest.adminRequestMoreInfo
);
router.post(
  "/orders/:orderId/service-requests/:requestId/missing-part-shipped",
  validateBody(
    z.object({
      accessoryDescription: z.string().min(1),
      courier: z.string().optional(),
      awb: z.string().optional()
    })
  ),
  serviceRequest.adminMarkMissingPartShipped
);
router.get("/orders/:id/refund-preview", admin.orderRefundPreview);
router.get("/orders/:id/rto-workflow", admin.getOrderRtoWorkflow);
router.post("/shipments/:shipmentId/rto/received", admin.markShipmentRtoReceived);
router.post(
  "/shipments/:shipmentId/rto/disposition",
  validateBody(
    z.object({
      disposition: z.enum(["RESTOCKABLE", "DAMAGED_NON_RESTOCKABLE", "NEEDS_REVIEW"])
    })
  ),
  admin.setShipmentRtoDisposition
);
router.post("/shipments/:shipmentId/rto/execute-refund", admin.executeShipmentRtoRefund);
router.post(
  "/orders/:orderId/service-requests/:requestId/supplementary-payment",
  admin.adminCreateSupplementaryPayment
);
router.post("/orders/:id/refund", admin.refundOrder);
router.get("/orders/:id/line-refund-options", admin.orderLineRefundOptions);
router.post(
  "/orders/:id/line-refund",
  validateBody(adminLineRefundBodySchema),
  admin.orderLineRefund
);
router.post(
  "/orders/:id/inventory-restock",
  validateBody(adminInventoryRestockBodySchema),
  admin.restockOrderInventory
);
router.get("/orders/:id/inventory-restocks", admin.listOrderRestocks);
router.post("/orders/:id/cancel", admin.cancelOrder);
router.patch(
  "/orders/:id/status",
  validateBody(z.object({ status: z.nativeEnum(OrderStatus) })),
  admin.patchOrderStatus
);

router.get("/catalog/gaps", productsController.catalogGaps);

router.post("/media/upload", mediaHandlers.uploadAdminMedia);
router.post("/products/seo-suggest", seoSuggest.suggestProductSeo);
router.post("/courses/seo-suggest", seoSuggest.suggestCourseSeo);
router.post("/mentors/seo-suggest", seoSuggest.suggestMentorSeo);

router.get("/inventory", admin.inventoryList);
router.get("/inventory/xl-sheet", admin.inventoryXlSheetList);
router.put(
  "/inventory/xl-sheet",
  validateBody(admin.inventoryXlSheetSaveSchema),
  admin.inventoryXlSheetSave
);
router.get("/inventory/reserved-summary", admin.inventoryReservedSummary);
router.post("/inventory/reconcile-reserved", admin.inventoryReconcileReserved);
router.use("/purchases", purchasesAdminRoutes);
router.use("/accounting", requireAccountingAccess, accountingAdminRoutes);
router.use("/marketplaces", marketplaceAdminRoutes);
router.post(
  "/inventory/bulk",
  validateBody(admin.bulkInventoryPatchSchema),
  admin.bulkPatchInventory
);
router.post(
  "/inventory/import",
  validateBody(admin.inventoryImportSchema),
  admin.importInventoryRows
);
router.patch(
  "/inventory/:variantId",
  validateBody(admin.patchInventorySchema),
  admin.patchInventory
);

const productsAdmin = Router();
productsAdmin.get("/", productsController.adminList);
productsAdmin.get("/xl-sheet", productsController.xlSheetList);
productsAdmin.put("/xl-sheet", productsController.xlSheetSave);
productsAdmin.post("/upload-image", mediaHandlers.uploadAdminMedia);
productsAdmin.post("/check-skus", productsController.checkSkus);
productsAdmin.put(
  "/reorder",
  validateBody(reorderProductsSchema),
  productsController.adminReorder
);
productsAdmin.get("/:id", productsController.adminGetOne);
productsAdmin.post("/", validateBody(createProductSchema), productsController.create);
productsAdmin.put("/:id", validateBody(updateProductSchema), productsController.update);
productsAdmin.delete("/:id", productsController.adminDelete);

router.use("/products", productsAdmin);

router.use("/content/:type", contentRoutes);

export { router as adminRoutes };
