import type { DigitalAccessStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

export type ListEnrollmentsParams = {
  page: number;
  limit: number;
  courseId?: string;
  q?: string;
  status?: DigitalAccessStatus | "ALL";
};

export async function listCourseEnrollments(params: ListEnrollmentsParams) {
  const { page, limit, courseId, q } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.EnrollmentWhereInput = {};

  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }

  if (courseId) {
    where.courseId = courseId;
  }

  const trimmedQ = q?.trim();
  if (trimmedQ) {
    where.OR = [
      { user: { email: { contains: trimmedQ, mode: "insensitive" } } },
      { user: { name: { contains: trimmedQ, mode: "insensitive" } } },
      { user: { phone: { contains: trimmedQ } } },
      { course: { title: { contains: trimmedQ, mode: "insensitive" } } },
      { order: { orderNumber: { contains: trimmedQ, mode: "insensitive" } } }
    ];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, name: true, phone: true }
        },
        course: {
          select: { id: true, slug: true, title: true }
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            grandTotalInPaise: true,
            currency: true,
            paymentStatus: true,
            status: true
          }
        }
      }
    })
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      enrolledAt: row.createdAt.toISOString(),
      user: row.user,
      course: row.course,
      order: row.order
        ? {
            id: row.order.id,
            orderNumber: row.order.orderNumber,
            grandTotalInPaise: row.order.grandTotalInPaise,
            currency: row.order.currency,
            paymentStatus: row.order.paymentStatus,
            orderStatus: row.order.status
          }
        : null
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

/** Course titles for admin filter dropdown (published + draft with enrollments). */
export async function listCoursesForEnrollmentFilter() {
  const courses = await prisma.course.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      _count: { select: { enrollments: true } }
    }
  });
  return courses.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    status: c.status,
    enrollmentCount: c._count.enrollments
  }));
}
