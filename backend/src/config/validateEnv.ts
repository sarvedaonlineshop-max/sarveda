const REQUIRED = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "AWS_SES_SMTP_HOST",
  "AWS_SES_SMTP_USER",
  "AWS_SES_SMTP_PASS",
  "AWS_SES_FROM_EMAIL",
  "ZOHO_CLIENT_ID",
  "ZOHO_CLIENT_SECRET",
  "ZOHO_REFRESH_TOKEN",
  "ZOHO_ORG_ID",
  "SHIPROCKET_EMAIL",
  "SHIPROCKET_PASSWORD",
  "FRONTEND_URL"
];

const OPTIONAL_WARN = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "DELHIVERY_API_KEY",
  "SENTRY_DSN",
  "ENABLE_COD_CHECKOUT",
  "COUPON_CHECKOUT_FEATURED"
];

function envValue(key: string): string | undefined {
  if (key === "ZOHO_ORG_ID") {
    return process.env.ZOHO_ORG_ID?.trim() || process.env.ZOHO_ORGANIZATION_ID?.trim();
  }
  return process.env[key]?.trim();
}

export function validateEnv(): void {
  const missing = REQUIRED.filter((k) => !envValue(k));
  if (missing.length > 0) {
    console.error("[STARTUP] Missing required environment variables:", missing.join(", "));
    console.error("[STARTUP] Server cannot start safely. Exiting.");
    process.exit(1);
  }

  const warned = OPTIONAL_WARN.filter((k) => !process.env[k]?.trim());
  if (warned.length > 0) {
    console.warn(
      "[STARTUP] Optional env vars not set (some features disabled):",
      warned.join(", ")
    );
  }

  console.info("[STARTUP] Environment validation passed.");
}
