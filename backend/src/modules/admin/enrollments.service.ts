import type { DigitalAccessStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { coursePaymentOrderWhere } from "./live-order-filter";

export type ListEnrollmentsParams = {
  page: number;
  limit: number;
  courseId?: string;
  q?: string;
  status?: DigitalAccessStatus | "ALL";
};

/** Course-only checkout orders. These are hidden from the shop Orders list. */
function coursePaymentListWhere(): Prisma.OrderWhereInput {
  return {
    deletedAt: null,
    AND: [coursePaymentOrderWhere()]
  };
}

export async function listCourseEnrollments(params: ListEnrollmentsParams) {
  const { page, limit, courseId, q } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.OrderWhereInput = coursePaymentListWhere();
  const and: Prisma.OrderWhereInput[] = [];

  if (courseId) {
    and.push({
      OR: [
        { items: { some: { digitalOffer: { is: { courseId } } } } },
        { enrollments: { some: { courseId } } }
      ]
    });
  }

  if (params.status === "ACTIVE") {
    and.push({ enrollments: { some: { status: "ACTIVE" } } });
  } else if (params.status === "CANCELLED") {
    and.push({
      OR: [
        { enrollments: { some: { status: "CANCELLED" } } },
        { enrollments: { none: {} }, status: { in: ["CANCELLED", "REFUNDED"] } }
      ]
    });
  }

  const trimmedQ = q?.trim();
  if (trimmedQ) {
    and.push({
      OR: [
        { email: { contains: trimmedQ, mode: "insensitive" } },
        { phone: { contains: trimmedQ } },
        { orderNumber: { contains: trimmedQ, mode: "insensitive" } },
        { customer: { name: { contains: trimmedQ, mode: "insensitive" } } },
        { customer: { email: { contains: trimmedQ, mode: "insensitive" } } },
        { items: { some: { nameSnapshot: { contains: trimmedQ, mode: "insensitive" } } } },
        { items: { some: { digitalOffer: { is: { course: { title: { contains: trimmedQ, mode: "insensitive" } } } } } } }
      ]
    });
  }

  if (and.length) {
    const base = coursePaymentListWhere();
    where.AND = [...(Array.isArray(base.AND) ? base.AND : []), ...and];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        email: true,
        phone: true,
        status: true,
        paymentStatus: true,
        grandTotalInPaise: true,
        currency: true,
        placedAt: true,
        createdAt: true,
        customer: { select: { id: true, email: true, name: true, phone: true } },
        enrollments: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            createdAt: true,
            course: { select: { id: true, slug: true, title: true } }
          }
        },
        items: {
          take: 1,
          select: {
            nameSnapshot: true,
            digitalOffer: {
              select: { course: { select: { id: true, slug: true, title: true } } }
            }
          }
        }
      }
    })
  ]);

  return {
    items: rows.map((row) => {
      const enrollment = row.enrollments[0] ?? null;
      const course = enrollment?.course ?? row.items[0]?.digitalOffer?.course ?? null;
      const person = row.customer;
      return {
        id: enrollment?.id ?? row.id,
        status: enrollment?.status ?? row.paymentStatus,
        enrolledAt: (enrollment?.createdAt ?? row.placedAt ?? row.createdAt).toISOString(),
        user: {
          id: person?.id ?? row.id,
          email: person?.email ?? row.email,
          name: person?.name ?? null,
          phone: person?.phone ?? row.phone ?? null
        },
        course: {
          id: course?.id ?? "",
          slug: course?.slug ?? "",
          title: course?.title ?? row.items[0]?.nameSnapshot ?? "Course"
        },
        order: {
          id: row.id,
          orderNumber: row.orderNumber,
          grandTotalInPaise: row.grandTotalInPaise,
          currency: row.currency,
          paymentStatus: row.paymentStatus,
          orderStatus: row.status
        }
      };
    }),
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
