import type { Coupon, CouponType } from "@prisma/client";

import { prisma } from "../../config/db";

export type AppliedCoupon = {
  code: string;
  type: CouponType;
  value: number;
  discountInPaise: number;
};

const PAID_LIKE_STATUSES = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] as const;

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function discountFromCoupon(coupon: Coupon, subtotalInPaise: number): number {
  if (subtotalInPaise < 1) return 0;
  if (subtotalInPaise < coupon.minOrderInPaise) return 0;

  let discount = 0;
  if (coupon.type === "PERCENTAGE") {
    discount = Math.floor((subtotalInPaise * coupon.value) / 100);
  } else {
    discount = coupon.value;
  }
  return Math.min(Math.max(discount, 0), subtotalInPaise);
}

async function countCouponUsesForUser(
  code: string,
  userId: string | null,
  email: string | null
): Promise<number> {
  const emailNorm = email?.trim().toLowerCase();
  const or: Array<{ customerId: string } | { email: string }> = [];
  if (userId) or.push({ customerId: userId });
  if (emailNorm) or.push({ email: emailNorm });
  if (!or.length) return 0;

  return prisma.order.count({
    where: {
      couponCode: code,
      deletedAt: null,
      status: { in: [...PAID_LIKE_STATUSES] },
      OR: or
    }
  });
}

export function couponError(
  message: string,
  code: string,
  statusCode = 400
): Error & { statusCode: number; code: string; userMessage: string } {
  const e = new Error(message) as Error & {
    statusCode: number;
    code: string;
    userMessage: string;
  };
  e.statusCode = statusCode;
  e.code = code;
  e.userMessage = message;
  return e;
}

/** Validate coupon and return discount for a cart subtotal (minor units / paise). */
export async function resolveCartCouponDiscount(
  subtotalInPaise: number,
  couponCode: string | null | undefined,
  opts: { userId?: string | null; email?: string | null }
): Promise<{ discountInPaise: number; coupon: AppliedCoupon | null }> {
  if (!couponCode?.trim()) {
    return { discountInPaise: 0, coupon: null };
  }

  const code = normalizeCode(couponCode);
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon) {
    throw couponError("This coupon code is not valid.", "COUPON_INVALID");
  }

  await assertCouponUsable(coupon, subtotalInPaise, opts.userId ?? null, opts.email ?? null);

  const discountInPaise = discountFromCoupon(coupon, subtotalInPaise);
  return {
    discountInPaise,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountInPaise
    }
  };
}

async function assertCouponUsable(
  coupon: Coupon,
  subtotalInPaise: number,
  userId: string | null,
  email: string | null
): Promise<void> {
  if (!coupon.isActive) {
    throw couponError("This coupon is no longer active.", "COUPON_INACTIVE");
  }

  const now = new Date();
  if (coupon.validFrom && now < coupon.validFrom) {
    throw couponError("This coupon is not valid yet.", "COUPON_NOT_STARTED");
  }
  if (coupon.validUntil && now > coupon.validUntil) {
    throw couponError("This coupon has expired.", "COUPON_EXPIRED");
  }

  if (subtotalInPaise < coupon.minOrderInPaise) {
    const min = (coupon.minOrderInPaise / 100).toLocaleString("en-IN");
    throw couponError(
      `Minimum order value for this coupon is ₹${min}.`,
      "COUPON_MIN_ORDER"
    );
  }

  if (coupon.maxUsageTotal != null && coupon.usageCount >= coupon.maxUsageTotal) {
    throw couponError("This coupon has reached its usage limit.", "COUPON_EXHAUSTED");
  }

  const perUserLimit = coupon.maxUsagePerUser ?? 1;
  if (perUserLimit > 0) {
    const used = await countCouponUsesForUser(coupon.code, userId, email);
    if (used >= perUserLimit) {
      throw couponError("You have already used this coupon.", "COUPON_USER_LIMIT");
    }
  }
}

/** Increment global usage after order is paid. */
export async function incrementCouponUsageForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { couponCode: true }
  });
  if (!order?.couponCode) return;

  await prisma.coupon.updateMany({
    where: { code: order.couponCode },
    data: { usageCount: { increment: 1 } }
  });
}
