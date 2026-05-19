import type { CourseStatus, EventStatus, PostStatus, Prisma } from "@prisma/client";

import { prisma } from "../../../config/db";
import { slugify } from "../../../utils/slugify";
import type {
  ContentCreateBody,
  ContentListResult,
  ContentListRow,
  ContentType,
  ContentUpdateBody
} from "./content.types";

function httpError(message: string, status = 400, code = "REQUEST_ERROR") {
  const e = new Error(message) as Error & { statusCode: number; code: string };
  e.statusCode = status;
  e.code = code;
  return e;
}

function pickTitle(body: ContentCreateBody, fallback = "Untitled") {
  return (body.title ?? body.name ?? body.authorName ?? fallback).trim() || fallback;
}

async function uniqueSlug(base: string, type: ContentType, excludeId?: string) {
  let candidate = slugify(base);
  let n = 0;
  for (;;) {
    const slug = n === 0 ? candidate : `${candidate}-${n}`;
    const exists = await slugExists(type, slug, excludeId);
    if (!exists) return slug;
    n += 1;
  }
}

async function slugExists(type: ContentType, slug: string, excludeId?: string): Promise<boolean> {
  const where = { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) };
  switch (type) {
    case "pages":
      return !!(await prisma.cmsPage.findFirst({ where, select: { id: true } }));
    case "courses":
      return !!(await prisma.course.findFirst({ where, select: { id: true } }));
    case "events":
      return !!(await prisma.event.findFirst({ where, select: { id: true } }));
    case "blog":
      return !!(await prisma.blogPost.findFirst({ where, select: { id: true } }));
    case "vaidyas":
      return !!(await prisma.vaidya.findFirst({ where, select: { id: true } }));
    case "mentors":
      return !!(await prisma.mentor.findFirst({ where, select: { id: true } }));
    case "retreats":
      return !!(await prisma.retreat.findFirst({ where, select: { id: true } }));
    case "offers":
      return !!(await prisma.offer.findFirst({ where, select: { id: true } }));
    case "testimonials":
      return !!(await prisma.testimonial.findFirst({ where, select: { id: true } }));
    default:
      return false;
  }
}

function normalizePostStatus(raw?: string): PostStatus {
  if (raw === "PUBLISHED" || raw === "ARCHIVED") return raw;
  return "DRAFT";
}

function normalizeCourseStatus(raw?: string): CourseStatus {
  if (raw === "PUBLISHED" || raw === "ARCHIVED") return raw;
  return "DRAFT";
}

function normalizeEventStatus(raw?: string): EventStatus {
  if (raw === "PUBLISHED" || raw === "CANCELLED") return raw;
  return "DRAFT";
}

function statusFromPost(s: PostStatus) {
  return s;
}

function statusFromBool(active: boolean, label: "ACTIVE" | "PUBLISHED" = "ACTIVE") {
  return active ? label : "DRAFT";
}

function toListRow(
  type: ContentType,
  row: {
    id: string;
    slug: string;
    updatedAt: Date;
    title?: string;
    name?: string;
    authorName?: string;
    status?: PostStatus | CourseStatus | EventStatus;
    isActive?: boolean;
    isPublished?: boolean;
  }
): ContentListRow {
  const title = row.title ?? row.name ?? row.authorName ?? "—";
  let status = "DRAFT";
  if (row.status !== undefined) status = row.status;
  else if (row.isActive !== undefined) status = statusFromBool(row.isActive);
  else if (row.isPublished !== undefined) status = statusFromBool(row.isPublished, "PUBLISHED");

  return {
    id: row.id,
    slug: row.slug,
    title,
    status,
    updatedAt: row.updatedAt.toISOString()
  };
}

function titleSearch(q: string) {
  return { title: { contains: q, mode: "insensitive" as const } };
}

function nameSearch(q: string) {
  return { name: { contains: q, mode: "insensitive" as const } };
}

function authorSearch(q: string) {
  return { authorName: { contains: q, mode: "insensitive" as const } };
}

export async function listContent(
  type: ContentType,
  opts: { page?: number; limit?: number; q?: string }
): Promise<ContentListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 24));
  const skip = (page - 1) * limit;
  const q = opts.q?.trim();

  switch (type) {
    case "pages": {
      const where = q ? titleSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.cmsPage.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, title: true, status: true, updatedAt: true }
        }),
        prisma.cmsPage.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    case "courses": {
      const where = q ? titleSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.course.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, title: true, status: true, updatedAt: true }
        }),
        prisma.course.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    case "events": {
      const where = q ? titleSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.event.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, title: true, status: true, updatedAt: true }
        }),
        prisma.event.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    case "blog": {
      const where = q ? titleSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.blogPost.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, title: true, status: true, updatedAt: true }
        }),
        prisma.blogPost.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    case "vaidyas": {
      const where = q ? nameSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.vaidya.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, name: true, isActive: true, updatedAt: true }
        }),
        prisma.vaidya.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    case "mentors": {
      const where = q ? nameSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.mentor.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, name: true, isActive: true, updatedAt: true }
        }),
        prisma.mentor.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    case "retreats": {
      const where = q ? titleSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.retreat.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, title: true, isActive: true, updatedAt: true }
        }),
        prisma.retreat.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    case "offers": {
      const where = q ? titleSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.offer.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, title: true, isActive: true, updatedAt: true }
        }),
        prisma.offer.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    case "testimonials": {
      const where = q ? authorSearch(q) : {};
      const [items, total] = await Promise.all([
        prisma.testimonial.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          select: { id: true, slug: true, authorName: true, isPublished: true, updatedAt: true }
        }),
        prisma.testimonial.count({ where })
      ]);
      return {
        items: items.map((r) => toListRow(type, r)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    }
    default:
      throw httpError("Unknown content type", 404);
  }
}

export async function getContent(type: ContentType, id: string) {
  switch (type) {
    case "pages": {
      const item = await prisma.cmsPage.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return { item: { ...item, status: statusFromPost(item.status) } };
    }
    case "courses": {
      const item = await prisma.course.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return { item };
    }
    case "events": {
      const item = await prisma.event.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return { item };
    }
    case "blog": {
      const item = await prisma.blogPost.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return { item: { ...item, status: statusFromPost(item.status) } };
    }
    case "vaidyas": {
      const item = await prisma.vaidya.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "mentors": {
      const item = await prisma.mentor.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "retreats": {
      const item = await prisma.retreat.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "offers": {
      const item = await prisma.offer.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "testimonials": {
      const item = await prisma.testimonial.findUnique({ where: { id } });
      if (!item) throw httpError("Not found", 404);
      return {
        item: {
          ...item,
          title: item.authorName,
          status: statusFromBool(item.isPublished, "PUBLISHED")
        }
      };
    }
    default:
      throw httpError("Unknown content type", 404);
  }
}

export async function createContent(type: ContentType, body: ContentCreateBody) {
  const title = pickTitle(body);
  const slug = body.slug?.trim()
    ? await uniqueSlug(body.slug.trim(), type)
    : await uniqueSlug(title, type);

  switch (type) {
    case "pages": {
      const item = await prisma.cmsPage.create({
        data: {
          title,
          slug,
          content: body.content ?? null,
          status: normalizePostStatus(body.status),
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null
        }
      });
      return { item };
    }
    case "courses": {
      const item = await prisma.course.create({
        data: {
          title,
          slug,
          description: body.description ?? body.content ?? null,
          status: normalizeCourseStatus(body.status),
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null
        }
      });
      return { item };
    }
    case "events": {
      const startDate = body.startDate ? new Date(body.startDate) : new Date();
      if (Number.isNaN(startDate.getTime())) throw httpError("Invalid startDate");
      const item = await prisma.event.create({
        data: {
          title,
          slug,
          description: body.description ?? body.content ?? null,
          startDate,
          status: normalizeEventStatus(body.status),
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null
        }
      });
      return { item };
    }
    case "blog": {
      const item = await prisma.blogPost.create({
        data: {
          title,
          slug,
          content: body.content ?? "",
          excerpt: body.description ?? null,
          status: normalizePostStatus(body.status),
          publishedAt: body.status === "PUBLISHED" ? new Date() : null,
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null,
          seoKeyword: body.seoKeyword ?? null
        }
      });
      return { item };
    }
    case "vaidyas": {
      const name = (body.name ?? body.title ?? title).trim();
      const item = await prisma.vaidya.create({
        data: {
          name,
          slug,
          bio: body.bio ?? body.content ?? null,
          isActive: body.status !== "DRAFT" && body.status !== "ARCHIVED",
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null
        }
      });
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "mentors": {
      const name = (body.name ?? body.title ?? title).trim();
      const item = await prisma.mentor.create({
        data: {
          name,
          slug,
          bio: body.bio ?? body.content ?? null,
          isActive: body.status !== "DRAFT" && body.status !== "ARCHIVED",
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null
        }
      });
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "retreats": {
      const item = await prisma.retreat.create({
        data: {
          title,
          slug,
          description: body.description ?? body.content ?? null,
          isActive: body.status !== "DRAFT" && body.status !== "ARCHIVED",
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null
        }
      });
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "offers": {
      const item = await prisma.offer.create({
        data: {
          title,
          slug,
          description: body.description ?? body.content ?? null,
          isActive: body.status !== "DRAFT" && body.status !== "ARCHIVED",
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null
        }
      });
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "testimonials": {
      const authorName = (body.authorName ?? body.title ?? title).trim();
      const isPublished =
        body.status === "PUBLISHED" || body.status === "ACTIVE";
      const item = await prisma.testimonial.create({
        data: {
          authorName,
          slug,
          body: body.body ?? body.content ?? null,
          isPublished
        }
      });
      return {
        item: {
          ...item,
          title: item.authorName,
          status: statusFromBool(item.isPublished, "PUBLISHED")
        }
      };
    }
    default:
      throw httpError("Unknown content type", 404);
  }
}

export async function updateContent(type: ContentType, id: string, body: ContentUpdateBody) {
  const existing = await getContent(type, id);
  const raw = existing.item as Record<string, unknown>;

  switch (type) {
    case "pages": {
      const title = body.title ?? (raw.title as string);
      const slug = body.slug
        ? await uniqueSlug(body.slug, type, id)
        : (raw.slug as string);
      const item = await prisma.cmsPage.update({
        where: { id },
        data: {
          title,
          slug,
          content: body.content !== undefined ? body.content : (raw.content as string | null),
          status: body.status ? normalizePostStatus(body.status) : (raw.status as PostStatus),
          seoTitle: body.seoTitle !== undefined ? body.seoTitle : (raw.seoTitle as string | null),
          seoDescription:
            body.seoDescription !== undefined
              ? body.seoDescription
              : (raw.seoDescription as string | null)
        }
      });
      return { item };
    }
    case "courses": {
      const title = body.title ?? (raw.title as string);
      const slug = body.slug ? await uniqueSlug(body.slug, type, id) : (raw.slug as string);
      const item = await prisma.course.update({
        where: { id },
        data: {
          title,
          slug,
          description:
            body.description !== undefined
              ? body.description
              : body.content !== undefined
                ? body.content
                : (raw.description as string | null),
          status: body.status ? normalizeCourseStatus(body.status) : (raw.status as CourseStatus),
          seoTitle: body.seoTitle !== undefined ? body.seoTitle : (raw.seoTitle as string | null),
          seoDescription:
            body.seoDescription !== undefined
              ? body.seoDescription
              : (raw.seoDescription as string | null)
        }
      });
      return { item };
    }
    case "events": {
      const title = body.title ?? (raw.title as string);
      const slug = body.slug ? await uniqueSlug(body.slug, type, id) : (raw.slug as string);
      const data: Prisma.EventUpdateInput = {
        title,
        slug,
        description:
          body.description !== undefined
            ? body.description
            : body.content !== undefined
              ? body.content
              : (raw.description as string | null),
        status: body.status ? normalizeEventStatus(body.status) : (raw.status as EventStatus),
        seoTitle: body.seoTitle !== undefined ? body.seoTitle : (raw.seoTitle as string | null),
        seoDescription:
          body.seoDescription !== undefined
            ? body.seoDescription
            : (raw.seoDescription as string | null)
      };
      if (body.startDate) {
        const d = new Date(body.startDate);
        if (Number.isNaN(d.getTime())) throw httpError("Invalid startDate");
        data.startDate = d;
      }
      const item = await prisma.event.update({ where: { id }, data });
      return { item };
    }
    case "blog": {
      const title = body.title ?? (raw.title as string);
      const slug = body.slug ? await uniqueSlug(body.slug, type, id) : (raw.slug as string);
      const nextStatus = body.status ? normalizePostStatus(body.status) : (raw.status as PostStatus);
      const item = await prisma.blogPost.update({
        where: { id },
        data: {
          title,
          slug,
          content: body.content !== undefined ? (body.content ?? "") : (raw.content as string),
          excerpt:
            body.description !== undefined ? body.description : (raw.excerpt as string | null),
          status: nextStatus,
          publishedAt:
            nextStatus === "PUBLISHED"
              ? (raw.publishedAt as Date | null) ?? new Date()
              : nextStatus === "DRAFT"
                ? null
                : (raw.publishedAt as Date | null),
          seoTitle: body.seoTitle !== undefined ? body.seoTitle : (raw.seoTitle as string | null),
          seoDescription:
            body.seoDescription !== undefined
              ? body.seoDescription
              : (raw.seoDescription as string | null),
          seoKeyword:
            body.seoKeyword !== undefined ? body.seoKeyword : (raw.seoKeyword as string | null)
        }
      });
      return { item };
    }
    case "vaidyas": {
      const name = body.name ?? body.title ?? (raw.name as string);
      const slug = body.slug ? await uniqueSlug(body.slug, type, id) : (raw.slug as string);
      const isActive =
        body.status !== undefined
          ? body.status === "ACTIVE" || body.status === "PUBLISHED"
          : (raw.isActive as boolean);
      const item = await prisma.vaidya.update({
        where: { id },
        data: {
          name,
          slug,
          bio: body.bio !== undefined ? body.bio : body.content !== undefined ? body.content : (raw.bio as string | null),
          isActive,
          seoTitle: body.seoTitle !== undefined ? body.seoTitle : (raw.seoTitle as string | null),
          seoDescription:
            body.seoDescription !== undefined
              ? body.seoDescription
              : (raw.seoDescription as string | null)
        }
      });
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "mentors": {
      const name = body.name ?? body.title ?? (raw.name as string);
      const slug = body.slug ? await uniqueSlug(body.slug, type, id) : (raw.slug as string);
      const isActive =
        body.status !== undefined
          ? body.status === "ACTIVE" || body.status === "PUBLISHED"
          : (raw.isActive as boolean);
      const item = await prisma.mentor.update({
        where: { id },
        data: {
          name,
          slug,
          bio: body.bio !== undefined ? body.bio : body.content !== undefined ? body.content : (raw.bio as string | null),
          isActive,
          seoTitle: body.seoTitle !== undefined ? body.seoTitle : (raw.seoTitle as string | null),
          seoDescription:
            body.seoDescription !== undefined
              ? body.seoDescription
              : (raw.seoDescription as string | null)
        }
      });
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "retreats": {
      const title = body.title ?? (raw.title as string);
      const slug = body.slug ? await uniqueSlug(body.slug, type, id) : (raw.slug as string);
      const isActive =
        body.status !== undefined
          ? body.status === "ACTIVE" || body.status === "PUBLISHED"
          : (raw.isActive as boolean);
      const item = await prisma.retreat.update({
        where: { id },
        data: {
          title,
          slug,
          description:
            body.description !== undefined
              ? body.description
              : body.content !== undefined
                ? body.content
                : (raw.description as string | null),
          isActive,
          seoTitle: body.seoTitle !== undefined ? body.seoTitle : (raw.seoTitle as string | null),
          seoDescription:
            body.seoDescription !== undefined
              ? body.seoDescription
              : (raw.seoDescription as string | null)
        }
      });
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "offers": {
      const title = body.title ?? (raw.title as string);
      const slug = body.slug ? await uniqueSlug(body.slug, type, id) : (raw.slug as string);
      const isActive =
        body.status !== undefined
          ? body.status === "ACTIVE" || body.status === "PUBLISHED"
          : (raw.isActive as boolean);
      const item = await prisma.offer.update({
        where: { id },
        data: {
          title,
          slug,
          description:
            body.description !== undefined
              ? body.description
              : body.content !== undefined
                ? body.content
                : (raw.description as string | null),
          isActive,
          seoTitle: body.seoTitle !== undefined ? body.seoTitle : (raw.seoTitle as string | null),
          seoDescription:
            body.seoDescription !== undefined
              ? body.seoDescription
              : (raw.seoDescription as string | null)
        }
      });
      return { item: { ...item, status: statusFromBool(item.isActive) } };
    }
    case "testimonials": {
      const authorName = body.authorName ?? body.title ?? (raw.authorName as string);
      const slug = body.slug ? await uniqueSlug(body.slug, type, id) : (raw.slug as string);
      const isPublished =
        body.status !== undefined
          ? body.status === "PUBLISHED" || body.status === "ACTIVE"
          : (raw.isPublished as boolean);
      const item = await prisma.testimonial.update({
        where: { id },
        data: {
          authorName,
          slug,
          body: body.body !== undefined ? body.body : body.content !== undefined ? body.content : (raw.body as string | null),
          isPublished
        }
      });
      return {
        item: {
          ...item,
          title: item.authorName,
          status: statusFromBool(item.isPublished, "PUBLISHED")
        }
      };
    }
    default:
      throw httpError("Unknown content type", 404);
  }
}

export async function deleteContent(type: ContentType, id: string) {
  await getContent(type, id);

  switch (type) {
    case "pages":
      await prisma.cmsPage.update({ where: { id }, data: { status: "ARCHIVED" } });
      break;
    case "courses":
      await prisma.course.update({ where: { id }, data: { status: "ARCHIVED" } });
      break;
    case "events":
      await prisma.event.update({ where: { id }, data: { status: "CANCELLED" } });
      break;
    case "blog":
      await prisma.blogPost.update({ where: { id }, data: { status: "ARCHIVED" } });
      break;
    case "vaidyas":
      await prisma.vaidya.update({ where: { id }, data: { isActive: false } });
      break;
    case "mentors":
      await prisma.mentor.update({ where: { id }, data: { isActive: false } });
      break;
    case "retreats":
      await prisma.retreat.update({ where: { id }, data: { isActive: false } });
      break;
    case "offers":
      await prisma.offer.update({ where: { id }, data: { isActive: false } });
      break;
    case "testimonials":
      await prisma.testimonial.update({ where: { id }, data: { isPublished: false } });
      break;
    default:
      throw httpError("Unknown content type", 404);
  }

  return { message: "Content deactivated" };
}
