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
import { checkoutRoutes } from "./modules/checkout/checkout.routes";
import { ordersRoutes } from "./modules/orders/orders.routes";
import { paymentsJsonRoutes } from "./modules/payments/payments.routes";
import { razorpayWebhookHandler } from "./modules/payments/razorpay.webhook";
import { adminRoutes } from "./modules/admin";
import { productsRoutes } from "./modules/products/products.routes";
import { shippingRoutes } from "./modules/shipping";

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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
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
app.use("/api/cart", cartRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/payments", paymentsJsonRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/shipping", shippingRoutes);
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
