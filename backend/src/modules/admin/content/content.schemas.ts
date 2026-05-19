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
  startDate: optionalString
});

export const contentUpdateSchema = contentCreateSchema.partial();
