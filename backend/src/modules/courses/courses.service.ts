import type { CourseEnrollmentMode, CourseStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

export type CourseListItem = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  imageUrl: string | null;
  priceInPaise: number;
  priceUsdCents: number | null;
  isFree: boolean;
  enrollmentMode: CourseEnrollmentMode;
  checkoutVariantId: string | null;
  extra: Prisma.JsonValue | null;
};

export type CourseDetail = CourseListItem & {
  description: string | null;
  videoUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  extra: Prisma.JsonValue | null;
};

export async function listPublishedCourses(): Promise<CourseListItem[]> {
  const rows = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { title: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      imageUrl: true,
      priceInPaise: true,
      priceUsdCents: true,
      isFree: true,
      enrollmentMode: true,
      checkoutVariantId: true,
      extra: true
    }
  });
  return rows;
}

export async function getCourseBySlug(slug: string): Promise<CourseDetail | null> {
  const row = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" as CourseStatus },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      description: true,
      imageUrl: true,
      videoUrl: true,
      priceInPaise: true,
      priceUsdCents: true,
      isFree: true,
      enrollmentMode: true,
      checkoutVariantId: true,
      seoTitle: true,
      seoDescription: true,
      extra: true
    }
  });
  return row;
}

export async function listCourseSlugs(): Promise<string[]> {
  const rows = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
    orderBy: { slug: "asc" }
  });
  return rows.map((r) => r.slug);
}

/** JIT materialize Cart/Order stub for paid course checkout (not shop catalog). */
export async function prepareCourseCheckoutVariant(
  slug: string
): Promise<{ variantId: string; sku: string } | null> {
  const course = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      imageUrl: true,
      priceInPaise: true,
      priceUsdCents: true,
      isFree: true,
      enrollmentMode: true
    }
  });
  if (!course) return null;
  if (course.isFree || course.enrollmentMode === "ENQUIRY" || course.priceInPaise <= 0) {
    return null;
  }

  const { materializeDigitalCheckoutVariant } = await import("../../utils/digital-checkout-offer");
  const { variantId, sku } = await materializeDigitalCheckoutVariant(prisma, {
    kind: "COURSE",
    entitySlug: course.slug,
    courseId: course.id,
    title: course.title,
    priceInPaise: course.priceInPaise,
    priceUsdCents: course.priceUsdCents,
    imageUrl: course.imageUrl,
    skuPrefix: "COURSE"
  });
  await prisma.course.update({
    where: { id: course.id },
    data: { checkoutVariantId: variantId }
  });
  return { variantId, sku };
}
