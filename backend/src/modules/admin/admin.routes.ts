import { OrderStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { requireAdmin } from "../../middleware/admin";
import { logAdminMutations, requireSuperAdmin } from "../../middleware/adminActivity";
import { validateBody } from "../../middleware/validate";
import * as productsController from "../products/products.controller";
import { createProductSchema, reorderProductsSchema, updateProductSchema } from "../products/schemas";

import * as admin from "./admin.handlers";
import * as activity from "./activity.handlers";
import * as enrollments from "./enrollments.handlers";
import * as reports from "./reports.handlers";
import {
  orderAddressPatchSchema,
  orderItemWarehousesSchema,
  orderPreferredCourierSchema
} from "./admin.handlers";
import * as pickupLocations from "./pickupLocations.handlers";
import { createPickupLocationSchema, updatePickupLocationSchema } from "./pickupLocations.handlers";
import { contentRoutes } from "./content/content.routes";
import * as mediaHandlers from "./media.handlers";
import * as seoSuggest from "./seo-suggest.handlers";
import { couponAdminRoutes } from "../coupons/coupon.admin.routes";
import { enquiriesAdminRoutes } from "../enquiries/enquiries.admin.routes";
import { marketplaceAdminRoutes } from "../marketplaces/marketplaces.routes";
import * as serviceRequest from "../orders/order-service-request.controller";

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
router.get("/orders/export/pdf", admin.ordersExportPdf);
router.get("/orders/service-requests/pending-count", serviceRequest.adminPendingServiceRequestCount);
router.get("/orders/:orderId/service-requests/photos/:photoId/view", serviceRequest.adminViewServiceRequestPhoto);
router.get("/orders/:orderId/service-requests/photos/:photoId/download", serviceRequest.adminDownloadServiceRequestPhoto);
router.get("/orders", admin.ordersList);
router.get("/orders/:id/invoice/download", admin.downloadOrderInvoice);
router.get("/orders/:id/invoice", admin.orderInvoice);
router.post("/orders/:id/invoice/regenerate", admin.regenerateOrderInvoice);
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
