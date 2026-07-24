/**
 * Pre-launch env completeness check for EC2/production.
 * Usage (from repo root): npx ts-node backend/scripts/check-env.ts
 * Usage (from backend/):  npx ts-node scripts/check-env.ts
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REQUIRED: Record<string, string[]> = {
  Database: ["DATABASE_URL"],
  Redis: ["REDIS_URL"],
  Auth: [
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL"
  ],
  Razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  Stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  PayPal: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_MODE", "PAYPAL_WEBHOOK_ID"],
  Email: [
    "AWS_SES_SMTP_HOST",
    "AWS_SES_SMTP_USER",
    "AWS_SES_SMTP_PASS",
    "AWS_SES_FROM_EMAIL"
  ],
  Shiprocket: [
    "SHIPROCKET_EMAIL",
    "SHIPROCKET_PASSWORD",
    "SHIPPING_ORIGIN_PINCODE",
    "SHIPROCKET_PICKUP_LOCATION"
  ],
  Zoho: ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORGANIZATION_ID"],
  "GST/Invoice": [
    "SELLER_LEGAL_NAME",
    "SELLER_GSTIN",
    "SELLER_ADDRESS",
    "SELLER_STATE",
    "DEFAULT_HSN_CODE"
  ],
  App: ["FRONTEND_URL", "NODE_ENV", "PORT"]
};

const OPTIONAL: string[] = [
  "DELHIVERY_API_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "SENTRY_DSN",
  "MSG91_AUTH_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_S3_BUCKET_NAME",
  "WATI_API_KEY",
  "EXOTEL_ACCOUNT_SID",
  "EXOTEL_API_KEY",
  "EXOTEL_API_TOKEN",
  "EXOTEL_WHATSAPP_FROM",
  "EXOTEL_API_HOST",
  "ANTHROPIC_API_KEY"
];

console.log("\n=== SARVEDA ENV CHECKLIST ===\n");
let allGood = true;

for (const [group, keys] of Object.entries(REQUIRED)) {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  const icon = missing.length === 0 ? "✅" : "❌";
  console.log(`${icon} ${group}`);
  if (missing.length > 0) {
    allGood = false;
    for (const k of missing) {
      console.log(`   ✗ ${k} — NOT SET`);
    }
  }
}

console.log("\nOptional:");
for (const k of OPTIONAL) {
  const set = !!process.env[k]?.trim();
  console.log(`  ${set ? "✓" : "○"} ${k}`);
}

console.log(`\n${"=".repeat(30)}`);
if (allGood) {
  console.log("✅ All required vars set. Ready to launch!\n");
} else {
  console.log("❌ Fix missing vars before going live.\n");
  process.exit(1);
}
