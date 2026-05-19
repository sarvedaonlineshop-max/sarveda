import "./loadEnv";

import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import passport from "passport";

import { getCorsOrigins, isAllowedCorsOrigin } from "./config/corsOrigins";
import { errorHandler } from "./middleware/errorHandler";
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
import { adminRoutes } from "./modules/admin";
import { productsRoutes } from "./modules/products/products.routes";
import { shippingRoutes } from "./modules/shipping";
import { chatRoutes } from "./modules/chat/chat.routes";

configurePassport();

const app = express();

// Vercel and other reverse proxies send X-Forwarded-For; rate limiting needs this.
app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, callback) {
      const allowed = getCorsOrigins();
      if (isAllowedCorsOrigin(origin, allowed)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Sarveda-Cart-Session", "Idempotency-Key"]
  })
);
app.use(helmet());

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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

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

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: { status: "ok" }
  });
});

app.use("/api/auth", authRouter);
app.use("/api/products", productsRoutes);
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
app.use("/api/admin", adminRoutes);

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
