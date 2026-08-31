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
router.post("/orders/:orderId/service-requests/:requestId/refund", serviceRequest.adminProcessServiceRequestRefund);
router.post("/orders/:id/refund", admin.refundOrder);
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
