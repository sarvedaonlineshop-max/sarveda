import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";
import { requireAdmin } from "../../middleware/admin";
import { logAdminMutations } from "../../middleware/adminActivity";
import { requireAuth } from "../../middleware/auth";
import { optionalAuth } from "../../middleware/optionalAuth";

const router = Router();

const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional(),
  body: z.string().max(1000).optional(),
  reviewerCountry: z.string().length(2).optional()
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

router.patch("/admin/:id/approve", requireAdmin, logAdminMutations, async (req, res, next) => {
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

router.delete("/admin/:id", requireAdmin, logAdminMutations, async (req, res, next) => {
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
        reviewerCountry: true,
        userId: true,
        user: { select: { name: true } }
      }
    });

    const missingCountryUserIds = Array.from(
      new Set(
        reviews
          .filter((r) => !r.reviewerCountry)
          .map((r) => r.userId)
          .filter(Boolean)
      )
    );

    const countryByUserId = new Map<string, string>();
    if (missingCountryUserIds.length) {
      const [addresses, orderAddresses] = await Promise.all([
        prisma.address.findMany({
          where: { userId: { in: missingCountryUserIds } },
          orderBy: [{ isDefault: "desc" }, { id: "asc" }],
          select: { userId: true, country: true }
        }),
        prisma.orderAddress.findMany({
          where: {
            type: "SHIPPING",
            order: {
              customerId: { in: missingCountryUserIds },
              deletedAt: null
            }
          },
          orderBy: { order: { createdAt: "desc" } },
          select: { country: true, order: { select: { customerId: true } } }
        })
      ]);

      for (const addr of addresses) {
        const code = addr.country?.trim().toUpperCase();
        if (code?.length === 2 && !countryByUserId.has(addr.userId)) {
          countryByUserId.set(addr.userId, code);
        }
      }
      for (const row of orderAddresses) {
        const userId = row.order.customerId;
        if (!userId || countryByUserId.has(userId)) continue;
        const code = row.country?.trim().toUpperCase();
        if (code?.length === 2) countryByUserId.set(userId, code);
      }
    }

    const enriched = reviews.map(({ userId, ...r }) => ({
      ...r,
      reviewerCountry:
        r.reviewerCountry?.toUpperCase() ||
        (userId ? countryByUserId.get(userId) ?? null : null) ||
        "IN"
    }));

    const total = enriched.length;
    const average = total > 0 ? enriched.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    res.json({ reviews: enriched, total, average });
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
        reviewerCountry: data.reviewerCountry?.toUpperCase() ?? null,
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
