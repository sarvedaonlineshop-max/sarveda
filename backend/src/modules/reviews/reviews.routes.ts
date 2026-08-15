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

function normalizeCountryCode(raw?: string | null): string | null {
  const code = raw?.trim().toUpperCase();
  if (!code) return null;
  if (code === "UK") return "GB";
  if (code === "OTHER") return null;
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Longest unique dial prefixes. Skip +1 (US/CA/Caribbean). */
const PHONE_PREFIX_TO_COUNTRY: Array<[string, string]> = [
  ["+971", "AE"],
  ["+852", "HK"],
  ["+353", "IE"],
  ["+351", "PT"],
  ["+44", "GB"],
  ["+91", "IN"],
  ["+61", "AU"],
  ["+64", "NZ"],
  ["+65", "SG"],
  ["+81", "JP"],
  ["+82", "KR"],
  ["+86", "CN"],
  ["+49", "DE"],
  ["+33", "FR"],
  ["+39", "IT"],
  ["+34", "ES"],
  ["+31", "NL"],
  ["+32", "BE"],
  ["+41", "CH"],
  ["+46", "SE"],
  ["+47", "NO"],
  ["+45", "DK"],
  ["+48", "PL"],
  ["+43", "AT"],
  ["+27", "ZA"],
  ["+55", "BR"],
  ["+52", "MX"],
  ["+20", "EG"],
  ["+90", "TR"],
  ["+66", "TH"],
  ["+60", "MY"],
  ["+62", "ID"],
  ["+63", "PH"],
  ["+84", "VN"],
  ["+92", "PK"],
  ["+94", "LK"],
  ["+977", "NP"],
  ["+880", "BD"],
  ["+966", "SA"],
  ["+974", "QA"],
  ["+973", "BH"],
  ["+968", "OM"],
  ["+965", "KW"]
];

function countryFromPhone(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const compact = raw.replace(/[^\d+]/g, "");
  if (!compact) return null;
  const withPlus = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : compact.startsWith("+")
      ? compact
      : `+${compact}`;
  const sorted = [...PHONE_PREFIX_TO_COUNTRY].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, country] of sorted) {
    if (withPlus.startsWith(prefix)) return country;
  }
  return null;
}

function rememberCountry(map: Map<string, string>, userId: string | null | undefined, raw?: string | null) {
  if (!userId || map.has(userId)) return;
  const code = normalizeCountryCode(raw) ?? countryFromPhone(raw);
  if (code) map.set(userId, code);
}

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
        user: { select: { name: true, phone: true, email: true } }
      }
    });

    const missingCountryUserIds = Array.from(
      new Set(
        reviews
          .filter((r) => !normalizeCountryCode(r.reviewerCountry))
          .map((r) => r.userId)
          .filter(Boolean)
      )
    );

    const countryByUserId = new Map<string, string>();
    if (missingCountryUserIds.length) {
      const emails = Array.from(
        new Set(
          reviews
            .filter((r) => r.userId && missingCountryUserIds.includes(r.userId))
            .map((r) => r.user?.email?.trim().toLowerCase())
            .filter((email): email is string => Boolean(email && email.includes("@")))
        )
      );

      const [addresses, orderAddresses, orders] = await Promise.all([
        prisma.address.findMany({
          where: { userId: { in: missingCountryUserIds } },
          orderBy: [{ isDefault: "desc" }, { id: "asc" }],
          select: { userId: true, country: true, phone: true }
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
          select: {
            country: true,
            phone: true,
            order: { select: { customerId: true, phone: true, ipCountry: true, shippingZone: true } }
          }
        }),
        emails.length
          ? prisma.order.findMany({
              where: {
                deletedAt: null,
                OR: [{ customerId: { in: missingCountryUserIds } }, { email: { in: emails } }]
              },
              orderBy: { createdAt: "desc" },
              select: {
                customerId: true,
                email: true,
                phone: true,
                ipCountry: true,
                shippingZone: true,
                addresses: { where: { type: "SHIPPING" }, select: { country: true, phone: true }, take: 1 }
              }
            })
          : prisma.order.findMany({
              where: { customerId: { in: missingCountryUserIds }, deletedAt: null },
              orderBy: { createdAt: "desc" },
              select: {
                customerId: true,
                email: true,
                phone: true,
                ipCountry: true,
                shippingZone: true,
                addresses: { where: { type: "SHIPPING" }, select: { country: true, phone: true }, take: 1 }
              }
            })
      ]);

      const emailToUserId = new Map<string, string>();
      for (const r of reviews) {
        const email = r.user?.email?.trim().toLowerCase();
        if (r.userId && email) emailToUserId.set(email, r.userId);
      }

      // 1) Latest shipping country, 2) order IP / zone, 3) phones, 4) saved address.
      for (const row of orderAddresses) {
        rememberCountry(countryByUserId, row.order.customerId, row.country);
        rememberCountry(countryByUserId, row.order.customerId, row.order.ipCountry);
        rememberCountry(countryByUserId, row.order.customerId, row.order.shippingZone);
        rememberCountry(countryByUserId, row.order.customerId, row.phone);
        rememberCountry(countryByUserId, row.order.customerId, row.order.phone);
      }
      for (const order of orders) {
        const userId = order.customerId || emailToUserId.get(order.email.trim().toLowerCase());
        rememberCountry(countryByUserId, userId, order.addresses[0]?.country);
        rememberCountry(countryByUserId, userId, order.ipCountry);
        rememberCountry(countryByUserId, userId, order.shippingZone);
        rememberCountry(countryByUserId, userId, order.addresses[0]?.phone);
        rememberCountry(countryByUserId, userId, order.phone);
      }
      for (const addr of addresses) {
        rememberCountry(countryByUserId, addr.userId, addr.country);
        rememberCountry(countryByUserId, addr.userId, addr.phone);
      }
      for (const r of reviews) {
        rememberCountry(countryByUserId, r.userId, r.user?.phone);
      }
    }

    const enriched = reviews.map(({ userId, user, ...r }) => ({
      ...r,
      user: user ? { name: user.name } : null,
      reviewerCountry:
        normalizeCountryCode(r.reviewerCountry) ||
        (userId ? countryByUserId.get(userId) ?? null : null)
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
