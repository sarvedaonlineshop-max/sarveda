import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

/** Per-IP create cap — genuine customers rarely hit this; bots do. */
export const enquiryCreateIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many messages from this network. Please try again in a few minutes.",
    code: "RATE_LIMIT"
  }
});

export const enquiryPresignIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many upload requests. Please try again later.",
    code: "RATE_LIMIT"
  }
});

export const enquiryCreateIpLimiterMiddleware: RequestHandler = enquiryCreateIpLimiter;
export const enquiryPresignIpLimiterMiddleware: RequestHandler = enquiryPresignIpLimiter;
