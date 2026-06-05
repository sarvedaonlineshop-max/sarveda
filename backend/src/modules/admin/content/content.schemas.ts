import { z } from "zod";

const optionalString = z.string().optional();
const nullableString = z.string().nullable().optional();

export const contentCreateSchema = z.object({
  title: optionalString,
  name: optionalString,
  authorName: optionalString,
  slug: optionalString,
  status: optionalString,
  content: nullableString,
  description: nullableString,
  bio: nullableString,
  body: nullableString,
  seoTitle: nullableString,
  seoDescription: nullableString,
  seoKeyword: nullableString,
  startDate: optionalString,
  imageUrl: nullableString,
  shortDescription: nullableString,
  mentorIds: z.array(z.string().uuid()).optional(),
  teachers: z
    .array(
      z.object({
        name: z.string(),
        bio: nullableString,
        imageUrl: nullableString,
        designation: nullableString
      })
    )
    .optional(),
  layoutTemplate: z.enum(["STANDARD", "SESSIONS", "CURRICULUM"]).optional(),
  durationHours: z.number().positive().nullable().optional(),
  duration: nullableString,
  sessions: z
    .array(
      z.object({
        sessionId: z.string(),
        name: z.string(),
        mentorId: nullableString,
        teacherName: nullableString,
        content: z.string(),
        scheduledAt: nullableString,
        scheduleNote: nullableString
      })
    )
    .optional(),
  curriculum: z
    .array(
      z.object({
        name: z.string(),
        hours: z.number().nullable().optional(),
        priceInr: z.number().int().nullable().optional(),
        priceUsd: z.number().nullable().optional(),
        startDate: nullableString,
        endDate: nullableString
      })
    )
    .optional(),
  courseStartDate: nullableString,
  courseEndDate: nullableString,
  videoUrl: nullableString,
  mode: nullableString,
  venue: nullableString,
  timings: nullableString,
  courseIncludes: nullableString,
  aboutTheCourse: nullableString,
  faqs: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
  schedule: z
    .array(
      z.object({
        startDate: nullableString,
        endDate: nullableString,
        mode: nullableString,
        location: nullableString,
        timings: nullableString,
        duration: nullableString
      })
    )
    .optional(),
  photoUrl: nullableString,
  expertise: nullableString,
  speciality: nullableString,
  isFree: z.boolean().optional(),
  priceInPaise: z.number().int().min(0).optional(),
  priceUsdCents: z.number().int().min(0).nullable().optional(),
  enrollmentMode: optionalString,
  checkoutVariantSku: nullableString
});

export const contentUpdateSchema = contentCreateSchema.partial();
