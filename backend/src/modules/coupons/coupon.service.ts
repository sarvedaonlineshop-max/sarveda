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

/**
 * Per-customer coupon usage count.
 * - Logged in: bound to account (`customerId` + login email only) — checkout email cannot bypass.
 * - Guest: bound to checkout email only.
 */
async function countCouponUsesForUser(
  code: string,
  userId: string | null,
  email: string | null
): Promise<number> {
  const paidFilter = {
    OR: [{ status: { in: [...PAID_LIKE_STATUSES] } }, { paymentStatus: "CAPTURED" as const }]
  };

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });
    const accountEmail = user?.email?.trim().toLowerCase();
    const identityOr: Array<{ customerId: string } | { email: string }> = [{ customerId: userId }];
    if (accountEmail?.includes("@")) {
      identityOr.push({ email: accountEmail });
    }

    return prisma.order.count({
      where: {
        couponCode: { equals: code, mode: "insensitive" },
        deletedAt: null,
        AND: [paidFilter, { OR: identityOr }]
      }
    });
  }

  const checkoutEmail = email?.trim().toLowerCase();
  if (!checkoutEmail?.includes("@")) return 0;

  return prisma.order.count({
    where: {
      couponCode: { equals: code, mode: "insensitive" },
      deletedAt: null,
      email: checkoutEmail,
      AND: [paidFilter]
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
  if (!userId) {
    throw couponError(
      "Sign in to your Sarveda account to use coupon codes.",
      "COUPON_LOGIN_REQUIRED"
    );
  }

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

export function formatCouponOfferLabel(coupon: Coupon): string {
  if (coupon.type === "PERCENTAGE") {
    return `${coupon.value}% off`;
  }
  const rupees = (coupon.value / 100).toLocaleString("en-IN");
  return `₹${rupees} off`;
}

function featuredCouponCodes(): string[] {
  const raw = process.env.COUPON_CHECKOUT_FEATURED ?? "WELCOME10";
  return raw
    .split(",")
    .map((c) => normalizeCode(c))
    .filter(Boolean);
}

export type CheckoutCouponOffer = {
  code: string;
  label: string;
  type: CouponType;
  value: number;
  /** False when this email/account already used the coupon (paid orders). */
  eligible: boolean;
  ineligibleReason?: string;
};

/** Quick-apply buttons on checkout — codes from COUPON_CHECKOUT_FEATURED env. */
export async function listCheckoutCouponOffers(opts: {
  subtotalInPaise: number;
  userId?: string | null;
  email?: string | null;
}): Promise<CheckoutCouponOffer[]> {
  if (!opts.userId) return [];

  const codes = featuredCouponCodes();
  if (!codes.length) return [];

  const coupons = await prisma.coupon.findMany({
    where: { code: { in: codes }, isActive: true }
  });
  const byCode = new Map(coupons.map((c) => [c.code, c]));

  const offers: CheckoutCouponOffer[] = [];
  for (const code of codes) {
    const coupon = byCode.get(code);
    if (!coupon) continue;

    let eligible = true;
    let ineligibleReason: string | undefined;
    try {
      await assertCouponUsable(coupon, opts.subtotalInPaise, opts.userId ?? null, opts.email ?? null);
    } catch (err) {
      eligible = false;
      ineligibleReason =
        err instanceof Error ? err.message : "This offer is not available for your order.";
    }

    offers.push({
      code: coupon.code,
      label: formatCouponOfferLabel(coupon),
      type: coupon.type,
      value: coupon.value,
      eligible,
      ineligibleReason
    });
  }
  return offers;
}

/** Increment global usage after order is paid (atomic — respects maxUsageTotal). */
export async function incrementCouponUsageForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { couponCode: true }
  });
  if (!order?.couponCode) return;

  await prisma.$executeRaw`
    UPDATE "Coupon"
    SET "usageCount" = "usageCount" + 1
    WHERE code = ${order.couponCode}
    AND (
      "maxUsageTotal" IS NULL
      OR "usageCount" < "maxUsageTotal"
    )
  `;
}
