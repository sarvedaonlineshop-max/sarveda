import { Router } from "express";
import rateLimit from "express-rate-limit";

import { optionalAuth } from "../../middleware/optionalAuth";
import { validateBody } from "../../middleware/validate";

import * as controller from "./chat.controller";
import { chatRequestSchema } from "./chat.schemas";

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many messages. Please wait a few minutes.", code: "RATE_LIMIT" }
});

router.use(chatLimiter);
router.use(optionalAuth);

router.get("/status", controller.status);
router.post("/", validateBody(chatRequestSchema), controller.postMessage);

export { router as chatRoutes };
