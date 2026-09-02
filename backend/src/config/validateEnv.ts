import { isEmailSmtpConfigured } from "./email";

const REQUIRED = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
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
  return process.env[key]?.trim();
}

export function validateEnv(): void {
  const missing = REQUIRED.filter((k) => !envValue(k));
  if (missing.length > 0) {
    console.error("[STARTUP] Missing required environment variables:", missing.join(", "));
    console.error("[STARTUP] Server cannot start safely. Exiting.");
    process.exit(1);
  }

  if (!isEmailSmtpConfigured()) {
    console.error(
      "[STARTUP] Missing email SMTP config. Set ZEPTOMAIL_SMTP_PASS + ZEPTOMAIL_FROM_EMAIL " +
        "(Zoho ZeptoMail) or AWS_SES_SMTP_HOST/USER/PASS/FROM_EMAIL (SES)."
    );
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
