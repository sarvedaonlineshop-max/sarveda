import path from "path";
import { config as loadDotenv } from "dotenv";
import { beforeAll } from "vitest";

import { assertSafeTestDatabase } from "./helpers/test-db-guard";

const backendRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(backendRoot, ".env") });

process.env.NODE_ENV = "test";
process.env.SARVEDA_TEST_DATABASE = process.env.SARVEDA_TEST_DATABASE ?? "1";
process.env.NATIVE_ACCOUNTING_ENABLED = "0";
process.env.ACCOUNTING_SALES_POSTING_ENABLED = "0";
process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "0";
process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "0";
process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "0";
process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "0";
process.env.ACCOUNTING_REPORTS_ENABLED = "0";
process.env.INDIA_REQUIRE_SHIPROCKET_SERVICEABILITY = "0";
process.env.SHIPPING_DISABLE_STUBS = "1";
process.env.ENABLE_COD_CHECKOUT = "1";
process.env.AUTO_START_FULFILLMENT_ON_PAID = "0";

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.trim() && !process.env.TEST_DATABASE_URL?.trim()) {
    process.env.DATABASE_URL =
      "postgresql://sarveda:password@localhost:5432/sarveda_db?schema=public";
  }
  assertSafeTestDatabase();
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = "test-jwt-secret-minimum-32-characters-long";
  }
  if (!process.env.RAZORPAY_KEY_ID?.trim()) {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  }
  if (!process.env.RAZORPAY_KEY_SECRET?.trim()) {
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_for_commerce_tests";
  }
});
