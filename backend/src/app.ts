import "./loadEnv";

import { validateEnv } from "./config/validateEnv";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import passport from "passport";

import { getCorsOrigins, isAllowedCorsOrigin } from "./config/corsOrigins";
import { prisma } from "./config/db";
import { getRedisConnection } from "./config/redisConnection";
import { errorHandler } from "./middleware/errorHandler";
import { optionalAuth } from "./middleware/optionalAuth";
import { authRouter, configurePassport } from "./modules/auth";
import { cartRoutes } from "./modules/cart/cart.routes";
import { categoriesRoutes } from "./modules/categories/categories.routes";
import { blogRoutes } from "./modules/blog/blog.routes";
import { coursesRoutes } from "./modules/courses/courses.routes";
import { eventsRoutes } from "./modules/events/events.routes";
import { mentorsRoutes } from "./modules/mentors/mentors.routes";
import { offersRoutes } from "./modules/offers/offers.routes";
import { pagesRoutes } from "./modules/pages/pages.routes";
import { retreatsRoutes } from "./modules/retreats/retreats.routes";
import { vaidyasRoutes } from "./modules/vaidyas/vaidyas.routes";
import { checkoutRoutes } from "./modules/checkout/checkout.routes";
import { ordersRoutes } from "./modules/orders/orders.routes";
import { paymentsJsonRoutes } from "./modules/payments/payments.routes";
import { razorpayWebhookHandler } from "./modules/payments/razorpay.webhook";
import { stripeWebhookHandler } from "./modules/payments/stripe.webhook";
import { paypalWebhookHandler } from "./modules/payments/paypal.webhook";
import { delhiveryWebhookHandler } from "./modules/shipping/delhivery.webhook";
import { shiprocketWebhookHandler } from "./modules/shipping/shiprocket.webhook";
import { whatsappWebhookHandler } from "./modules/whatsapp/whatsapp.webhook";
import { whatsappFlowEndpointHandler } from "./modules/whatsapp/whatsapp-flow.endpoint";
import { adminRoutes } from "./modules/admin";
import { productsRoutes } from "./modules/products/products.routes";
import { merchantRoutes } from "./modules/merchant/merchant.routes";
import { shippingRoutes } from "./modules/shipping";
import { chatRoutes } from "./modules/chat/chat.routes";
import { contactRoutes } from "./modules/contact/contact.routes";
import { newsletterRoutes } from "./modules/newsletter/newsletter.routes";
import { enquiriesRoutes } from "./modules/enquiries/enquiries.routes";
import { complaintsRoutes } from "./modules/complaints/complaints.routes";
import appRouter from "./modules/app/app.routes";
import { testimonialsRoutes } from "./modules/testimonials/testimonials.routes";
import { couponRoutes } from "./modules/coupons/coupon.routes";
import { reviewsRoutes } from "./modules/reviews/reviews.routes";
import { searchRoutes } from "./modules/search/search.routes";
import { zohoRouter } from "./modules/zoho";
import { handleZohoWebhook } from "./modules/zoho/zoho-webhook";

validateEnv();

configurePassport();

const app = express();

// Vercel and other reverse proxies send X-Forwarded-For; rate limiting needs this.
app.set("trust proxy", 1);

app.get("/health", async (_req: Request, res: Response) => {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    const redis = getRedisConnection();
    if (redis) {
      await redis.ping();
      checks.redis = "ok";
    } else {
      checks.redis = "error";
    }
  } catch {
    checks.redis = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
    uptime: Math.floor(process.uptime())
  });
});

const allowedOrigins = [
  ...getCorsOrigins(),
  process.env.FRONTEND_URL_STAGING?.trim().replace(/\/$/, ""),
  "http://localhost:3000",
  "http://localhost:3001"
].filter(Boolean) as string[];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isAllowedCorsOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Sarveda-Cart-Session",
      "Idempotency-Key",
      "X-Razorpay-Signature",
      "Stripe-Signature"
    ]
  })
);
app.use(
  helmet({
    contentSecurityPolicy: false, // Vercel handles CSP
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  })
);

// Webhooks need raw body + must not hit storefront rate limits (registered before rateLimit).
app.post(
  "/api/payments/razorpay/webhook",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: NextFunction) => {
    void razorpayWebhookHandler(req, res).catch(next);
  }
);

app.post(
  "/api/payments/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: NextFunction) => {
    void stripeWebhookHandler(req, res).catch(next);
  }
);

app.post(
  "/api/payments/paypal/webhook",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: NextFunction) => {
    void paypalWebhookHandler(req, res).catch(next);
  }
);

const shiprocketWebhookRaw = express.raw({ type: "application/json" });
const delhiveryWebhookRaw = express.raw({ type: "application/json" });
const shiprocketWebhookRoute = (req: Request, res: Response, next: NextFunction) => {
  void shiprocketWebhookHandler(req, res).catch(next);
};
/** Primary path (code name). */
app.post("/api/shipping/shiprocket/webhook", shiprocketWebhookRaw, shiprocketWebhookRoute);
/**
 * Shiprocket dashboard often rejects URLs containing "shiprocket" / "sr".
 * Use this URL in Settings → Webhooks instead.
 */
app.post("/api/shipping/carrier-events/webhook", shiprocketWebhookRaw, shiprocketWebhookRoute);
app.post("/api/shipping/delhivery/webhook", delhiveryWebhookRaw, (req, res, next) => {
  void delhiveryWebhookHandler(req, res).catch(next);
});

app.post("/api/zoho/webhook", express.json(), (req: Request, res: Response, next: NextFunction) => {
  void handleZohoWebhook(req, res).catch(next);
});

// Exotel WhatsApp inbound messages + delivery receipts (token-authenticated)
app.post("/api/whatsapp/webhook", express.json({ limit: "2mb" }), (req: Request, res: Response, next: NextFunction) => {
  void whatsappWebhookHandler(req, res).catch(next);
});

// Meta WhatsApp Flow data-exchange endpoint (RSA/AES encrypted by Meta).
const whatsappFlowLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.post(
  "/api/whatsapp/flow",
  whatsappFlowLimiter,
  express.json({ limit: "1mb" }),
  (req: Request, res: Response, next: NextFunction) => {
    void whatsappFlowEndpointHandler(req, res).catch(next);
  }
);

// Base64 uploads (images/audio) need headroom; default 1mb causes "request entity too large"
app.use(express.json({ limit: "14mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many checkout attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.authUser?.id ?? req.ip ?? "unknown"
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many payment attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api/checkout", optionalAuth, checkoutLimiter);
app.use("/api/payments/razorpay/verify", paymentLimiter);
app.use("/api/payments/stripe", paymentLimiter);

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    // Storefront + Vercel ISR can burst; 200/15min caused 429 plain-text during builds
    max: process.env.NODE_ENV === "production" ? 800 : 2000,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use("/api/auth", authRouter);
app.use("/api/products", productsRoutes);
app.use("/api/merchant", merchantRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/vaidyas", vaidyasRoutes);
app.use("/api/mentors", mentorsRoutes);
app.use("/api/retreats", retreatsRoutes);
app.use("/api/offers", offersRoutes);
app.use("/api/pages", pagesRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/payments", paymentsJsonRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/enquiries", enquiriesRoutes);
app.use("/api/complaints", complaintsRoutes);
app.use("/api/app", appRouter);
app.use("/api/testimonials", testimonialsRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/zoho", zohoRouter);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  const err = new Error("Route not found") as Error & {
    statusCode?: number;
    code?: string;
  };
  err.statusCode = 404;
  err.code = "NOT_FOUND";
  next(err);
});

app.use(errorHandler);

export { app };
