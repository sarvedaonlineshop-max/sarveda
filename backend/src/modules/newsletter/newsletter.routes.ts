import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { logger } from "../../config/logger";
import { validateBody } from "../../middleware/validate";
import { subscribeNewsletter } from "./newsletter.service";

const router = Router();

const subscribeSchema = z.object({
  email: z.string().email().max(200),
  source: z.string().max(60).optional()
});

const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many subscription attempts. Please try again later.",
    code: "RATE_LIMIT"
  }
});

router.post(
  "/subscribe",
  subscribeLimiter,
  validateBody(subscribeSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof subscribeSchema>;
      const result = await subscribeNewsletter({
        email: body.email,
        source: body.source
      });
      logger.info("newsletter_subscribed", {
        email: body.email.trim().toLowerCase(),
        created: result.created,
        alreadySubscribed: result.alreadySubscribed
      });
      res.json({
        success: true,
        data: {
          ...result,
          message: result.alreadySubscribed
            ? "You're already on our list — thank you."
            : "Welcome to the Sarveda community."
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

export const newsletterRoutes = router;
