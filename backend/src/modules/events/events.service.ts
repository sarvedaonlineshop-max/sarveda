import type { CourseEnrollmentMode, EventStatus } from "@prisma/client";

import { prisma } from "../../config/db";

export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  imageUrl: string | null;
  startDate: string;
  endDate: string | null;
  venue: string | null;
  isOnline: boolean;
  priceInPaise: number;
  enrollmentMode: CourseEnrollmentMode;
  checkoutVariantId: string | null;
  extra: unknown;
};

export type EventDetail = EventListItem & {
  description: string | null;
  zoomLink: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  extra: unknown;
};

export async function listPublishedEvents(): Promise<EventListItem[]> {
  const rows = await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      imageUrl: true,
      startDate: true,
      endDate: true,
      venue: true,
      isOnline: true,
      priceInPaise: true,
      enrollmentMode: true,
      checkoutVariantId: true,
      extra: true
    }
  });
  return rows.map((r) => ({
    ...r,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate?.toISOString() ?? null
  }));
}

export async function getEventBySlug(slug: string): Promise<EventDetail | null> {
  const row = await prisma.event.findFirst({
    where: { slug, status: "PUBLISHED" as EventStatus },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      description: true,
      imageUrl: true,
      startDate: true,
      endDate: true,
      venue: true,
      isOnline: true,
      zoomLink: true,
      priceInPaise: true,
      enrollmentMode: true,
      checkoutVariantId: true,
      seoTitle: true,
      seoDescription: true,
      extra: true
    }
  });
  if (!row) return null;
  return {
    ...row,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate?.toISOString() ?? null
  };
}

export async function listEventSlugs(): Promise<string[]> {
  const rows = await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
    orderBy: { slug: "asc" }
  });
  return rows.map((r) => r.slug);
}
