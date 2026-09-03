import { vi } from "vitest";

const commerceMocks = vi.hoisted(() => ({
  createZohoInvoiceForOrder: vi.fn().mockResolvedValue(undefined),
  recordZohoPaymentForOrder: vi.fn().mockResolvedValue(undefined),
  createZohoRefundDocumentsForOrder: vi.fn().mockResolvedValue(undefined),
  voidZohoInvoiceForCancelledOrder: vi.fn().mockResolvedValue(undefined),
  ensureOrderInvoicePdf: vi.fn().mockResolvedValue({
    invoiceNo: "INV-TEST-001",
    pdfUrl: "https://example.com/test-invoice.pdf"
  }),
  notifyOrderEmail: vi.fn().mockResolvedValue(undefined),
  createRazorpayOrder: vi.fn().mockImplementation(async () => ({
    id: `order_mock_rzp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  })),
  createStripeCheckoutSession: vi.fn().mockImplementation(async () => ({
    url: `https://checkout.stripe.test/session_${Date.now()}`,
    sessionId: `cs_test_${Date.now()}`
  })),
  createPayPalOrder: vi.fn().mockImplementation(async () => ({
    approvalUrl: `https://paypal.test/approve/${Date.now()}`,
    paypalOrderId: `PAYPAL-${Date.now()}`
  })),
  schedulePaymentTimeout: vi.fn().mockResolvedValue(undefined),
  expireOutstandingStripeSessionsForOrder: vi.fn().mockResolvedValue(undefined),
  expireOpenStripeCheckoutSession: vi.fn().mockResolvedValue({
    expired: false,
    skipped: true,
    reason: "test"
  }),
  mirrorStockToZohoForSkus: vi.fn().mockResolvedValue(undefined),
  sendPushToAdmins: vi.fn().mockResolvedValue(undefined),
  uploadPdf: vi.fn().mockResolvedValue("https://example.com/invoice.pdf"),
  uploadAsset: vi.fn().mockImplementation(async (key: string) => `https://example.com/${key}`),
  buildOrderInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("pdf")),
  // Unique ids per call — a fixed id polluted finalizeGatewayRefund across tests.
  razorpayRefund: vi.fn().mockImplementation(async () => ({
    id: `rfnd_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }))
}));

vi.mock("../../src/modules/zoho", () => ({
  createZohoInvoiceForOrder: commerceMocks.createZohoInvoiceForOrder
}));

vi.mock("../../src/modules/zoho/zoho-financials", () => ({
  recordZohoPaymentForOrder: commerceMocks.recordZohoPaymentForOrder,
  createZohoRefundDocumentsForOrder: commerceMocks.createZohoRefundDocumentsForOrder,
  createZohoPartialCreditNoteForRefund: vi.fn().mockResolvedValue(undefined),
  voidZohoInvoiceForCancelledOrder: commerceMocks.voidZohoInvoiceForCancelledOrder
}));

vi.mock("../../src/modules/zoho/zoho-items", () => ({
  mirrorStockToZohoForSkus: commerceMocks.mirrorStockToZohoForSkus
}));

vi.mock("../../src/modules/invoices/invoice.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/invoices/invoice.service")>();
  return {
    ...actual,
    ensureOrderInvoicePdf: commerceMocks.ensureOrderInvoicePdf
  };
});

vi.mock("../../src/modules/notifications/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/notifications/email")>();
  return {
    ...actual,
    notifyOrderEmail: commerceMocks.notifyOrderEmail,
    sendOrderEmail: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock("../../src/modules/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/payments/razorpay")>();
  return {
    ...actual,
    createOrder: commerceMocks.createRazorpayOrder
  };
});

vi.mock("../../src/modules/payments/stripe.checkout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/payments/stripe.checkout")>();
  return {
    ...actual,
    createStripeCheckoutSession: commerceMocks.createStripeCheckoutSession
  };
});

vi.mock("../../src/modules/payments/paypal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/payments/paypal")>();
  return {
    ...actual,
    createPayPalOrder: commerceMocks.createPayPalOrder
  };
});

vi.mock("../../src/modules/payments/stripe.session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/payments/stripe.session")>();
  return {
    ...actual,
    expireOutstandingStripeSessionsForOrder: commerceMocks.expireOutstandingStripeSessionsForOrder,
    expireOpenStripeCheckoutSession: commerceMocks.expireOpenStripeCheckoutSession
  };
});

vi.mock("../../src/jobs/paymentTimeoutJob", () => ({
  schedulePaymentTimeout: commerceMocks.schedulePaymentTimeout,
  startPaymentTimeoutWorker: vi.fn(),
  PAYMENT_TIMEOUT_QUEUE: "payment-timeout"
}));

vi.mock("../../src/config/firebase", () => ({
  sendPushToAdmins: commerceMocks.sendPushToAdmins
}));

vi.mock("../../src/config/s3", () => ({
  uploadPdf: commerceMocks.uploadPdf,
  uploadAsset: commerceMocks.uploadAsset,
  downloadPdfFromS3: vi.fn(),
  s3KeyFromStoredUrl: vi.fn()
}));

vi.mock("razorpay", () => ({
  default: class MockRazorpay {
    payments = {
      refund: commerceMocks.razorpayRefund
    };
  }
}));

export function getCommerceMocks() {
  return commerceMocks;
}
