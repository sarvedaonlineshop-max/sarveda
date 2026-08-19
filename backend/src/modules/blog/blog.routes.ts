import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { getPostHandler, listPostsHandler, postSlugsHandler } from "./blog.controller";
import {
  createCommentHandler,
  listCommentsHandler,
  subscribeCommentsHandler
} from "./blog.comments";

export const blogRoutes = Router();

const commentBodySchema = z.object({
  body: z.string().trim().min(2).max(2000)
});

const subscribeSchema = z.object({
  email: z.string().email().max(200)
});

const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many comments. Please try again later.",
    code: "RATE_LIMIT"
  }
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

blogRoutes.get("/", listPostsHandler);
blogRoutes.get("/sitemap/slugs", postSlugsHandler);
blogRoutes.get("/:slug/comments", listCommentsHandler);
blogRoutes.post(
  "/:slug/comments",
  commentLimiter,
  requireAuth,
  validateBody(commentBodySchema),
  createCommentHandler
);
blogRoutes.post(
  "/:slug/comment-subscribe",
  subscribeLimiter,
  validateBody(subscribeSchema),
  subscribeCommentsHandler
);
blogRoutes.get("/:slug", getPostHandler);
