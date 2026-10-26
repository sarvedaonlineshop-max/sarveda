export const CONTENT_TYPES = [
  "pages",
  "courses",
  "events",
  "blog",
  "vaidyas",
  "mentors",
  "retreats",
  "offers",
  "testimonials"
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

export type ContentListRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type ContentListResult = {
  items: ContentListRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type ContentCreateBody = {
  title?: string;
  name?: string;
  authorName?: string;
  slug?: string;
  status?: string;
  content?: string | null;
  description?: string | null;
  bio?: string | null;
  body?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeyword?: string | null;
  startDate?: string;
  imageUrl?: string | null;
  shortDescription?: string | null;
  mentorIds?: string[];
  teachers?: Array<{
    name: string;
    bio?: string | null;
    imageUrl?: string | null;
    designation?: string | null;
  }>;
  layoutTemplate?: string;
  durationHours?: number | null;
  duration?: string | null;
  sessions?: Array<{
    sessionId: string;
    name: string;
    mentorId?: string | null;
    teacherName?: string | null;
    content: string;
    scheduledAt?: string | null;
    scheduleNote?: string | null;
  }>;
  curriculum?: Array<{
    name: string;
    hours?: number | null;
    priceInr?: number | null;
    priceUsd?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  courseStartDate?: string | null;
  courseEndDate?: string | null;
  videoUrl?: string | null;
  mode?: string | null;
  venue?: string | null;
  timings?: string | null;
  courseIncludes?: string | null;
  aboutTheCourse?: string | null;
  faqs?: Array<{ question: string; answer: string }>;
  schedule?: Array<{
    startDate?: string | null;
    endDate?: string | null;
    mode?: string | null;
    location?: string | null;
    timings?: string | null;
    duration?: string | null;
  }>;
  photoUrl?: string | null;
  expertise?: string | null;
  speciality?: string | null;
  isFree?: boolean;
  priceInPaise?: number;
  priceUsdCents?: number | null;
  enrollmentMode?: string;
  checkoutVariantSku?: string | null;
};

export type ContentUpdateBody = Partial<ContentCreateBody>;
