import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";
import { requireAdmin } from "../../middleware/admin";
import { requireAuth } from "../../middleware/auth";
import { optionalAuth } from "../../middleware/optionalAuth";

const router = Router();

const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional(),
  body: z.string().max(1000).optional()
});

const PAID_LIKE_STATUSES = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] as const;

router.get("/admin/pending", requireAdmin, async (_req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, slug: true } },
        user: { select: { name: true, email: true } }
      }
    });
    res.json({ reviews });
  } catch (err) {
    next(err);
  }
});

router.patch("/admin/:id/approve", requireAdmin, async (req, res, next) => {
  try {
    await prisma.review.update({
      where: { id: req.params.id },
      data: { isApproved: true }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/admin/:id", requireAdmin, async (req, res, next) => {
  try {
    await prisma.review.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/:productId", optionalAuth, async (req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: {
        productId: req.params.productId,
        isApproved: true
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        isVerified: true,
        createdAt: true,
        user: { select: { name: true } }
      }
    });

    const total = reviews.length;
    const average = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    res.json({ reviews, total, average });
  } catch (err) {
    next(err);
  }
});

router.post("/:productId", requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const { productId } = req.params;

    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true }
    });
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const existing = await prisma.review.findFirst({
      where: { productId, userId }
    });
    if (existing) {
      res.status(409).json({
        error: "You have already reviewed this product."
      });
      return;
    }

    const hasPurchased = await prisma.orderItem.findFirst({
      where: {
        order: {
          customerId: userId,
          deletedAt: null,
          status: { in: [...PAID_LIKE_STATUSES] }
        },
        variant: { productId }
      }
    });

    const data = CreateReviewSchema.parse(req.body);

    const review = await prisma.review.create({
      data: {
        productId,
        userId,
        rating: data.rating,
        title: data.title ?? null,
        body: data.body ?? null,
        isVerified: !!hasPurchased,
        isApproved: false
      }
    });

    res.status(201).json({
      review,
      message: "Thank you! Your review is pending approval."
    });
  } catch (err) {
    next(err);
  }
});

export { router as reviewsRoutes };
