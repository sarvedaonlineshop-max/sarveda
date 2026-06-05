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
  duration: nullableString,
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
