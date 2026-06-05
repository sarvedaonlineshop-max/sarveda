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
  teachers?: Array<{
    name: string;
    bio?: string | null;
    imageUrl?: string | null;
    designation?: string | null;
  }>;
  duration?: string | null;
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
