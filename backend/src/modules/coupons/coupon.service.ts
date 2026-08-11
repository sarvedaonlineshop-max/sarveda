import type { Coupon, CouponType } from "@prisma/client";

import { prisma } from "../../config/db";

export type AppliedCoupon = {
  code: string;
  type: CouponType;
  value: number;
  discountInPaise: number;
};

const PAID_LIKE_STATUSES = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] as const;

/** Orders that consume a one-time coupon for this account (paid, in-flight, or awaiting payment). */
const COUPON_CONSUMING_STATUSES = ["PENDING_PAYMENT", ...PAID_LIKE_STATUSES] as const;

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
 * How many times this account has already used a coupon code.
 * Only `customerId` counts — checkout form email is never used.
 * Includes paid orders and any open checkout with the same code (prevents double apply).
 */
export async function countCouponUsesForAccount(
  code: string,
  customerId: string,
  opts?: { excludeOrderId?: string }
): Promise<number> {
  return prisma.order.count({
    where: {
      customerId,
      deletedAt: null,
      couponCode: { equals: normalizeCode(code), mode: "insensitive" },
      status: { notIn: ["CANCELLED", "REFUNDED"] },
      ...(opts?.excludeOrderId ? { id: { not: opts.excludeOrderId } } : {}),
      OR: [
        { paymentStatus: "CAPTURED" },
        { status: { in: [...COUPON_CONSUMING_STATUSES] } }
      ]
    }
  });
}

export function couponUserMessage(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === "object" &&
    "userMessage" in err &&
    typeof (err as { userMessage: unknown }).userMessage === "string"
  ) {
    return (err as { userMessage: string }).userMessage;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
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

  if (normalizeCode(coupon.code) === "WELCOME10") {
    throw couponError(
      "WELCOME10 is no longer available. Use WELCOME5 for 5% off your first order.",
      "COUPON_INACTIVE"
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
    const used = await countCouponUsesForAccount(coupon.code, userId);
    if (used >= perUserLimit) {
      throw couponError("You have already used this coupon on your account.", "COUPON_USER_LIMIT");
    }
  }
}

/** Hard gate before checkout creates an order with a coupon on the account. */
export async function assertAccountCouponAvailable(
  code: string,
  customerId: string,
  opts?: { excludeOrderId?: string }
): Promise<void> {
  const coupon = await prisma.coupon.findUnique({ where: { code: normalizeCode(code) } });
  if (!coupon) {
    throw couponError("This coupon code is not valid.", "COUPON_INVALID");
  }
  const perUserLimit = coupon.maxUsagePerUser ?? 1;
  if (perUserLimit < 1) return;

  const used = await countCouponUsesForAccount(coupon.code, customerId, opts);
  if (used >= perUserLimit) {
    throw couponError("You have already used this coupon on your account.", "COUPON_USER_LIMIT");
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
  const raw = process.env.COUPON_CHECKOUT_FEATURED ?? "WELCOME5";
  return raw
    .split(",")
    .map((c) => normalizeCode(c))
    .filter((c) => c && c !== "WELCOME10");
}

function pdpCouponCodes(): string[] {
  const raw = process.env.COUPON_PDP_FEATURED ?? process.env.COUPON_CHECKOUT_FEATURED ?? "WELCOME5";
  return raw
    .split(",")
    .map((c) => normalizeCode(c))
    .filter((c) => c && c !== "WELCOME10");
}

function isCouponCurrentlyValid(coupon: Coupon, now = new Date()): boolean {
  if (!coupon.isActive) return false;
  if (coupon.validFrom && now < coupon.validFrom) return false;
  if (coupon.validUntil && now > coupon.validUntil) return false;
  if (coupon.maxUsageTotal != null && coupon.usageCount >= coupon.maxUsageTotal) return false;
  return true;
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

export type PdpCouponOffer = {
  code: string;
  label: string;
  description: string | null;
};

/** Active PDP coupon badges — WELCOME5 preferred; never surfaces WELCOME10. */
export async function listActivePdpCouponOffers(): Promise<PdpCouponOffer[]> {
  const codes = pdpCouponCodes();
  const preferred = codes.length ? codes : ["WELCOME5"];

  const coupons = await prisma.coupon.findMany({
    where: { code: { in: preferred } },
    orderBy: { createdAt: "desc" }
  });
  const byCode = new Map(coupons.map((c) => [c.code, c]));
  const offers: PdpCouponOffer[] = [];

  for (const code of preferred) {
    if (code === "WELCOME10") continue;
    const coupon = byCode.get(code);
    if (coupon && isCouponCurrentlyValid(coupon)) {
      const isWelcome5 = coupon.code === "WELCOME5";
      offers.push({
        code: coupon.code,
        label: isWelcome5 ? "5% offer on your first order" : formatCouponOfferLabel(coupon),
        description: isWelcome5 ? null : coupon.description ?? null
      });
      continue;
    }
    if (code === "WELCOME5") {
      offers.push({
        code: "WELCOME5",
        label: "5% offer on your first order",
        description: null
      });
    }
  }

  if (!offers.length) {
    offers.push({
      code: "WELCOME5",
      label: "5% offer on your first order",
      description: null
    });
  }

  return offers;
}

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
