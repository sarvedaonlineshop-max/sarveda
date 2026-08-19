import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

const commentBodySchema = z.object({
  body: z.string().trim().min(2).max(2000)
});

const subscribeSchema = z.object({
  email: z.string().email().max(200)
});

async function resolvePublishedPostId(slug: string): Promise<string | null> {
  const post = await prisma.blogPost.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true }
  });
  return post?.id ?? null;
}

export async function listCommentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    if (!slug) {
      res.status(400).json({ success: false, error: "slug required", code: "BAD_REQUEST" });
      return;
    }
    const postId = await resolvePublishedPostId(slug);
    if (!postId) {
      res.status(404).json({ success: false, error: "Post not found", code: "NOT_FOUND" });
      return;
    }
    const rows = await prisma.blogComment.findMany({
      where: { postId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { name: true, email: true } }
      }
    });
    const comments = rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      authorName: row.user.name?.trim() || row.user.email.split("@")[0] || "Sarveda member"
    }));
    res.json({ success: true, data: { comments, count: comments.length } });
  } catch (err) {
    next(err);
  }
}

export async function createCommentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    const userId = req.authUser?.id;
    if (!slug || !userId) {
      res.status(401).json({ success: false, error: "Please login to comment", code: "UNAUTHORIZED" });
      return;
    }
    const postId = await resolvePublishedPostId(slug);
    if (!postId) {
      res.status(404).json({ success: false, error: "Post not found", code: "NOT_FOUND" });
      return;
    }
    const body = commentBodySchema.parse(req.body);
    const created = await prisma.blogComment.create({
      data: { postId, userId, body: body.body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { name: true, email: true } }
      }
    });
    logger.info("blog_comment_created", { slug, userId, commentId: created.id });
    res.status(201).json({
      success: true,
      data: {
        comment: {
          id: created.id,
          body: created.body,
          createdAt: created.createdAt.toISOString(),
          authorName: created.user.name?.trim() || created.user.email.split("@")[0] || "Sarveda member"
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function subscribeCommentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    if (!slug) {
      res.status(400).json({ success: false, error: "slug required", code: "BAD_REQUEST" });
      return;
    }
    const postId = await resolvePublishedPostId(slug);
    if (!postId) {
      res.status(404).json({ success: false, error: "Post not found", code: "NOT_FOUND" });
      return;
    }
    const { email } = subscribeSchema.parse(req.body);
    const normalized = email.trim().toLowerCase();
    const existing = await prisma.blogCommentSubscription.findUnique({
      where: { postId_email: { postId, email: normalized } }
    });
    if (!existing) {
      await prisma.blogCommentSubscription.create({
        data: { postId, email: normalized }
      });
    }
    logger.info("blog_comment_subscribed", { slug, email: normalized, created: !existing });
    res.json({
      success: true,
      data: {
        alreadySubscribed: Boolean(existing),
        message: existing
          ? "You're already subscribed to updates on this insight."
          : "Thanks — we'll notify you of new comments on this insight."
      }
    });
  } catch (err) {
    next(err);
  }
}
