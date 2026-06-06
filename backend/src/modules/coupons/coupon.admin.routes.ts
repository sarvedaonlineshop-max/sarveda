import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";
import { requireAdmin } from "../../middleware/admin";

const router = Router();
router.use(requireAdmin);

const CouponSchema = z.object({
  code: z.string().min(2).max(32).toUpperCase(),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().positive(),
  minOrderInPaise: z.number().min(0).default(0),
  maxUsageTotal: z.number().int().positive().nullable().default(null),
  maxUsagePerUser: z.number().int().positive().default(1),
  validFrom: z.string().nullable().default(null),
  validUntil: z.string().nullable().default(null),
  isActive: z.boolean().default(true),
  description: z.string().max(200).nullable().default(null)
});

router.get("/", async (_req, res, next) => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json({ coupons });
  } catch (err) {
    next(err);
  }
});

router.get("/:code", async (req, res, next) => {
  try {
    const coupon = await prisma.coupon.findUnique({
      where: { code: req.params.code.toUpperCase() }
    });
    if (!coupon) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }
    res.json({ coupon });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = CouponSchema.parse(req.body);
    const existing = await prisma.coupon.findUnique({
      where: { code: data.code }
    });
    if (existing) {
      res.status(409).json({
        error: `Coupon code ${data.code} already exists`
      });
      return;
    }
    const coupon = await prisma.coupon.create({
      data: {
        ...data,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        usageCount: 0
      }
    });
    res.status(201).json({ coupon });
  } catch (err) {
    next(err);
  }
});

router.patch("/:code", async (req, res, next) => {
  try {
    const updates = CouponSchema.partial().parse(req.body);
    const coupon = await prisma.coupon.update({
      where: { code: req.params.code.toUpperCase() },
      data: {
        ...updates,
        validFrom:
          updates.validFrom !== undefined
            ? updates.validFrom
              ? new Date(updates.validFrom)
              : null
            : undefined,
        validUntil:
          updates.validUntil !== undefined
            ? updates.validUntil
              ? new Date(updates.validUntil)
              : null
            : undefined
      }
    });
    res.json({ coupon });
  } catch (err) {
    next(err);
  }
});

router.delete("/:code", async (req, res, next) => {
  try {
    await prisma.coupon.update({
      where: { code: req.params.code.toUpperCase() },
      data: { isActive: false }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as couponAdminRoutes };
