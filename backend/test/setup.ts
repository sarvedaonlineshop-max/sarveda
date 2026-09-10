import fs from "fs";
import path from "path";
import { config as loadDotenv } from "dotenv";
import { beforeAll } from "vitest";

import { assertSafeTestDatabase } from "./helpers/test-db-guard";

const backendRoot = path.resolve(__dirname, "..");
const crmEnvPath = path.join(backendRoot, ".env.crm");
const defaultEnvPath = path.join(backendRoot, ".env");

/**
 * CRM integration tests must use local sarveda_crm_dev via backend/.env.crm.
 * Set SARVEDA_CRM_TEST=1 when running test/crm (see package script / CI).
 */
if (process.env.SARVEDA_CRM_TEST === "1" && fs.existsSync(crmEnvPath)) {
  loadDotenv({ path: crmEnvPath, override: true });
} else {
  loadDotenv({ path: defaultEnvPath });
}

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
  if (process.env.SARVEDA_CRM_TEST === "1") {
    const url = (process.env.DATABASE_URL ?? "").toLowerCase();
    if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
      throw new Error("CRM tests refuse non-localhost DATABASE_URL");
    }
    if (!url.includes("sarveda_crm_dev")) {
      throw new Error("CRM tests require DATABASE_URL database sarveda_crm_dev");
    }
  }
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
