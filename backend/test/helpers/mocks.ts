import { vi } from "vitest";

export const mockCreateZohoInvoiceForOrder = vi.fn().mockResolvedValue(undefined);
export const mockRecordZohoPaymentForOrder = vi.fn().mockResolvedValue(undefined);
export const mockCreateZohoRefundDocumentsForOrder = vi.fn().mockResolvedValue(undefined);
export const mockVoidZohoInvoiceForCancelledOrder = vi.fn().mockResolvedValue(undefined);
export const mockEnsureOrderInvoicePdf = vi.fn().mockResolvedValue({
  invoiceNo: "INV-TEST-001",
  pdfUrl: "https://example.com/test-invoice.pdf"
});
export const mockNotifyOrderEmail = vi.fn().mockResolvedValue(undefined);
export const mockCreateRazorpayOrder = vi.fn().mockResolvedValue({ id: "order_mock_rzp_001" });
export const mockSchedulePaymentTimeout = vi.fn().mockResolvedValue(undefined);
export const mockMirrorOrderStockToZoho = vi.fn().mockResolvedValue(undefined);
export const mockMirrorStockToZohoForSkus = vi.fn().mockResolvedValue(undefined);
export const mockSendPushToAdmins = vi.fn().mockResolvedValue(undefined);
export const mockUploadPdf = vi.fn().mockResolvedValue("https://example.com/invoice.pdf");
export const mockBuildOrderInvoicePdf = vi.fn().mockResolvedValue(Buffer.from("pdf"));

export function registerCommerceMocks() {
  vi.mock("../../src/modules/zoho", () => ({
    createZohoInvoiceForOrder: (...args: unknown[]) => mockCreateZohoInvoiceForOrder(...args)
  }));

  vi.mock("../../src/modules/zoho/zoho-financials", () => ({
    recordZohoPaymentForOrder: (...args: unknown[]) => mockRecordZohoPaymentForOrder(...args),
    createZohoRefundDocumentsForOrder: (...args: unknown[]) =>
      mockCreateZohoRefundDocumentsForOrder(...args),
    voidZohoInvoiceForCancelledOrder: (...args: unknown[]) =>
      mockVoidZohoInvoiceForCancelledOrder(...args)
  }));

  vi.mock("../../src/modules/zoho/zoho-items", () => ({
    mirrorStockToZohoForSkus: (...args: unknown[]) => mockMirrorStockToZohoForSkus(...args)
  }));

  vi.mock("../../src/modules/invoices/invoice.service", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/modules/invoices/invoice.service")>();
    return {
      ...actual,
      ensureOrderInvoicePdf: (...args: unknown[]) => mockEnsureOrderInvoicePdf(...args)
    };
  });

  vi.mock("../../src/modules/notifications/email", () => ({
    notifyOrderEmail: (...args: unknown[]) => mockNotifyOrderEmail(...args),
    sendOrderEmail: vi.fn().mockResolvedValue(undefined)
  }));

  vi.mock("../../src/modules/payments/razorpay", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/modules/payments/razorpay")>();
    return {
      ...actual,
      createOrder: (...args: unknown[]) => mockCreateRazorpayOrder(...args)
    };
  });

  vi.mock("../../src/jobs/paymentTimeoutJob", () => ({
    schedulePaymentTimeout: (...args: unknown[]) => mockSchedulePaymentTimeout(...args),
    startPaymentTimeoutWorker: vi.fn(),
    PAYMENT_TIMEOUT_QUEUE: "payment-timeout"
  }));

  vi.mock("../../src/config/firebase", () => ({
    sendPushToAdmins: (...args: unknown[]) => mockSendPushToAdmins(...args)
  }));

  vi.mock("../../src/config/s3", () => ({
    uploadPdf: (...args: unknown[]) => mockUploadPdf(...args),
    downloadPdfFromS3: vi.fn(),
    s3KeyFromStoredUrl: vi.fn()
  }));

  vi.mock("../../src/utils/invoice", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/utils/invoice")>();
    return {
      ...actual,
      buildOrderInvoicePdf: (...args: unknown[]) => mockBuildOrderInvoicePdf(...args)
    };
  });
}

export function resetCommerceMocks() {
  mockCreateZohoInvoiceForOrder.mockClear();
  mockRecordZohoPaymentForOrder.mockClear();
  mockCreateZohoRefundDocumentsForOrder.mockClear();
  mockVoidZohoInvoiceForCancelledOrder.mockClear();
  mockEnsureOrderInvoicePdf.mockClear();
  mockNotifyOrderEmail.mockClear();
  mockCreateRazorpayOrder.mockClear();
  mockSchedulePaymentTimeout.mockClear();
  mockMirrorOrderStockToZoho.mockClear();
  mockMirrorStockToZohoForSkus.mockClear();
  mockSendPushToAdmins.mockClear();
  mockUploadPdf.mockClear();
  mockBuildOrderInvoicePdf.mockClear();
}
